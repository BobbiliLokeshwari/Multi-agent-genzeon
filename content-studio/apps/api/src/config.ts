import {
  backendEnvShape,
  envBool,
  envInt,
  envList,
  isValidTimeZone,
  parseEnv,
} from "@studio/shared";
import { resolveWorkspacePath } from "@studio/shared/node";
import { z } from "zod";

const schema = z
  .object({
    ...backendEnvShape,
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: envInt(4000, { min: 1, max: 65_535 }),
    /** Set true when running behind a reverse proxy so request.ip comes from X-Forwarded-For. */
    TRUST_PROXY: envBool(false),
    CORS_ORIGINS: envList(z.url()),
    BODY_LIMIT_BYTES: envInt(16_384, { min: 1_024 }),
    QUEUE_JOB_ATTEMPTS: envInt(1, { min: 1, max: 10 }),
    QUEUE_BACKOFF_MS: envInt(5_000, { min: 0 }),
    QUEUE_KEEP_COMPLETED: envInt(1_000, { min: 0 }),
    QUEUE_KEEP_FAILED: envInt(5_000, { min: 0 }),
    TOPIC_MAX_LENGTH: envInt(500, { min: 1 }),
    SEARCH_MAX_LENGTH: envInt(200, { min: 1 }),
    PAGE_SIZE_DEFAULT: envInt(20, { min: 1 }),
    PAGE_SIZE_MAX: envInt(100, { min: 1 }),
    RATE_LIMIT_MAX: envInt(10, { min: 1 }),
    RATE_LIMIT_WINDOW_MS: envInt(60_000, { min: 1_000 }),
    SSE_HEARTBEAT_MS: envInt(15_000, { min: 1_000 }),
    SSE_RETRY_MS: envInt(3_000, { min: 100 }),
    INSIGHTS_TREND_DAYS: envInt(30, { min: 1, max: 366 }),
    APP_TIME_ZONE: z.string().refine(isValidTimeZone, { message: "Unknown IANA time zone" }).default("UTC"),
  })
  .refine((env) => env.PAGE_SIZE_DEFAULT <= env.PAGE_SIZE_MAX, {
    message: "must not exceed PAGE_SIZE_MAX",
    path: ["PAGE_SIZE_DEFAULT"],
  });

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = parseEnv(schema, "api", env);
  return {
    nodeEnv: raw.NODE_ENV,
    log: { level: raw.LOG_LEVEL, pretty: raw.LOG_PRETTY },
    server: {
      host: raw.API_HOST,
      port: raw.API_PORT,
      trustProxy: raw.TRUST_PROXY,
      corsOrigins: raw.CORS_ORIGINS,
      bodyLimit: raw.BODY_LIMIT_BYTES,
    },
    databaseUrl: raw.DATABASE_URL,
    redisUrl: raw.REDIS_URL,
    queue: {
      name: raw.QUEUE_NAME,
      prefix: raw.QUEUE_PREFIX,
      attempts: raw.QUEUE_JOB_ATTEMPTS,
      backoffMs: raw.QUEUE_BACKOFF_MS,
      keepCompleted: raw.QUEUE_KEEP_COMPLETED,
      keepFailed: raw.QUEUE_KEEP_FAILED,
    },
    prompts: {
      dir: resolveWorkspacePath(raw.PROMPTS_DIR),
      defaultVersion: raw.PROMPT_VERSION,
      cache: raw.PROMPT_CACHE_ENABLED,
    },
    limits: {
      topicMaxLength: raw.TOPIC_MAX_LENGTH,
      searchMaxLength: raw.SEARCH_MAX_LENGTH,
      pageSizeDefault: raw.PAGE_SIZE_DEFAULT,
      pageSizeMax: raw.PAGE_SIZE_MAX,
    },
    rateLimit: { max: raw.RATE_LIMIT_MAX, windowMs: raw.RATE_LIMIT_WINDOW_MS },
    sse: { heartbeatMs: raw.SSE_HEARTBEAT_MS, retryMs: raw.SSE_RETRY_MS },
    insights: { trendDays: raw.INSIGHTS_TREND_DAYS, defaultTimeZone: raw.APP_TIME_ZONE },
    shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
  };
}

export type ApiConfig = ReturnType<typeof loadConfig>;
