/**
 * Locale-aware text helpers shared by the API (topic tokens), the worker
 * (memory ranking, word counts) and the web app.
 */

/**
 * Port of Python's `set(topic.lower().split())`: lower-cased, whitespace-split,
 * de-duplicated words. Used for memory lookups, so keep it locale-independent.
 */
export function tokenizeTopic(topic: string): string[] {
  return [...new Set(topic.toLowerCase().split(/\s+/u).filter(Boolean))];
}

/**
 * Truncates by Unicode code point, like Python's `text[:n]`. `String#slice`
 * counts UTF-16 units and can cut an emoji in half.
 */
export function truncateCodePoints(text: string, maxCodePoints: number): string {
  let count = 0;
  let offset = 0;
  for (const char of text) {
    if (count === maxCodePoints) return text.slice(0, offset);
    count += 1;
    offset += char.length;
  }
  return text;
}

const segmenters = new Map<string, Intl.Segmenter>();

/** Counts words with Intl.Segmenter, which also handles scripts that don't use spaces. */
export function countWords(text: string, locale: string): number {
  let segmenter = segmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    segmenters.set(locale, segmenter);
  }
  let words = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) words += 1;
  }
  return words;
}

/** First non-blank line, trimmed. */
export function firstLine(text: string): string {
  return text.split(/\r?\n/u).find((line) => line.trim() !== "")?.trim() ?? "";
}

export interface OverlapCandidate {
  topicTokens: readonly string[];
  createdAt: Date;
}

/**
 * Port of MemoryManager.get_relevant: rank by shared topic words, newest first
 * on ties. `minOverlap` (default 1 in config) drops unrelated posts, which the
 * Python version returned anyway.
 */
export function rankByOverlap<T extends OverlapCandidate>(
  topicTokens: readonly string[],
  candidates: readonly T[],
  options: { limit: number; minOverlap: number },
): T[] {
  const wanted = new Set(topicTokens);
  return candidates
    .map((candidate) => ({
      candidate,
      overlap: candidate.topicTokens.reduce((n, token) => (wanted.has(token) ? n + 1 : n), 0),
    }))
    .filter(({ overlap }) => overlap >= options.minOverlap)
    .sort(
      (a, b) =>
        b.overlap - a.overlap || b.candidate.createdAt.getTime() - a.candidate.createdAt.getTime(),
    )
    .slice(0, options.limit)
    .map(({ candidate }) => candidate);
}

/** True when `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}
