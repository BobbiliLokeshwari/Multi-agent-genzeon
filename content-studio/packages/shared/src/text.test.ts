import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countWords, firstLine, rankByOverlap, tokenizeTopic, truncateCodePoints } from "./text";

describe("tokenizeTopic", () => {
  it("lower-cases, splits on any whitespace and de-duplicates", () => {
    assert.deepEqual(tokenizeTopic("AI in \t India  ai"), ["ai", "in", "india"]);
  });
});

describe("truncateCodePoints", () => {
  it("cuts by code point like Python slicing, never inside a surrogate pair", () => {
    assert.equal(truncateCodePoints("😀😀abc", 1), "😀");
    assert.equal(truncateCodePoints("short", 400), "short");
  });
});

describe("countWords", () => {
  it("counts word-like segments only", () => {
    assert.equal(countWords("Hello, world! By 2027 — growth.", "en"), 5);
  });
  it("handles Devanagari", () => {
    assert.equal(countWords("भारत में एआई", "hi"), 3);
  });
});

describe("firstLine", () => {
  it("returns the first non-blank line", () => {
    assert.equal(firstLine("\n  \n  Hook here  \nBody"), "Hook here");
  });
});

describe("rankByOverlap", () => {
  const at = (iso: string) => new Date(iso);
  const candidates = [
    { id: "old-match", topicTokens: ["ai", "india"], createdAt: at("2026-01-01") },
    { id: "new-match", topicTokens: ["ai", "india"], createdAt: at("2026-02-01") },
    { id: "weak", topicTokens: ["ai", "travel"], createdAt: at("2026-03-01") },
    { id: "unrelated", topicTokens: ["vanuatu"], createdAt: at("2026-04-01") },
  ];

  it("ranks by shared words, newest first on ties, and drops zero overlap", () => {
    const ranked = rankByOverlap(["ai", "india", "2027"], candidates, { limit: 3, minOverlap: 1 });
    assert.deepEqual(ranked.map((c) => c.id), ["new-match", "old-match", "weak"]);
  });

  it("keeps unrelated posts when minOverlap is 0 (the Python behaviour)", () => {
    const ranked = rankByOverlap(["vanuatu"], candidates, { limit: 10, minOverlap: 0 });
    assert.equal(ranked.length, 4);
    assert.equal(ranked[0]?.id, "unrelated");
  });
});
