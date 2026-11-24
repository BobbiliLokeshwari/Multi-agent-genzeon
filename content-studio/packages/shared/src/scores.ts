import { SCORE_MAX } from "./catalog";

/** Leading number, with a dot or comma decimal: "9", "8.5/10", "7,5 out of 10". */
const LEADING_NUMBER = /^\s*(\d+(?:[.,]\d+)?)/;

/**
 * Normalises a model-reported score to a number on the 0–SCORE_MAX scale.
 *
 * The validator answers "9/10" (text) while the judge answers 8.7 (number);
 * the Python version stored both as-is, so sorting and charts broke. Anything
 * unparseable or out of range becomes null rather than a misleading number.
 */
export function parseScore(value: unknown, max: number = SCORE_MAX): number | null {
  let score: number | null = null;
  if (typeof value === "number") {
    score = value;
  } else if (typeof value === "string") {
    const match = LEADING_NUMBER.exec(value);
    if (match?.[1]) score = Number(match[1].replace(",", "."));
  }
  if (score === null || !Number.isFinite(score) || score < 0 || score > max) return null;
  return Math.round(score * 10) / 10;
}
