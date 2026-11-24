import {
  fill,
  truncateCodePoints,
  type JudgeData,
  type PipelineIssue,
  type PostData,
  type ResearchData,
  type ValidationData,
} from "@studio/shared";
import type { MemoryTemplates } from "./prompts/schema";

export interface MemoryEntry {
  topic: string;
  tone: string;
  postContent: string;
  validatorScore: number | null;
  judgeScore: number | null;
}

export interface CompletedRun {
  runId: string;
  research: ResearchData;
  post: PostData;
  validation: ValidationData;
  judge: JudgeData;
  issues: PipelineIssue[];
}

/** Long-term memory. The worker implements it on Postgres; tests use an in-memory fake. */
export interface MemoryStore {
  /** Past successful posts most relevant to `topic`, best match first. */
  findRelevant(topic: string, options: { limit: number; minOverlap: number }): Promise<MemoryEntry[]>;
  /** Commits a finished run so later runs can use it as a style reference. */
  save(run: CompletedRun): Promise<void>;
}

/** Port of MemoryManager.format_context, with the wording moved into pipeline.yaml. */
export function formatMemoryContext(
  entries: readonly MemoryEntry[],
  templates: MemoryTemplates,
  snippetChars: number,
): string {
  if (entries.length === 0) return templates.empty;
  const score = (value: number | null) => (value === null ? templates.notAvailable : String(value));
  const blocks = entries.map((entry, index) =>
    fill(templates.entry, {
      index: index + 1,
      topic: entry.topic,
      tone: entry.tone,
      validator_score: score(entry.validatorScore),
      judge_score: score(entry.judgeScore),
      snippet: truncateCodePoints(entry.postContent, snippetChars),
    }),
  );
  return [templates.header, ...blocks].join("\n");
}
