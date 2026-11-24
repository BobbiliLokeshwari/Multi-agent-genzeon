import { createGenerationRepository, createPrismaClient } from "@studio/db";
import { PromptStore } from "@studio/pipeline/prompts";
import type { GenerationJobData } from "@studio/shared";
import { onShutdown } from "@studio/shared/node";
import { Queue } from "bullmq";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { GenerationEventHub } from "./lib/event-hub";
import { connectCommandRedis, createBlockingRedis } from "./lib/redis";

const config = loadConfig();

const prisma = createPrismaClient({ url: config.databaseUrl });
const repo = createGenerationRepository(prisma);

const prompts = new PromptStore(config.prompts.dir, { cache: config.prompts.cache });
// Fail at boot, not on the first request, if the default prompts are missing or invalid.
await prompts.load(config.prompts.defaultVersion);

const redis = await connectCommandRedis(config.redisUrl);
const queue = new Queue<GenerationJobData>(config.queue.name, {
  connection: redis,
  prefix: config.queue.prefix,
  defaultJobOptions: {
    attempts: config.queue.attempts,
    backoff: { type: "exponential", delay: config.queue.backoffMs },
    // Postgres is the system of record, so Redis only keeps a bounded tail of jobs.
    removeOnComplete: { count: config.queue.keepCompleted },
    removeOnFail: { count: config.queue.keepFailed },
  },
});
const hub = await GenerationEventHub.connect({
  queueName: config.queue.name,
  prefix: config.queue.prefix,
  connection: createBlockingRedis(config.redisUrl),
});

const app = await buildApp({ config, repo, queue, hub, prompts, redis, rateLimitRedis: redis });
app.addHook("onClose", async () => {
  await hub.close();
  await queue.close();
  redis.disconnect();
  await prisma.$disconnect();
});

await app.listen({ host: config.server.host, port: config.server.port });
onShutdown(() => app.close(), { timeoutMs: config.shutdownTimeoutMs, logger: app.log });
