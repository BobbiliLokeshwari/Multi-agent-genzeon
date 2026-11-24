/**
 * Domain catalog: the single source of truth for every enumerated value.
 *
 * The API validates requests against these lists, the worker passes the raw
 * values into the prompts (prompts/<version>/*.md use them verbatim), and the
 * web app renders them. Human-readable labels are deliberately NOT here: they
 * live in apps/web/messages/<locale>.json so every locale can translate them.
 *
 * To add a tone or post type, add it here and add a label to each messages file.
 */

export const TONES = ["professional", "casual", "thought-leader"] as const;
export type Tone = (typeof TONES)[number];
export const DEFAULT_TONE: Tone = "professional";

export const POST_TYPES = [
  "story",
  "hot-take",
  "announcement",
  "lesson-learned",
  "thought-leader",
] as const;
export type PostType = (typeof POST_TYPES)[number];
export const DEFAULT_POST_TYPE: PostType = "thought-leader";

/** Pipeline nodes in execution order. The worker's LangGraph uses these exact names. */
export const PIPELINE_STEPS = ["research", "write", "validate", "judge", "memory"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const GENERATION_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

const TERMINAL_STATUSES: ReadonlySet<GenerationStatus> = new Set(["SUCCEEDED", "FAILED"]);
export function isTerminalStatus(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Where a generation came from: this app, or the Python CLI's posts_history.json. */
export const GENERATION_SOURCES = ["STUDIO", "CLI_IMPORT"] as const;
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

/** The judge's five criteria (see prompts/<version>/judge_prompt.md). */
export const JUDGE_CRITERIA = ["hook", "authenticity", "clarity", "engagement", "toneMatch"] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

/** Every prompt asks the model for scores on a 1–10 scale. */
export const SCORE_MAX = 10;

/** Prompt version folder names. The strict pattern also blocks path traversal. */
export const PROMPT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const PROMPT_FILE_KINDS = ["agent", "task", "prompt", "config"] as const;
export type PromptFileKind = (typeof PROMPT_FILE_KINDS)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/**
 * Score bands from the judge prompt's scoring guide (7–8 good, 5–6 mediocre,
 * 1–4 poor). The UI colours scores with these.
 */
export const SCORE_BANDS = { good: 7, fair: 5 } as const;
export type ScoreBand = "good" | "fair" | "poor";
export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BANDS.good) return "good";
  return score >= SCORE_BANDS.fair ? "fair" : "poor";
}
