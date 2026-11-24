/**
 * Machine-readable codes. The API never sends user-facing prose: it sends a
 * code, and the web app maps each code to a translated message.
 */

export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "PROMPT_VERSION_NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "QUEUE_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Client-side only: the browser or the Next.js server could not reach the API at all. */
export const API_UNREACHABLE = "API_UNREACHABLE";
export type ClientErrorCode = ApiErrorCode | typeof API_UNREACHABLE;

/**
 * Problems recorded while a run executes. Most are warnings (the run carries
 * on with a fallback); WRITER_FAILED, ENQUEUE_FAILED and PIPELINE_ERROR end it.
 */
export const PIPELINE_ISSUE_CODES = [
  "RESEARCH_SEARCH_FAILED",
  "RESEARCH_SYNTHESIS_FAILED",
  "RESEARCH_SYNTHESIS_EMPTY",
  "WRITER_FAILED",
  "VALIDATOR_FAILED",
  "JUDGE_FAILED",
  "JUDGE_DISABLED",
  "ENQUEUE_FAILED",
  "PIPELINE_ERROR",
] as const;
export type PipelineIssueCode = (typeof PIPELINE_ISSUE_CODES)[number];

/** Message of any thrown value, for logs and issue details. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}
