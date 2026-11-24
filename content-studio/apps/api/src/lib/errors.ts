import { PromptVersionNotFoundError } from "@studio/pipeline/prompts";
import type { ApiErrorBody, ApiErrorCode, ApiFieldIssue } from "@studio/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/** An error the client is meant to see: a stable code, an HTTP status and a short message. */
export class AppError extends Error {
  override readonly name = "AppError";
  constructor(
    readonly code: ApiErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: ApiFieldIssue[],
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", 404, `${what} not found`);

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  400: "BAD_REQUEST",
  404: "NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "BAD_REQUEST",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE",
};

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiFieldIssue[],
): FastifyReply {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return reply.status(statusCode).send(body);
}

/** Maps every error to the standard envelope. Internals never leak to the client. */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    return sendError(reply, error.statusCode, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    return sendError(reply, 400, "VALIDATION_ERROR", "Request validation failed", details);
  }
  if (error instanceof PromptVersionNotFoundError) {
    return sendError(reply, 404, "PROMPT_VERSION_NOT_FOUND", error.message);
  }
  const status = "statusCode" in error ? error.statusCode : undefined;
  if (status && status >= 400 && status < 500) {
    return sendError(reply, status, CODE_BY_STATUS[status] ?? "BAD_REQUEST", error.message);
  }
  request.log.error({ err: error }, "Unhandled error");
  return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
}
