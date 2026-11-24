import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { PIPELINE_STEPS, type StepEvent } from "@studio/shared";
import { createPipeline, type LlmRole, type PipelineDeps } from "../graph";
import type { ChatClient } from "../llm";
import type { CompletedRun, MemoryStore } from "../memory";
import type { PromptBundle } from "../prompts/store";
import type { Researcher } from "../research";

const bundle: PromptBundle = {
  version: "test",
  agents: {
    research: { role: "R", goal: "g", backstory: "b" },
    writer: { role: "W", goal: "g", backstory: "b" },
    validator: { role: "V", goal: "g", backstory: "b" },
  },
  tasks: {
    research: "research $topic $post_type $research_data",
    writing: "write $topic $tone $post_type $research_insights $memory_context",
    validation: "validate $post_content $research_insights $tone",
  },
  judge: "judge $post_content $topic $tone $post_type",
  pipeline: {
    researchQueries: ["$topic statistics", "$topic news"],
    agentSystemPrompt: "Role: $role",
    memoryContext: { empty: "none", header: "H", entry: "E $index", notAvailable: "N/A" },
  },
};

const REPLIES = {
  research:
    '```json\n{"key_facts":["fact"],"trending_angles":[],"credible_sources":[],"hook_opportunities":[]}\n```',
  writer: '{"post_content":"Hook line\\n\\nBody text here.","hook":"Hook line","facts_used":["fact"]}',
  validator: 'Sure! {"validation_passed": true, "score": "9/10", "suggestions": ["tighten"]}',
  judge:
    '{"hook_score": 8, "authenticity_score": 7, "clarity_score": 9, "engagement_score": 8, "tone_match_score": 9, "overall_score": 8.2, "verdict": "minor-edits"}',
};

class FakeMemory implements MemoryStore {
  saved: CompletedRun[] = [];
  async findRelevant() {
    return [];
  }
  async save(run: CompletedRun) {
    this.saved.push(run);
  }
}

function role(client: ChatClient): LlmRole {
  return { client, model: "fake-model", temperature: 0, maxTokens: 100 };
}

function agentReplying(writerReply: string): ChatClient {
  const bySystem: Record<string, string> = {
    "Role: R": REPLIES.research,
    "Role: W": writerReply,
    "Role: V": REPLIES.validator,
  };
  return { complete: async ({ system }) => bySystem[system ?? ""] ?? "" };
}

const researcher: Researcher = {
  async searchAll(queries) {
    return queries.map((query, index) =>
      index === 0
        ? { query, sources: [{ title: "T", url: "https://example.com", content: "c" }], error: null }
        : { query, sources: [], error: "timeout" },
    );
  },
};

async function collect(deps: PipelineDeps): Promise<StepEvent[]> {
  const events: StepEvent[] = [];
  const input = { runId: "run-1", topic: "ai", tone: "casual", postType: "story", promptVersion: "test" };
  for await (const event of createPipeline(deps).run(input)) events.push(event);
  return events;
}

describe("pipeline graph", () => {
  let memory: FakeMemory;
  let deps: PipelineDeps;

  beforeEach(() => {
    memory = new FakeMemory();
    deps = {
      prompts: { load: async () => bundle },
      agent: role(agentReplying(REPLIES.writer)),
      judge: role({ complete: async () => REPLIES.judge }),
      researcher,
      memory,
      settings: { memory: { topK: 3, minOverlap: 1, snippetChars: 400 }, contentLocale: "en" },
    };
  });

  it("runs every step in order and commits the run to memory", async () => {
    const events = await collect(deps);
    assert.deepEqual(events.map((e) => e.step), [...PIPELINE_STEPS]);

    const research = events[0];
    assert.equal(research?.step, "research");
    if (research?.step === "research") {
      assert.equal(research.data.sources.length, 1);
      assert.deepEqual(research.data.insights?.keyFacts, ["fact"]);
    }
    assert.ok(events.at(-1)?.issues.some((i) => i.code === "RESEARCH_SEARCH_FAILED"));

    const run = memory.saved[0];
    assert.ok(run);
    assert.equal(run.post.wordCount, 5);
    assert.equal(run.validation.score, 9);
    assert.equal(run.judge.overall, 8.2);
    assert.equal(run.judge.scores.toneMatch, 9);
  });

  it("stops after write when the writer fails, like the Python graph", async () => {
    deps.agent = role(agentReplying("not json at all"));
    const events = await collect(deps);
    assert.deepEqual(events.map((e) => e.step), ["research", "write"]);
    assert.equal(events[1]?.data, null);
    assert.ok(events[1]?.issues.some((i) => i.code === "WRITER_FAILED"));
    assert.equal(memory.saved.length, 0);
  });

  it("records JUDGE_DISABLED and still saves when the judge is off", async () => {
    deps.judge = null;
    const events = await collect(deps);
    const judge = events.find((e) => e.step === "judge");
    assert.ok(judge?.issues.some((i) => i.code === "JUDGE_DISABLED"));
    assert.equal(memory.saved[0]?.judge.overall, null);
  });
});
