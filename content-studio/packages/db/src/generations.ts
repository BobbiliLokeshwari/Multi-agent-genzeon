import { GenerationStatus, type Prisma, type PrismaClient } from "@prisma/client";
import {
  GENERATION_STATUSES,
  rankByOverlap,
  tokenizeTopic,
  type GenerationDetail,
  type GenerationFailure,
  type GenerationSummary,
  type Insights,
  type InsightsGroup,
  type JudgeData,
  type ListGenerationsQuery,
  type Page,
  type PipelineIssue,
  type PostData,
  type ResearchData,
  type StepEvent,
  type ValidationData,
} from "@studio/shared";
import { summarySelect, toDetail, toJson, toSummary } from "./mappers";

export interface CreateGenerationInput {
  topic: string;
  tone: string;
  postType: string;
  promptVersion: string;
}

export interface RunInput {
  id: string;
  status: GenerationStatus;
  topic: string;
  tone: string;
  postType: string;
  promptVersion: string;
}

export interface CompletedResult {
  research: ResearchData;
  post: PostData;
  validation: ValidationData;
  judge: JudgeData;
  issues: PipelineIssue[];
}

export interface MemoryRow {
  topic: string;
  tone: string;
  postContent: string;
  validatorScore: number | null;
  judgeScore: number | null;
}

const ACTIVE_STATUSES = [GenerationStatus.QUEUED, GenerationStatus.RUNNING];

interface TrendRow {
  day: string;
  count: number;
  avg_validator: number | null;
  avg_judge: number | null;
}

interface GapRow {
  id: string;
  topic: string;
  validator_score: number;
  judge_score: number;
  gap: number;
}

