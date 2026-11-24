import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMemoryContext } from "../memory";

const templates = {
  empty: "No previous posts found in memory.",
  header: "PREVIOUS POSTS ON SIMILAR TOPICS (style reference — avoid repetition):",
  entry:
    "\n--- Post $index | Topic: $topic | Validator: $validator_score/10 | Judge: $judge_score/10 | Tone: $tone ---\n$snippet",
  notAvailable: "N/A",
};

describe("formatMemoryContext (port of MemoryManager.format_context)", () => {
  it("returns the empty message when nothing is relevant", () => {
    assert.equal(formatMemoryContext([], templates, 400), templates.empty);
  });

  it("produces the same text layout as the Python version", () => {
    const text = formatMemoryContext(
      [{ topic: "ai", tone: "casual", postContent: "abcdef", validatorScore: 9, judgeScore: null }],
      templates,
      3,
    );
    assert.equal(
      text,
      [
        templates.header,
        "\n--- Post 1 | Topic: ai | Validator: 9/10 | Judge: N/A/10 | Tone: casual ---",
        "abc",
      ].join("\n"),
    );
  });
});
