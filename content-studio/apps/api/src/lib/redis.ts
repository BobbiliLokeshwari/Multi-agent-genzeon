import { Redis, type RedisOptions } from "ioredis";

/**
 * Connection used for normal commands (enqueueing, rate limiting, health).
 * No offline queue: if Redis is down, requests fail at once with a 503
 * instead of hanging until it comes back.
 */
export async function connectCommandRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();
  return redis;
}

/** BullMQ's blocking readers (QueueEvents) need their own connection with unlimited retries. */
export function createBlockingRedis(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, ...options });
}
