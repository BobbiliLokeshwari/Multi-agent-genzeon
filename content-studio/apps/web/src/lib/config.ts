import "server-only";
import { envInt, isValidTimeZone, parseEnv } from "@studio/shared";
import { z } from "zod";

const schema = z.object({
  /** API origin as the browser sees it (live updates and form posts). */
  PUBLIC_API_URL: z.url(),
  /** API origin as the Next.js server sees it; defaults to PUBLIC_API_URL. */
  API_INTERNAL_URL: z.url().optional(),
  APP_TIME_ZONE: z.string().refine(isValidTimeZone, { message: "Unknown IANA time zone" }).default("UTC"),
  HISTORY_PAGE_SIZE: envInt(20, { min: 1 }),
  RECENT_RUNS_LIMIT: envInt(5, { min: 1 }),
});

export interface WebConfig {
  publicApiUrl: string;
  internalApiUrl: string;
  timeZone: string;
  historyPageSize: number;
  recentRunsLimit: number;
}

let cached: WebConfig | undefined;

/**
 * Read at request time, not build time, so one build runs in any environment.
 * (That is also why the browser-facing URL is passed down as a prop instead of
 * being baked in with a NEXT_PUBLIC_ variable.)
 */
export function getConfig(): WebConfig {
  if (!cached) {
    const raw = parseEnv(schema, "web");
    cached = {
      publicApiUrl: raw.PUBLIC_API_URL,
      internalApiUrl: raw.API_INTERNAL_URL ?? raw.PUBLIC_API_URL,
      timeZone: raw.APP_TIME_ZONE,
      historyPageSize: raw.HISTORY_PAGE_SIZE,
      recentRunsLimit: raw.RECENT_RUNS_LIMIT,
    };
  }
  return cached;
}
