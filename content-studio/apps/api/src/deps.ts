import type { GenerationRepository } from "@studio/db";
import type { PromptStore } from "@studio/pipeline/prompts";
import type { GenerationJobData } from "@studio/shared";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { ApiConfig } from "./config";
import type { GenerationEventHub } from "./lib/event-hub";

/** Everything a route needs, injected so routes are testable without real infrastructure. */
export interface AppDeps {
  config: ApiConfig;
  repo: GenerationRepository;
  queue: Pick<Queue<GenerationJobData>, "add">;
  hub: Pick<GenerationEventHub, "subscribe">;
  prompts: Pick<PromptStore, "listVersions" | "hasVersion" | "listFiles" | "readFiles">;
  redis: Pick<Redis, "ping">;
  /** Shared rate-limit counters across API instances; in-process counters when omitted. */
  rateLimitRedis?: Redis;
}
