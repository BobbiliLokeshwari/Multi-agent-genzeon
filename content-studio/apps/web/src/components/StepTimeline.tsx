import { PIPELINE_STEPS, type GenerationDetail, type PipelineStep } from "@studio/shared";
import { useFormatter, useTranslations } from "next-intl";
import { deriveStepStates, type StepState } from "@/lib/steps";
import { UI } from "@/lib/ui";

const MARKER: Partial<Record<StepState, string>> = { done: "✓", warning: "!", failed: "×", skipped: "–" };

export function StepTimeline({ generation }: { generation: GenerationDetail }) {
  const t = useTranslations("steps");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const states = deriveStepStates(generation);
  const score = (value: number | null | undefined) =>
    value === null || value === undefined ? tCommon("notScored") : format.number(value, UI.scoreFormat);

  const summary = (step: PipelineStep): string | null => {
    switch (step) {
      case "research":
        return generation.research
          ? t("summary.research", {
              sources: generation.research.sources.length,
              queries: generation.research.queries.length,
            })
          : null;
      case "write":
        return generation.post ? t("summary.write", { words: generation.post.wordCount }) : null;
      case "validate":
        return generation.validation ? t("summary.validate", { score: score(generation.validation.score) }) : null;
      case "judge":
        return generation.judge ? t("summary.judge", { score: score(generation.judge.overall) }) : null;
      case "memory":
        return generation.status === "SUCCEEDED" ? t("summary.memory") : null;
    }
  };

  return (
    <ol className="timeline">
      {PIPELINE_STEPS.map((step, index) => {
        const state = states[step];
        const done = state === "done" || state === "warning";
        return (
          <li key={step} className="timeline-step" data-state={state} aria-current={state === "active" ? "step" : undefined}>
            <span className="timeline-marker" aria-hidden="true">
              {MARKER[state] ?? index + 1}
            </span>
            <div className="timeline-body">
              <p className="timeline-name">
                {t(`${step}.name`)}
                <span className="timeline-state">{t(`state.${state}`)}</span>
              </p>
              <p className="timeline-detail">{(done && summary(step)) || t(`${step}.role`)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
