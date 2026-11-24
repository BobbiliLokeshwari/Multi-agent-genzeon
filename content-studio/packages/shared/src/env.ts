/**
 * Environment parsing helpers. Every app validates its own variables at
 * startup and refuses to boot with a readable list of what is wrong.
 */
import { z } from "zod";
import { PROMPT_VERSION_PATTERN } from "./catalog";

export const envInt = (fallback: number, bounds: { min?: number; max?: number } = {}) =>
  z.coerce
    .number()
    .int()
    .min(bounds.min ?? Number.MIN_SAFE_INTEGER)
    .max(bounds.max ?? Number.MAX_SAFE_INTEGER)
    .default(fallback);

export const envNumber = (fallback: number, bounds: { min?: number; max?: number } = {}) =>
  z.coerce
    .number()
    .min(bounds.min ?? -Number.MAX_VALUE)
    .max(bounds.max ?? Number.MAX_VALUE)
    .default(fallback);

export const envBool = (fallback: boolean) => z.stringbool().default(fallback);

/** Comma-separated list, e.g. `http://localhost:3000,https://studio.example.com`. */
export const envList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).min(1));

export const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
export const nodeEnvSchema = z.enum(["development", "test", "production"]);

/**
 * Parses `env` with `schema`. Empty strings count as unset, so `KEY=` in a
 * .env file falls back to the default instead of failing validation.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  label: string,
  env: NodeJS.ProcessEnv = process.env,
): z.output<T> {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = schema.safeParse(present);
  if (!result.success) {
    throw new Error(`Invalid ${label} configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** BCP-47 locale tag that this runtime's Intl understands. */
export const localeSchema = z.string().refine(
  (value) => {
    try {
      return Intl.getCanonicalLocales(value).length > 0;
    } catch {
      return false;
    }
  },
  { message: "Not a valid BCP-47 locale" },
);

/**
 * Variables both back-end processes (api, worker) read. Defining them once
 * keeps the two from drifting apart.
 */
export const backendEnvShape = {
  NODE_ENV: nodeEnvSchema.default("development"),
  LOG_LEVEL: logLevelSchema.default("info"),
  LOG_PRETTY: envBool(false),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  QUEUE_NAME: z.string().min(1).default("generations"),
  QUEUE_PREFIX: z.string().min(1).default("studio"),
  PROMPTS_DIR: z.string().min(1),
  PROMPT_VERSION: z.string().regex(PROMPT_VERSION_PATTERN).default("v1"),
  PROMPT_CACHE_ENABLED: envBool(true),
  SHUTDOWN_TIMEOUT_MS: envInt(10_000, { min: 1_000 }),
};
