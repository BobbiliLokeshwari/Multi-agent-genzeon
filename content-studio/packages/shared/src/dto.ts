/**
 * Data transfer objects: the JSON shapes the API returns and the web app reads.
 * Dates travel as ISO-8601 strings; the UI formats them per locale.
 */
import type {
  GenerationSource,
  GenerationStatus,
  JudgeCriterion,
  PipelineStep,
  PostType,
  PromptFileKind,
  Tone,
} from "./catalog";
import type { ApiErrorCode, PipelineIssueCode } from "./errors";

/* ── Pipeline outputs ─────────────────────────────────────────────────────── */

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchInsights {
  keyFacts: string[];
  trendingAngles: string[];
  credibleSources: string[];
  hookOpportunities: string[];
}

export interface ResearchData {
  queries: string[];
  sources: ResearchSource[];
  /** Parsed from the research agent's JSON; null when it returned something else. */
  insights: ResearchInsights | null;
}

export interface PostData {
  content: string;
  hook: string;
  /** Counted with Intl.Segmenter, not taken from the model's own estimate. */
  wordCount: number;
  factsUsed: string[];
}

export interface ValidationData {
  passed: boolean | null;
  score: number | null;
  accuracyIssues: string[];
  qualityIssues: string[];
  cringeFlags: string[];
  suggestions: string[];
  verdict: string | null;
}

export interface JudgeData {
  model: string | null;
  scores: Record<JudgeCriterion, number | null>;
  overall: number | null;
  strengths: string[];
  weaknesses: string[];
  deductions: string[];
  verdict: string | null;
}

export interface PipelineIssue {
  step: PipelineStep;
  code: PipelineIssueCode;
  /** Technical detail for operators (exception message). Not translated. */
  detail: string | null;
}

export interface GenerationFailure {
  step: PipelineStep | null;
  code: PipelineIssueCode;
  detail: string | null;
}

/* ── Generations ──────────────────────────────────────────────────────────── */

export interface GenerationSummary {
  id: string;
  status: GenerationStatus;
  source: GenerationSource;
  currentStep: PipelineStep | null;
  topic: string;
  /** A catalog value for Studio runs; imported CLI runs may hold free text. */
  tone: Tone | (string & {});
  postType: PostType | (string & {});
  promptVersion: string;
  hook: string | null;
  validatorScore: number | null;
  judgeScore: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface GenerationDetail extends GenerationSummary {
  attempts: number;
  agentModel: string | null;
  judgeModel: string | null;
  research: ResearchData | null;
  post: PostData | null;
  validation: ValidationData | null;
  judge: JudgeData | null;
  issues: PipelineIssue[];
  failure: GenerationFailure | null;
  startedAt: string | null;
}

/** One finished pipeline step, pushed to the browser over SSE. `issues` is the full list so far. */
export type StepEvent =
  | { step: "research"; data: ResearchData; issues: PipelineIssue[] }
  | { step: "write"; data: PostData | null; issues: PipelineIssue[] }
  | { step: "validate"; data: ValidationData; issues: PipelineIssue[] }
  | { step: "judge"; data: JudgeData; issues: PipelineIssue[] }
  | { step: "memory"; data: null; issues: PipelineIssue[] };

export interface StreamEndEvent {
  status: GenerationStatus;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/* ── Catalog / insights / prompts ─────────────────────────────────────────── */

export interface Catalog {
  tones: readonly Tone[];
  postTypes: readonly PostType[];
  promptVersions: string[];
  defaults: { tone: Tone; postType: PostType; promptVersion: string };
  limits: { topicMaxLength: number };
}

export interface InsightsGroup {
  key: string;
  count: number;
  avgValidator: number | null;
  avgJudge: number | null;
}

export interface InsightsTrendPoint {
  /** Calendar day (YYYY-MM-DD) in `trend.timeZone`. */
  day: string;
  count: number;
  avgValidator: number | null;
  avgJudge: number | null;
}

export interface Insights {
  totals: { all: number; byStatus: Record<GenerationStatus, number> };
  averages: { validator: number | null; judge: number | null; scoredRuns: number };
  byTone: InsightsGroup[];
  byPostType: InsightsGroup[];
  trend: { timeZone: string; days: number; points: InsightsTrendPoint[] };
  largestGap: {
    id: string;
    topic: string;
    validatorScore: number;
    judgeScore: number;
    gap: number;
  } | null;
}

export interface PromptFileSummary {
  name: string;
  kind: PromptFileKind;
  bytes: number;
}

export interface PromptFile extends PromptFileSummary {
  content: string;
  placeholders: string[];
}

export interface PromptVersionSummary {
  version: string;
  isDefault: boolean;
  files: PromptFileSummary[];
}

export interface PromptVersionDetail {
  version: string;
  isDefault: boolean;
  files: PromptFile[];
}

/* ── Envelopes ────────────────────────────────────────────────────────────── */

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFieldIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiFieldIssue[];
  };
}
