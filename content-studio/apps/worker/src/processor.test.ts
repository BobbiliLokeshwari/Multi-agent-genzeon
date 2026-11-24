import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pipeline } from "@studio/pipeline";
import type { GenerationFailure, GenerationJobData, StepEvent } from "@studio/shared";
import type { Job } from "bullmq";
import { pino } from "pino";
import { createProcessor, type ProcessorDeps } from "./processor";

const RESEARCH: StepEvent = { step: "research", data: { queries: [], sources: [], insights: null }, issues: [] };

function fakeJob(attemptsMade = 0, attempts = 1) {
  const progress: unknown[] = [];
  const job = {
    id: "job-1",
    data: { generationId: "gen-1" },
    attemptsMade,
    opts: { attempts },
    updateProgress: async (value: unknown) => void progress.push(value),
  } as unknown as Job<GenerationJobData>;
  return { job, progress };
}

function fakeRepo() {
  const saved: StepEvent[] = [];
  const failures: GenerationFailure[] = [];
  const repo: ProcessorDeps["repo"] = {
    findRunInput: async (id) => ({
      id,
      status: "QUEUED",
      topic: "t",
      tone: "casual",
      postType: "story",
      promptVersion: "v1",
    }),
    markRunning: async () => {},
    saveStep: async (_id, event) => void saved.push(event),
    fail: async (_id, failure) => {
      failures.push(failure);
      return true;
    },
  };
  return { repo, saved, failures };
}

function pipelineOf(run: () => AsyncGenerator<StepEvent>): Pipeline {
  return { run } as unknown as Pipeline;
}

const deps = (repo: ProcessorDeps["repo"], pipeline: Pipeline): ProcessorDeps => ({
  repo,
  pipeline,
  models: { agent: "a", judge: "j" },
  logger: pino({ level: "silent" }),
});

describe("generation processor", () => {
  it("persists and publishes every step", async () => {
    const { repo, saved, failures } = fakeRepo();
    const write: StepEvent = {
      step: "write",
      data: { content: "c", hook: "h", wordCount: 1, factsUsed: [] },
      issues: [],
    };
    const { job, progress } = fakeJob();
    await createProcessor(deps(repo, pipelineOf(async function* () { yield RESEARCH; yield write; })))(job);
    assert.equal(saved.length, 2);
    assert.equal(progress.length, 2);
    assert.equal(failures.length, 0);
  });

  it("fails the run with WRITER_FAILED when the writer produced nothing", async () => {
    const { repo, failures } = fakeRepo();
    const write: StepEvent = {
      step: "write",
      data: null,
      issues: [{ step: "write", code: "WRITER_FAILED", detail: "bad json" }],
    };
    const { job } = fakeJob();
    await assert.rejects(
      createProcessor(deps(repo, pipelineOf(async function* () { yield RESEARCH; yield write; })))(job),
    );
    assert.deepEqual(failures, [{ code: "WRITER_FAILED", step: "write", detail: "bad json" }]);
  });

  it("blames the step after the last finished one for unexpected errors", async () => {
    const { repo, failures } = fakeRepo();
    const { job } = fakeJob();
    const boom = pipelineOf(async function* () {
      yield RESEARCH;
      throw new Error("database down");
    });
    await assert.rejects(createProcessor(deps(repo, boom))(job), /database down/);
    assert.deepEqual(failures, [{ code: "PIPELINE_ERROR", step: "write", detail: "database down" }]);
  });

  it("leaves the run open when BullMQ will retry", async () => {
    const { repo, failures } = fakeRepo();
    const { job } = fakeJob(0, 3);
    // eslint-disable-next-line require-yield -- simulates a pipeline that fails before its first step
    const boom = pipelineOf(async function* () {
      throw new Error("transient");
    });
    await assert.rejects(createProcessor(deps(repo, boom))(job));
    assert.equal(failures.length, 0);
  });
});