export function createGenerationRepository(prisma: PrismaClient) {
  return {
    async create(input: CreateGenerationInput): Promise<GenerationSummary> {
      const row = await prisma.generation.create({
        data: { ...input, topicTokens: tokenizeTopic(input.topic) },
        select: summarySelect,
      });
      return toSummary(row);
    },

    async findById(id: string): Promise<GenerationDetail | null> {
      const row = await prisma.generation.findUnique({ where: { id } });
      return row ? toDetail(row) : null;
    },

    findRunInput(id: string): Promise<RunInput | null> {
      return prisma.generation.findUnique({
        where: { id },
        select: { id: true, status: true, topic: true, tone: true, postType: true, promptVersion: true },
      });
    },

    /** Keyset pagination on (createdAt, id): stable and index-backed, unlike OFFSET. */
    async list(query: ListGenerationsQuery): Promise<Page<GenerationSummary>> {
      const where: Prisma.GenerationWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.tone ? { tone: query.tone } : {}),
        ...(query.postType ? { postType: query.postType } : {}),
        ...(query.q ? { topic: { contains: query.q, mode: "insensitive" } } : {}),
      };
      const rows = await prisma.generation.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > query.limit;
      const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toSummary);
      return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
    },

    async markRunning(
      id: string,
      run: { attempt: number; agentModel: string; judgeModel: string | null },
    ): Promise<void> {
      await prisma.generation.update({
        where: { id },
        data: {
          status: GenerationStatus.RUNNING,
          attempts: run.attempt,
          agentModel: run.agentModel,
          judgeModel: run.judgeModel,
          startedAt: new Date(),
          currentStep: null,
          failureCode: null,
          failureStep: null,
          failureDetail: null,
        },
      });
    },

    /** Persists one finished step so a page refresh mid-run shows everything so far. */
    async saveStep(id: string, event: StepEvent): Promise<void> {
      const data: Prisma.GenerationUpdateInput = {
        currentStep: event.step,
        issues: toJson(event.issues),
      };
      switch (event.step) {
        case "research":
          data.research = toJson(event.data);
          break;
        case "write":
          if (event.data) {
            data.post = toJson(event.data);
            data.postContent = event.data.content;
            data.hook = event.data.hook;
          }
          break;
        case "validate":
          data.validation = toJson(event.data);
          data.validatorScore = event.data.score;
          break;
        case "judge":
          data.judge = toJson(event.data);
          data.judgeScore = event.data.overall;
          break;
        case "memory":
          break;
      }
      await prisma.generation.update({ where: { id }, data });
    },

    /** The pipeline's memory node: one atomic write that makes the run visible to memory. */
    async complete(id: string, result: CompletedResult): Promise<void> {
      await prisma.generation.update({
        where: { id },
        data: {
          status: GenerationStatus.SUCCEEDED,
          research: toJson(result.research),
          post: toJson(result.post),
          postContent: result.post.content,
          hook: result.post.hook,
          validation: toJson(result.validation),
          validatorScore: result.validation.score,
          judge: toJson(result.judge),
          judgeScore: result.judge.overall,
          issues: toJson(result.issues),
          finishedAt: new Date(),
        },
      });
    },

    /** Marks a run failed unless it already finished. Returns false if nothing changed. */
    async fail(id: string, failure: GenerationFailure, issues?: PipelineIssue[]): Promise<boolean> {
      const { count } = await prisma.generation.updateMany({
        where: { id, status: { in: ACTIVE_STATUSES } },
        data: {
          status: GenerationStatus.FAILED,
          failureCode: failure.code,
          failureStep: failure.step,
          failureDetail: failure.detail,
          finishedAt: new Date(),
          ...(issues ? { issues: toJson(issues) } : {}),
        },
      });
      return count > 0;
    },

    /**
     * Past successful posts that share words with `topic`. The GIN index on
     * topic_tokens narrows candidates in SQL; exact ranking happens in memory.
     */
    async findMemory(
      topic: string,
      options: { limit: number; minOverlap: number; candidateLimit: number },
    ): Promise<MemoryRow[]> {
      const tokens = tokenizeTopic(topic);
      if (options.minOverlap > 0 && tokens.length === 0) return [];
      const candidates = await prisma.generation.findMany({
        where: {
          status: GenerationStatus.SUCCEEDED,
          postContent: { not: null },
          ...(options.minOverlap > 0 ? { topicTokens: { hasSome: tokens } } : {}),
        },
        select: {
          topic: true,
          topicTokens: true,
          tone: true,
          postContent: true,
          validatorScore: true,
          judgeScore: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: options.candidateLimit,
      });
      return rankByOverlap(tokens, candidates, options).map((row) => ({
        topic: row.topic,
        tone: row.tone,
        postContent: row.postContent ?? "",
        validatorScore: row.validatorScore,
        judgeScore: row.judgeScore,
      }));
    },

    /** Aggregates run in Postgres, in parallel; only small result sets come back. */
    async insights(options: { timeZone: string; trendDays: number }): Promise<Insights> {
      const succeeded = { status: GenerationStatus.SUCCEEDED };
      const groupArgs = {
        where: succeeded,
        _count: { _all: true },
        _avg: { validatorScore: true, judgeScore: true },
      } as const;

      const [byStatus, averages, byTone, byPostType, trendRows, gapRows] = await Promise.all([
        prisma.generation.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.generation.aggregate({
          where: succeeded,
          _count: { _all: true },
          _avg: { validatorScore: true, judgeScore: true },
        }),
        prisma.generation.groupBy({ by: ["tone"], ...groupArgs, orderBy: { _count: { tone: "desc" } } }),
        prisma.generation.groupBy({
          by: ["postType"],
          ...groupArgs,
          orderBy: { _count: { postType: "desc" } },
        }),
        prisma.$queryRaw<TrendRow[]>`
          SELECT to_char(date_trunc('day', created_at AT TIME ZONE ${options.timeZone}), 'YYYY-MM-DD') AS day,
                 count(*)::int AS count,
                 avg(validator_score)::float8 AS avg_validator,
                 avg(judge_score)::float8 AS avg_judge
          FROM generations
          WHERE status = ${GenerationStatus.SUCCEEDED}::"GenerationStatus"
            AND created_at >= now() - make_interval(days => ${options.trendDays}::int)
          GROUP BY 1
          ORDER BY 1`,
        prisma.$queryRaw<GapRow[]>`
          SELECT id::text, topic, validator_score, judge_score,
                 round(abs(validator_score - judge_score)::numeric, 1)::float8 AS gap
          FROM generations
          WHERE status = ${GenerationStatus.SUCCEEDED}::"GenerationStatus"
            AND validator_score IS NOT NULL AND judge_score IS NOT NULL
          ORDER BY gap DESC, created_at DESC
          LIMIT 1`,
      ]);

      const statusCounts = Object.fromEntries(GENERATION_STATUSES.map((s) => [s, 0])) as Record<
        GenerationStatus,
        number
      >;
      for (const group of byStatus) statusCounts[group.status] = group._count._all;

      const toGroup = (key: string, group: (typeof byTone)[number] | (typeof byPostType)[number]): InsightsGroup => ({
        key,
        count: group._count._all,
        avgValidator: group._avg.validatorScore,
        avgJudge: group._avg.judgeScore,
      });
      const gap = gapRows[0];

      return {
        totals: {
          all: Object.values(statusCounts).reduce((sum, n) => sum + n, 0),
          byStatus: statusCounts,
        },
        averages: {
          validator: averages._avg.validatorScore,
          judge: averages._avg.judgeScore,
          scoredRuns: averages._count._all,
        },
        byTone: byTone.map((group) => toGroup(group.tone, group)),
        byPostType: byPostType.map((group) => toGroup(group.postType, group)),
        trend: {
          timeZone: options.timeZone,
          days: options.trendDays,
          points: trendRows.map((row) => ({
            day: row.day,
            count: row.count,
            avgValidator: row.avg_validator,
            avgJudge: row.avg_judge,
          })),
        },
        largestGap: gap
          ? {
              id: gap.id,
              topic: gap.topic,
              validatorScore: gap.validator_score,
              judgeScore: gap.judge_score,
              gap: gap.gap,
            }
          : null,
      };
    },

    async ping(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}

export type GenerationRepository = ReturnType<typeof createGenerationRepository>;
