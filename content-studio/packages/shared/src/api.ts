/**
 * The HTTP and queue contract between web, api and worker. Paths are built
 * here so no app spells a URL by hand.
 */

export const API_PREFIX = "/v1";
export const HEALTH_PATH = "/health";

export const apiPaths = {
  catalog: () => `${API_PREFIX}/catalog`,
  generations: () => `${API_PREFIX}/generations`,
  generation: (id: string) => `${API_PREFIX}/generations/${encodeURIComponent(id)}`,
  generationEvents: (id: string) => `${API_PREFIX}/generations/${encodeURIComponent(id)}/events`,
  insights: () => `${API_PREFIX}/insights`,
  prompts: () => `${API_PREFIX}/prompts`,
  promptVersion: (version: string) => `${API_PREFIX}/prompts/${encodeURIComponent(version)}`,
} as const;

/** Server-Sent Event names on GET /v1/generations/:id/events. */
export const STREAM_EVENTS = {
  /** Full GenerationDetail. Sent on connect and again when the run finishes. */
  snapshot: "snapshot",
  /** A StepEvent: one pipeline node finished. */
  step: "step",
  /** A StreamEndEvent. The server closes the stream right after it. */
  end: "end",
} as const;

/** BullMQ job name. The queue name itself is configuration (QUEUE_NAME). */
export const GENERATION_JOB_NAME = "generate-post";

/** The job payload is just a pointer; Postgres holds the input. */
export interface GenerationJobData {
  generationId: string;
}

/** Joins a base URL (which may carry a path prefix) with an API path. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
