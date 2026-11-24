import {
  API_UNREACHABLE,
  joinUrl,
  type ApiErrorBody,
  type ApiFieldIssue,
  type ApiSuccess,
  type ClientErrorCode,
} from "@studio/shared";

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    message: string,
    readonly details: ApiFieldIssue[] = [],
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  cache?: RequestCache;
  signal?: AbortSignal;
}

/** Fetches an API path and unwraps the `{ data }` / `{ error }` envelope. */
export async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(joinUrl(baseUrl, path));
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    throw new ApiError(API_UNREACHABLE, 0, error instanceof Error ? error.message : String(error));
  }

  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiErrorBody | null;
  if (response.ok && body && "data" in body) return body.data;
  const error = body && "error" in body ? body.error : null;
  throw new ApiError(
    error?.code ?? "INTERNAL_ERROR",
    response.status,
    error?.message ?? response.statusText,
    error?.details,
  );
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Turns a rejected API call into a value, so a page can render an inline error state. */
export async function attempt<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error };
    throw error;
  }
}
