import type { $Enums, Generation, Prisma } from "@prisma/client";
import {
  PIPELINE_STEPS,
  isOneOf,
  type GenerationDetail,
  type GenerationSource,
  type GenerationStatus,
  type GenerationSummary,
  type JudgeData,
  type PipelineIssue,
  type PipelineIssueCode,
  type PipelineStep,
  type PostData,
  type ResearchData,
  type ValidationData,
} from "@studio/shared";

// Compile-time guard: the Prisma enums must match the shared catalog exactly.
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const statusesMatch: Same<$Enums.GenerationStatus, GenerationStatus> = true;
const sourcesMatch: Same<$Enums.GenerationSource, GenerationSource> = true;
void statusesMatch;
void sourcesMatch;

/** Columns a list row needs. Leaves the JSON blobs out of list queries. */
export const summarySelect = {
  id: true,
  status: true,
  source: true,
  currentStep: true,
  topic: true,
  tone: true,
  postType: true,
  promptVersion: true,
  hook: true,
  validatorScore: true,
  judgeScore: true,
  createdAt: true,
  finishedAt: true,
} as const satisfies Prisma.GenerationSelect;

export type SummaryRow = Prisma.GenerationGetPayload<{ select: typeof summarySelect }>;

function asStep(value: string | null): PipelineStep | null {
  return isOneOf(PIPELINE_STEPS, value) ? value : null;
}

/** JSON columns are written only by this package, from the shared DTO types. */
function fromJson<T>(value: Prisma.JsonValue | null): T | null {
  return value === null ? null : (value as unknown as T);
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function toSummary(row: SummaryRow): GenerationSummary {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    currentStep: asStep(row.currentStep),
    topic: row.topic,
    tone: row.tone,
    postType: row.postType,
    promptVersion: row.promptVersion,
    hook: row.hook,
    validatorScore: row.validatorScore,
    judgeScore: row.judgeScore,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function toDetail(row: Generation): GenerationDetail {
  return {
    ...toSummary(row),
    attempts: row.attempts,
    agentModel: row.agentModel,
    judgeModel: row.judgeModel,
    research: fromJson<ResearchData>(row.research),
    post: fromJson<PostData>(row.post),
    validation: fromJson<ValidationData>(row.validation),
    judge: fromJson<JudgeData>(row.judge),
    issues: fromJson<PipelineIssue[]>(row.issues) ?? [],
    failure: row.failureCode
      ? {
          code: row.failureCode as PipelineIssueCode,
          step: asStep(row.failureStep),
          detail: row.failureDetail,
        }
      : null,
    startedAt: row.startedAt?.toISOString() ?? null,
  };
}
