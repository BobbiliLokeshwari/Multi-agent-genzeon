import {
  DEFAULT_POST_TYPE,
  DEFAULT_TONE,
  HEALTH_PATH,
  POST_TYPES,
  TONES,
  insightsQuerySchema,
  promptVersionParamsSchema,
  type ApiSuccess,
  type Catalog,
  type Insights,
  type PromptVersionDetail,
  type PromptVersionSummary,
} from "@studio/shared";
import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../deps";
import { AppError } from "../lib/errors";

/** Liveness + readiness in one: 200 when Postgres and Redis both answer. */
export function healthRoutes({ repo, redis }: AppDeps): FastifyPluginAsync {
  return async (app) => {
    app.get(HEALTH_PATH, { logLevel: "warn" }, async (_request, reply) => {
      const [database, cache] = await Promise.allSettled([repo.ping(), redis.ping()]);
      const up = (result: PromiseSettledResult<unknown>) => (result.status === "fulfilled" ? "up" : "down");
      const healthy = database.status === "fulfilled" && cache.status === "fulfilled";
      return reply.code(healthy ? 200 : 503).send({
        data: { status: healthy ? "ok" : "degraded", checks: { database: up(database), redis: up(cache) } },
      });
    });
  };
}

/** Everything the Generate form needs, so the web app never duplicates options or limits. */
export function catalogRoutes({ config, prompts }: AppDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/catalog", async (_request, reply): Promise<ApiSuccess<Catalog>> => {
      reply.header("cache-control", "no-cache");
      return {
        data: {
          tones: TONES,
          postTypes: POST_TYPES,
          promptVersions: await prompts.listVersions(),
          defaults: {
            tone: DEFAULT_TONE,
            postType: DEFAULT_POST_TYPE,
            promptVersion: config.prompts.defaultVersion,
          },
          limits: { topicMaxLength: config.limits.topicMaxLength },
        },
      };
    });
  };
}

export function insightsRoutes({ config, repo }: AppDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/insights", async (request): Promise<ApiSuccess<Insights>> => {
      const { tz } = insightsQuerySchema.parse(request.query);
      return {
        data: await repo.insights({
          timeZone: tz ?? config.insights.defaultTimeZone,
          trendDays: config.insights.trendDays,
        }),
      };
    });
  };
}

/** Read-only view of prompts/<version>/. Editing stays in Git, where changes are reviewed. */
export function promptRoutes({ config, prompts }: AppDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/prompts", async (): Promise<ApiSuccess<PromptVersionSummary[]>> => {
      const versions = await prompts.listVersions();
      const data = await Promise.all(
        versions.map(async (version) => ({
          version,
          isDefault: version === config.prompts.defaultVersion,
          files: await prompts.listFiles(version),
        })),
      );
      return { data };
    });

    app.get("/prompts/:version", async (request): Promise<ApiSuccess<PromptVersionDetail>> => {
      const { version } = promptVersionParamsSchema.parse(request.params);
      if (!(await prompts.hasVersion(version))) {
        throw new AppError("PROMPT_VERSION_NOT_FOUND", 404, `Prompt version "${version}" does not exist`);
      }
      return {
        data: {
          version,
          isDefault: version === config.prompts.defaultVersion,
          files: await prompts.readFiles(version),
        },
      };
    });
  };
}
