import {
  GENERATION_JOB_NAME,
  STREAM_EVENTS,
  apiPaths,
  createGenerationBodySchema,
  createListGenerationsQuerySchema,
  describeError,
  generationParamsSchema,
  isTerminalStatus,
  type ApiSuccess,
  type GenerationDetail,
  type GenerationSummary,
  type Page,
  type StreamEndEvent,
} from "@studio/shared";
import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../deps";
import { AppError, notFound } from "../lib/errors";
import type { HubEvent } from "../lib/event-hub";
import { openEventStream } from "../lib/sse";

export function generationRoutes({ config, repo, queue, hub, prompts }: AppDeps): FastifyPluginAsync {
  const createBody = createGenerationBodySchema(config.limits);
  const listQuery = createListGenerationsQuerySchema(config.limits);

  return async (app) => {
    app.post(
      "/generations",
      { config: { rateLimit: { max: config.rateLimit.max, timeWindow: config.rateLimit.windowMs } } },
      async (request, reply) => {
        const body = createBody.parse(request.body);
        const promptVersion = body.promptVersion ?? config.prompts.defaultVersion;
        if (!(await prompts.hasVersion(promptVersion))) {
          throw new AppError("PROMPT_VERSION_NOT_FOUND", 422, `Prompt version "${promptVersion}" does not exist`);
        }

        const generation = await repo.create({
          topic: body.topic,
          tone: body.tone,
          postType: body.postType,
          promptVersion,
        });
        try {
          // jobId = row id makes enqueueing idempotent and links queue events to the row.
          await queue.add(GENERATION_JOB_NAME, { generationId: generation.id }, { jobId: generation.id });
        } catch (error) {
          request.log.error({ err: error, generationId: generation.id }, "Could not enqueue generation");
          await repo
            .fail(generation.id, { code: "ENQUEUE_FAILED", step: null, detail: describeError(error) })
            .catch((failError: unknown) => request.log.error({ err: failError }, "Could not mark generation failed"));
          throw new AppError("QUEUE_UNAVAILABLE", 503, "The job queue is unavailable; try again shortly");
        }

        const payload: ApiSuccess<GenerationSummary> = { data: generation };
        return reply.code(202).header("location", apiPaths.generation(generation.id)).send(payload);
      },
    );

    app.get("/generations", async (request): Promise<ApiSuccess<Page<GenerationSummary>>> => {
      return { data: await repo.list(listQuery.parse(request.query)) };
    });

    app.get("/generations/:id", async (request): Promise<ApiSuccess<GenerationDetail>> => {
      const { id } = generationParamsSchema.parse(request.params);
      const generation = await repo.findById(id);
      if (!generation) throw notFound("Generation");
      return { data: generation };
    });

    /**
     * Live progress over Server-Sent Events:
     *   snapshot (full state) → step… → snapshot (final) → end
     * Subscribes before reading Postgres so no event can slip between the two.
     */
    app.get("/generations/:id/events", async (request, reply) => {
      const { id } = generationParamsSchema.parse(request.params);

      const early: HubEvent[] = [];
      let handle: ((event: HubEvent) => void) | null = null;
      const unsubscribe = hub.subscribe(id, (event) => (handle ? handle(event) : early.push(event)));

      let snapshot: GenerationDetail | null;
      try {
        snapshot = await repo.findById(id);
      } catch (error) {
        unsubscribe();
        throw error;
      }
      if (!snapshot) {
        unsubscribe();
        throw notFound("Generation");
      }

      const stream = openEventStream(reply, config.sse);
      stream.onClose(unsubscribe);

      const endIfFinished = (detail: GenerationDetail): boolean => {
        if (!isTerminalStatus(detail.status)) return false;
        stream.send(STREAM_EVENTS.end, { status: detail.status } satisfies StreamEndEvent);
        stream.close();
        return true;
      };

      stream.send(STREAM_EVENTS.snapshot, snapshot);
      if (endIfFinished(snapshot)) return;

      // Serialise refreshes so snapshots always arrive in order.
      let refreshing = Promise.resolve();
      handle = (event) => {
        if (event.type === "step") {
          stream.send(STREAM_EVENTS.step, event.payload);
          return;
        }
        refreshing = refreshing.then(async () => {
          try {
            const latest = await repo.findById(id);
            if (!latest) return stream.close();
            stream.send(STREAM_EVENTS.snapshot, latest);
            endIfFinished(latest); // Not terminal means BullMQ is about to retry: keep streaming.
          } catch (error) {
            request.log.error({ err: error, generationId: id }, "Could not refresh generation for stream");
            stream.close();
          }
        });
      };
      for (const event of early.splice(0)) handle(event);
    });
  };
}
