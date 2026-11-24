/**
 * Turns the loosely-typed JSON the models return into the strict DTOs the API
 * serves. The snake_case keys below are the contract with the prompt files:
 * each one is a key the prompt explicitly asks the model to return.
 */
import {
  JUDGE_CRITERIA,
  countWords,
  firstLine,
  parseScore,
  type JudgeCriterion,
  type JudgeData,
  type PostData,
  type ResearchInsights,
  type ValidationData,
} from "@studio/shared";
import { parseJsonObject } from "./json";

type Json = Record<string, unknown>;

/** judge_prompt.md asks for one `<criterion>_score` per criterion. */
const JUDGE_SCORE_KEYS: Record<JudgeCriterion, string> = {
  hook: "hook_score",
  authenticity: "authenticity_score",
  clarity: "clarity_score",
  engagement: "engagement_score",
  toneMatch: "tone_match_score",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = text(item);
    return entry === null ? [] : [entry];
  });
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

/** writing_task.md → PostData. Throws when there is no post, which fails the run. */
export function normalizeWriterOutput(raw: Json, contentLocale: string): PostData {
  const content = typeof raw.post_content === "string" ? raw.post_content.trim() : "";
  if (!content) throw new Error("post_content is empty or not a string");
  return {
    content,
    hook: text(raw.hook) ?? firstLine(content),
    wordCount: countWords(content, contentLocale),
    factsUsed: textList(raw.facts_used),
  };
}

/** validation_task.md → ValidationData. */
export function normalizeValidation(raw: Json): ValidationData {
  return {
    passed: bool(raw.validation_passed),
    score: parseScore(raw.score),
    accuracyIssues: textList(raw.accuracy_issues),
    qualityIssues: textList(raw.quality_issues),
    cringeFlags: textList(raw.cringe_flags),
    suggestions: textList(raw.suggestions),
    verdict: text(raw.final_verdict),
  };
}

export function emptyValidation(): ValidationData {
  return {
    passed: null,
    score: null,
    accuracyIssues: [],
    qualityIssues: [],
    cringeFlags: [],
    suggestions: [],
    verdict: null,
  };
}

/** judge_prompt.md → JudgeData. */
export function normalizeJudge(raw: Json, model: string): JudgeData {
  const scores = Object.fromEntries(
    JUDGE_CRITERIA.map((criterion) => [criterion, parseScore(raw[JUDGE_SCORE_KEYS[criterion]])]),
  ) as Record<JudgeCriterion, number | null>;
  return {
    model,
    scores,
    overall: parseScore(raw.overall_score),
    strengths: textList(raw.strengths),
    weaknesses: textList(raw.weaknesses),
    deductions: textList(raw.deductions),
    verdict: text(raw.verdict),
  };
}

export function emptyJudge(model: string | null): JudgeData {
  return {
    model,
    scores: Object.fromEntries(JUDGE_CRITERIA.map((criterion) => [criterion, null])) as Record<
      JudgeCriterion,
      null
    >,
    overall: null,
    strengths: [],
    weaknesses: [],
    deductions: [],
    verdict: null,
  };
}

/**
 * research_task.md asks for JSON, but the pipeline passes the agent's raw text
 * downstream either way (as the Python version did). This parse is for display.
 */
export function parseResearchInsights(raw: string): ResearchInsights | null {
  let json: Json;
  try {
    json = parseJsonObject(raw);
  } catch {
    return null;
  }
  const insights: ResearchInsights = {
    keyFacts: textList(json.key_facts),
    trendingAngles: textList(json.trending_angles),
    credibleSources: textList(json.credible_sources),
    hookOpportunities: textList(json.hook_opportunities),
  };
  return Object.values(insights).some((list) => list.length > 0) ? insights : null;
}
