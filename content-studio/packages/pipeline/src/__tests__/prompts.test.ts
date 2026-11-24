import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveWorkspacePath } from "@studio/shared/node";
import { PromptVersionNotFoundError } from "../errors";
import { PromptStore } from "../prompts/store";

// Integration check against the real prompts folder next to content-studio.
const promptsDir = resolveWorkspacePath(process.env.PROMPTS_DIR ?? "../prompts");

describe("PromptStore (real prompts folder)", { skip: !existsSync(promptsDir) }, () => {
  const store = new PromptStore(promptsDir, { cache: true });

  it("lists v1 and loads a complete, valid bundle", async () => {
    assert.ok((await store.listVersions()).includes("v1"));
    const bundle = await store.load("v1");
    assert.ok(bundle.pipeline.researchQueries.length > 0);
    assert.ok(bundle.tasks.writing.includes("$memory_context"));
    assert.ok(bundle.agents.writer.role.length > 0);
  });

  it("reports placeholders for each file", async () => {
    const files = await store.readFiles("v1");
    const judge = files.find((file) => file.name === "judge_prompt.md");
    assert.deepEqual(judge?.placeholders, ["post_content", "topic", "tone", "post_type"]);
  });

  it("refuses path traversal and unknown versions", async () => {
    assert.equal(await store.hasVersion("../etc"), false);
    await assert.rejects(store.load("does-not-exist"), PromptVersionNotFoundError);
  });
});
