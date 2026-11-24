import { SEARCH_DEPTHS } from "@studio/pipeline";
import { backendEnvShape, envBool, envInt, envNumber, localeSchema, parseEnv } from "@studio/shared";
import { resolveWorkspacePath } from "@studio/shared/node";
import { z } from "zod";

const schema = z.object({
  ...backendEnvShape,

  WORKER_CONCURRENCY: envInt(2, { min: 1, max: 50 }),
  WORKER_LOCK_DURATION_MS: envInt(60_000, { min: 5_000 }),
  WORKER_STALLED_INTERVAL_MS: envInt(30_000, { min: 5_000 }),
  WORKER_MAX_STALLED_COUNT: envInt(1, { min: 0 }),

  // Agents (research, writer, validator). Any OpenAI-compatible endpoint works.
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z.url(),
  GEMINI_MODEL: z.string().min(1),
  AGENT_TEMPERATURE: envNumber(0.7, { min: 0, max: 2 }),
  AGENT_MAX_TOKENS: envInt(8_192, { min: 256 }),

  // Judge. Each value falls back to the agent's, so set JUDGE_MODEL (and optionally
  // JUDGE_BASE_URL / JUDGE_API_KEY) to make the judge genuinely independent.
  JUDGE_ENABLED: envBool(true),
  JUDGE_MODEL: z.string().min(1).optional(),
  JUDGE_BASE_URL: z.url().optional(),
  JUDGE_API_KEY: z.string().min(1).optional(),
  JUDGE_TEMPERATURE: envNumber(0.1, { min: 0, max: 2 }),
  JUDGE_MAX_TOKENS: envInt(4_096, { min: 256 }),

  LLM_TIMEOUT_MS: envInt(120_000, { min: 1_000 }),
  LLM_MAX_RETRIES: envInt(2, { min: 0, max: 10 }),

  TAVILY_API_KEY: z.string().min(1),
  RESEARCH_SEARCH_DEPTH: z.enum(SEARCH_DEPTHS).default("advanced"),
  RESEARCH_MAX_RESULTS: envInt(3, { min: 1, max: 20 }),
  RESEARCH_TIMEOUT_MS: envInt(60_000, { min: 1_000 }),

  MEMORY_TOP_K: envInt(3, { min: 0 }),
  MEMORY_MIN_OVERLAP: envInt(1, { min: 0 }),
  MEMORY_SNIPPET_CHARS: envInt(400, { min: 1 }),
  MEMORY_CANDIDATE_LIMIT: envInt(500, { min: 1 }),

  CONTENT_LOCALE: localeSchema.default("en"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = parseEnv(schema, "worker", env);
  const judgeBaseUrl = raw.JUDGE_BASE_URL ?? raw.GEMINI_BASE_URL;
  const judgeApiKey = raw.JUDGE_API_KEY ?? raw.GEMINI_API_KEY;
  return {
    nodeEnv: raw.NODE_ENV,
    log: { level: raw.LOG_LEVEL, pretty: raw.LOG_PRETTY },
    databaseUrl: raw.DATABASE_URL,
    redisUrl: raw.REDIS_URL,
    queue: { name: raw.QUEUE_NAME, prefix: raw.QUEUE_PREFIX },
    worker: {
      concurrency: raw.WORKER_CONCURRENCY,
      lockDurationMs: raw.WORKER_LOCK_DURATION_MS,
      stalledIntervalMs: raw.WORKER_STALLED_INTERVAL_MS,
      maxStalledCount: raw.WORKER_MAX_STALLED_COUNT,
    },
    prompts: {
      dir: resolveWorkspacePath(raw.PROMPTS_DIR),
      defaultVersion: raw.PROMPT_VERSION,
      cache: raw.PROMPT_CACHE_ENABLED,
    },
    llm: { timeoutMs: raw.LLM_TIMEOUT_MS, maxRetries: raw.LLM_MAX_RETRIES },
    agent: {
      baseURL: raw.GEMINI_BASE_URL,
      apiKey: raw.GEMINI_API_KEY,
      model: raw.GEMINI_MODEL,
      temperature: raw.AGENT_TEMPERATURE,
      maxTokens: raw.AGENT_MAX_TOKENS,
    },
    judge: raw.JUDGE_ENABLED
      ? {
          baseURL: judgeBaseUrl,
          apiKey: judgeApiKey,
          model: raw.JUDGE_MODEL ?? raw.GEMINI_MODEL,
          temperature: raw.JUDGE_TEMPERATURE,
          maxTokens: raw.JUDGE_MAX_TOKENS,
          /** True when the judge can reuse the agents' HTTP client. */
          sharesEndpoint: judgeBaseUrl === raw.GEMINI_BASE_URL && judgeApiKey === raw.GEMINI_API_KEY,
        }
      : null,
    research: {
      apiKey: raw.TAVILY_API_KEY,
      searchDepth: raw.RESEARCH_SEARCH_DEPTH,
      maxResults: raw.RESEARCH_MAX_RESULTS,
      timeoutMs: raw.RESEARCH_TIMEOUT_MS,
    },
    memory: {
      topK: raw.MEMORY_TOP_K,
      minOverlap: raw.MEMORY_MIN_OVERLAP,
      snippetChars: raw.MEMORY_SNIPPET_CHARS,
      candidateLimit: raw.MEMORY_CANDIDATE_LIMIT,
    },
    contentLocale: raw.CONTENT_LOCALE,
    shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
  };
}

export type WorkerConfig = ReturnType<typeof loadConfig>;
