import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { API_PREFIX } from "@studio/shared";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config";
import type { AppDeps } from "./deps";
import { AppError, errorHandler, sendError } from "./lib/errors";
import { generationRoutes } from "./routes/generations";
import { catalogRoutes, healthRoutes, insightsRoutes, promptRoutes } from "./routes/meta";

export function loggerOptions(config: ApiConfig) {
  return {
    level: config.log.level,
    redact: ["req.headers.authorization", "req.headers.cookie"],
    ...(config.log.pretty
      ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } }
      : {}),
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: loggerOptions(config),
    bodyLimit: config.server.bodyLimit,
    trustProxy: config.server.trustProxy,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.server.corsOrigins,
    methods: ["GET", "POST"],
    exposedHeaders: ["location"],
  });
  await app.register(rateLimit, {
    global: false, // Only routes that opt in (creating a generation) are limited.
    ...(deps.rateLimitRedis ? { redis: deps.rateLimitRedis } : {}),
    nameSpace: `${config.queue.prefix}:rate-limit:`,
    skipOnError: true,
    errorResponseBuilder: (_request, context) =>
      new AppError("RATE_LIMITED", context.statusCode, `Rate limit exceeded, retry in ${context.after}`),
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) =>
    sendError(reply, 404, "NOT_FOUND", `Route ${request.method} ${request.url} not found`),
  );

  await app.register(healthRoutes(deps));
  await app.register(
    async (v1) => {
      await v1.register(catalogRoutes(deps));
      await v1.register(generationRoutes(deps));
      await v1.register(insightsRoutes(deps));
      await v1.register(promptRoutes(deps));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
