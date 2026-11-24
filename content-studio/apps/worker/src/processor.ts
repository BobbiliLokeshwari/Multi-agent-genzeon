import type { GenerationRepository } from "@studio/db";
import type { Pipeline } from "@studio/pipeline";
import {
  PIPELINE_STEPS,
  describeError,
  isTerminalStatus,
  type GenerationFailure,
  type GenerationJobData,
  type PipelineIssue,
  type PipelineStep,
} from "@studio/shared";
import { UnrecoverableError, type Job } from "bullmq";
import type { Logger } from "pino";

/** A failure the pipeline reported itself (as opposed to an unexpected exception). */
export class RunFailure extends Error {
  override readonly name = "RunFailure";
  constructor(readonly failure: GenerationFailure) {
    super(`${failure.code}${failure.detail ? `: ${failure.detail}` : ""}`);
  }
}

export interface ProcessorDeps {
  repo: Pick<GenerationRepository, "findRunInput" | "markRunning" | "saveStep" | "fail">;
  pipeline: Pipeline;
  models: { agent: string; judge: string | null };
  logger: Logger;
}

/** The step that was running when an exception escaped: the one after the last finished step. */
function stepAfter(step: PipelineStep | null): PipelineStep | null {
  const next = step === null ? 0 : PIPELINE_STEPS.indexOf(step) + 1;
  return PIPELINE_STEPS[next] ?? null;
}

export function createProcessor(deps: ProcessorDeps) {
  return async function processGeneration(job: Job<GenerationJobData>): Promise<void> {
    const { generationId } = job.data;
    const attempt = job.attemptsMade + 1; // attemptsMade counts earlier attempts only.
    const log = deps.logger.child({ generationId, jobId: job.id, attempt });

    const input = await deps.repo.findRunInput(generationId);
    if (!input) throw new UnrecoverableError(`Generation ${generationId} does not exist`);
    if (isTerminalStatus(input.status)) {
      log.warn({ status: input.status }, "Generation already finished; skipping duplicate job");
      return;
    }

    await deps.repo.markRunning(generationId, {
      attempt,
      agentModel: deps.models.agent,
      judgeModel: deps.models.judge,
    });
    log.info({ topic: input.topic, promptVersion: input.promptVersion }, "Pipeline started");

    let issues: PipelineIssue[] = [];
    let lastStep: PipelineStep | null = null;
    let wrote = false;
    try {
      const events = deps.pipeline.run({
        runId: input.id,
        topic: input.topic,
        tone: input.tone,
        postType: input.postType,
        promptVersion: input.promptVersion,
      });
      for await (const event of events) {
        issues = event.issues;
        lastStep = event.step;
        if (event.step === "write") wrote = event.data !== null;
        // Persist first, then notify: a browser that reconnects always finds the step in Postgres.
        await deps.repo.saveStep(generationId, event);
        await job.updateProgress(event);
        log.info({ step: event.step, issues: event.issues.length }, "Step finished");
      }
      if (!wrote) {
        const writerIssue = issues.find((entry) => entry.code === "WRITER_FAILED");
        throw new RunFailure({ code: "WRITER_FAILED", step: "write", detail: writerIssue?.detail ?? null });
      }
      log.info("Pipeline finished");
    } catch (error) {
      const failure: GenerationFailure =
        error instanceof RunFailure
          ? error.failure
          : { code: "PIPELINE_ERROR", step: stepAfter(lastStep), detail: describeError(error) };
      const finalAttempt =
        error instanceof UnrecoverableError || attempt >= (job.opts.attempts ?? 1);
      // Record the failure before BullMQ announces it, so the API's final snapshot is correct.
      if (finalAttempt) await deps.repo.fail(generationId, failure, issues);
      log.error({ err: error, failure, finalAttempt }, "Pipeline failed");
      throw error;
    }
  };
}
