import { PIPELINE_STEPS, type GenerationDetail, type PipelineStep } from "@studio/shared";

export type StepState = "pending" | "active" | "done" | "warning" | "failed" | "skipped";

/** What each pipeline step looks like for a run, derived from its persisted state. */
export function deriveStepStates(
  run: Pick<GenerationDetail, "status" | "currentStep" | "issues" | "failure">,
): Record<PipelineStep, StepState> {
  const finished = run.currentStep ? PIPELINE_STEPS.indexOf(run.currentStep) : -1;
  const failedAt =
    run.status === "FAILED"
      ? run.failure?.step
        ? PIPELINE_STEPS.indexOf(run.failure.step)
        : finished + 1
      : -1;
  const warned = new Set(run.issues.map((issue) => issue.step));
  const completed = (step: PipelineStep): StepState => (warned.has(step) ? "warning" : "done");

  const entries = PIPELINE_STEPS.map((step, index): [PipelineStep, StepState] => {
    if (run.status === "SUCCEEDED") return [step, completed(step)];
    if (run.status === "FAILED") {
      if (index === failedAt) return [step, "failed"];
      return [step, index < failedAt ? completed(step) : "skipped"];
    }
    if (index <= finished) return [step, completed(step)];
    if (run.status === "RUNNING" && index === finished + 1) return [step, "active"];
    return [step, "pending"];
  });
  return Object.fromEntries(entries) as Record<PipelineStep, StepState>;
}
