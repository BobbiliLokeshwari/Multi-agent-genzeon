import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonObject } from "../json";
import { normalizeJudge, normalizeValidation, normalizeWriterOutput } from "../normalize";
import { parseScore } from "@studio/shared";

describe("parseJsonObject (port of _parse_json_object)", () => {
  it("reads a fenced block", () => {
    assert.deepEqual(parseJsonObject('```json\n{"a": 1}\n```'), { a: 1 });
  });
  it("falls back to the outermost braces inside prose", () => {
    assert.deepEqual(parseJsonObject('Sure! Here it is: {"a": {"b": 2}} Hope it helps.'), { a: { b: 2 } });
  });
  it("handles an unclosed fence", () => {
    assert.deepEqual(parseJsonObject('```json\n{"a": 1}'), { a: 1 });
  });
  it("rejects empty replies and non-objects", () => {
    assert.throws(() => parseJsonObject("   "), /empty LLM response/);
    assert.throws(() => parseJsonObject("[1, 2]"), /expected a JSON object/);
  });
});

describe("parseScore", () => {
  it("accepts the validator's text and the judge's numbers", () => {
    assert.equal(parseScore("9/10"), 9);
    assert.equal(parseScore("8.5/10"), 8.5);
    assert.equal(parseScore("7,5"), 7.5);
    assert.equal(parseScore(8.7), 8.7);
  });
  it("returns null for anything unusable", () => {
    assert.equal(parseScore("n/a"), null);
    assert.equal(parseScore(42), null);
    assert.equal(parseScore(null), null);
    assert.equal(parseScore(Number.NaN), null);
  });
});

describe("normalizers", () => {
  it("computes word count instead of trusting the model", () => {
    const post = normalizeWriterOutput({ post_content: "  One two three.\nFour  ", word_count: "999" }, "en");
    assert.equal(post.wordCount, 4);
    assert.equal(post.hook, "One two three.");
  });
  it("fails the writer step when there is no post", () => {
    assert.throws(() => normalizeWriterOutput({ post_content: "  " }, "en"));
  });
  it("normalises validator output", () => {
    const v = normalizeValidation({ validation_passed: "true", score: "9/10", cringe_flags: ["x", 3, ""] });
    assert.equal(v.passed, true);
    assert.equal(v.score, 9);
    assert.deepEqual(v.cringeFlags, ["x"]);
    assert.equal(v.verdict, null);
  });
  it("maps judge criteria from the prompt's snake_case keys", () => {
    const j = normalizeJudge({ hook_score: 8, tone_match_score: "9", overall_score: 8.4 }, "m");
    assert.equal(j.scores.hook, 8);
    assert.equal(j.scores.toneMatch, 9);
    assert.equal(j.scores.clarity, null);
    assert.equal(j.overall, 8.4);
  });
});
