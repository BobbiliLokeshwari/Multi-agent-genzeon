import { createGenerationRepository, createPrismaClient } from "@studio/db";
import {
  createChatClient,
  createPipeline,
  createTavilyResearcher,
  PromptStore,
  type MemoryStore,
} from "@studio/pipeline";
import { describeError, type GenerationJobData } from "@studio/shared";
import { onShutdown } from "@studio/shared/node";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";
import { loadConfig } from "./config";
import { createProcessor } from "./processor";

const config = loadConfig();
const logger = pino({
  level: config.log.level,
  base: { service: "worker" },
  ...(config.log.pretty
    ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});

const prisma = createPrismaClient({ url: config.databaseUrl });
const repo = createGenerationRepository(prisma);

const prompts = new PromptStore(config.prompts.dir, { cache: config.prompts.cache });
await prompts.load(config.prompts.defaultVersion); // Fail at boot if the prompts are broken.

const llmOptions = { timeoutMs: config.llm.timeoutMs, maxRetries: config.llm.maxRetries };
const agentClient = createChatClient({ ...llmOptions, baseURL: config.agent.baseURL, apiKey: config.agent.apiKey });
const judgeClient = !config.judge
  ? null
  : config.judge.sharesEndpoint
    ? agentClient
    : createChatClient({ ...llmOptions, baseURL: config.judge.baseURL, apiKey: config.judge.apiKey });

const memory: MemoryStore = {
  findRelevant: (topic, options) =>
    config.memory.topK === 0
      ? Promise.resolve([])
      : repo.findMemory(topic, { ...options, candidateLimit: config.memory.candidateLimit }),
  save: (run) => repo.complete(run.runId, run),
};

const pipeline = createPipeline({
  prompts,
  agent: {
    client: agentClient,
    model: config.agent.model,
    temperature: config.agent.temperature,
    maxTokens: config.agent.maxTokens,
  },
  judge:
    config.judge && judgeClient
      ? {
          client: judgeClient,
          model: config.judge.model,
          temperature: config.judge.temperature,
          maxTokens: config.judge.maxTokens,
        }
      : null,
  researcher: createTavilyResearcher(config.research),
  memory,
  settings: {
    memory: {
      topK: config.memory.topK,
      minOverlap: config.memory.minOverlap,
      snippetChars: config.memory.snippetChars,
    },
    contentLocale: config.contentLocale,
  },
});

const worker = new Worker<GenerationJobData>(
  config.queue.name,
  createProcessor({
    repo,
    pipeline,
    models: { agent: config.agent.model, judge: config.judge?.model ?? null },
    logger,
  }),
  {
    // Workers block on Redis, so BullMQ requires maxRetriesPerRequest: null.
    connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }),
    prefix: config.queue.prefix,
    concurrency: config.worker.concurrency,
    lockDuration: config.worker.lockDurationMs,
    stalledInterval: config.worker.stalledIntervalMs,
    maxStalledCount: config.worker.maxStalledCount,
  },
);

worker.on("ready", () =>
  logger.info(
    { queue: config.queue.name, concurrency: config.worker.concurrency, model: config.agent.model },
    "Worker ready",
  ),
);
worker.on("error", (error) => logger.error({ err: error }, "Worker error"));
// Safety net for jobs that died without reaching the processor's catch (e.g. stalled too often).
worker.on("failed", (job, error) => {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  repo
    .fail(job.data.generationId, { code: "PIPELINE_ERROR", step: null, detail: describeError(error) })
    .catch((failError: unknown) => logger.error({ err: failError }, "Could not mark generation failed"));
});

onShutdown(
  async () => {
    await worker.close(); // Lets in-flight jobs finish (bounded by SHUTDOWN_TIMEOUT_MS).
    await prisma.$disconnect();
  },
  { timeoutMs: config.shutdownTimeoutMs, logger },
);
