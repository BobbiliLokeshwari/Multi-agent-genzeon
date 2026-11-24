import { JUDGE_CRITERIA, type GenerationDetail } from "@studio/shared";
import { useTranslations } from "next-intl";
import { CopyButton } from "./CopyButton";
import { ScoreBar } from "./ScoreBar";

type FeedbackKey =
  | "suggestions"
  | "accuracyIssues"
  | "qualityIssues"
  | "cringeFlags"
  | "strengths"
  | "weaknesses"
  | "deductions";

/** Everything a run produced. Renders only the parts that exist, so it also works mid-run. */
export function GenerationResult({ generation: run }: { generation: GenerationDetail }) {
  const t = useTranslations("result");
  const tSteps = useTranslations("steps");
  const tIssues = useTranslations("issues");
  const tCriteria = useTranslations("judgeCriteria");

  const feedback: Array<{ key: FeedbackKey; items: string[] }> = [
    { key: "suggestions" as const, items: run.validation?.suggestions ?? [] },
    { key: "accuracyIssues" as const, items: run.validation?.accuracyIssues ?? [] },
    { key: "qualityIssues" as const, items: run.validation?.qualityIssues ?? [] },
    { key: "cringeFlags" as const, items: run.validation?.cringeFlags ?? [] },
    { key: "strengths" as const, items: run.judge?.strengths ?? [] },
    { key: "weaknesses" as const, items: run.judge?.weaknesses ?? [] },
    { key: "deductions" as const, items: run.judge?.deductions ?? [] },
  ].filter((group) => group.items.length > 0);

  const judge = run.judge;
  const hasCriteria = judge !== null && JUDGE_CRITERIA.some((criterion) => judge.scores[criterion] !== null);
  const insights = run.research?.insights;
  const factsUsed = run.post?.factsUsed ?? [];

  return (
    <div className="stack result">
      {run.failure && (
        <div className="notice notice-error" role="alert">
          <p className="notice-title">
            {run.failure.step
              ? t("failureAtStep", { step: tSteps(`${run.failure.step}.name`) })
              : t("failureUnknownStep")}
          </p>
          <p>{tIssues(run.failure.code)}</p>
          {run.failure.detail && (
            <details>
              <summary>{t("technicalDetail")}</summary>
              <code className="detail-code">{run.failure.detail}</code>
            </details>
          )}
        </div>
      )}

      {run.post && (
        <section className="panel" aria-labelledby={`post-${run.id}`}>
          <div className="panel-head">
            <h3 id={`post-${run.id}`}>{t("post")}</h3>
            <span className="muted small">{t("words", { count: run.post.wordCount })}</span>
            <CopyButton text={run.post.content} />
          </div>
          <div className="post-body">{run.post.content}</div>
        </section>
      )}

      {(run.validation || run.judge) && (
        <section className="panel" aria-labelledby={`scores-${run.id}`}>
          <h3 id={`scores-${run.id}`}>{t("scores")}</h3>
          <div className="scores">
            <ScoreBar label={t("validator")} score={run.validation?.score ?? run.validatorScore} emphasis />
            <ScoreBar label={t("judge")} score={run.judge?.overall ?? run.judgeScore} emphasis />
            {hasCriteria &&
              JUDGE_CRITERIA.map((criterion) => (
                <ScoreBar key={criterion} label={tCriteria(criterion)} score={judge.scores[criterion]} />
              ))}
          </div>
          <ul className="meta-list">
            {run.validation?.verdict && (
              <li>
                {t("validator")} · {t("verdict", { verdict: run.validation.verdict })}
              </li>
            )}
            {run.judge?.verdict && (
              <li>
                {t("judge")} · {t("verdict", { verdict: run.judge.verdict })}
              </li>
            )}
            {run.judge?.model && <li>{t("judgedBy", { model: run.judge.model })}</li>}
          </ul>
        </section>
      )}

      {feedback.length > 0 && (
        <section className="panel" aria-labelledby={`feedback-${run.id}`}>
          <h3 id={`feedback-${run.id}`}>{t("feedback")}</h3>
          <div className="feedback-grid">
            {feedback.map((group) => (
              <div key={group.key}>
                <h4>{t(group.key)}</h4>
                <ul className="bullets">
                  {group.items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {run.research && (
        <section className="panel" aria-labelledby={`research-${run.id}`}>
          <h3 id={`research-${run.id}`}>{t("research")}</h3>
          <div className="feedback-grid">
            {insights && insights.keyFacts.length > 0 && (
              <div>
                <h4>{t("keyFacts")}</h4>
                <ul className="bullets">
                  {insights.keyFacts.map((fact, index) => (
                    <li key={index}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
            {insights && insights.trendingAngles.length > 0 && (
              <div>
                <h4>{t("trendingAngles")}</h4>
                <ul className="bullets">
                  {insights.trendingAngles.map((angle, index) => (
                    <li key={index}>{angle}</li>
                  ))}
                </ul>
              </div>
            )}
            {factsUsed.length > 0 && (
              <div>
                <h4>{t("factsUsed")}</h4>
                <ul className="bullets">
                  {factsUsed.map((fact, index) => (
                    <li key={index}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {run.research.sources.length > 0 && (
            <>
              <h4>{t("sources")}</h4>
              <ol className="sources">
                {run.research.sources.map((source, index) => (
                  <li key={`${source.url}-${index}`}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ol>
            </>
          )}
          {run.research.queries.length > 0 && (
            <p className="muted small">
              {t("queries")}: {run.research.queries.join(" · ")}
            </p>
          )}
        </section>
      )}

      {run.issues.length > 0 && (
        <section className="panel" aria-labelledby={`warnings-${run.id}`}>
          <h3 id={`warnings-${run.id}`}>{t("warnings")}</h3>
          <ul className="issues">
            {run.issues.map((issue, index) => (
              <li key={index}>
                <span className="issue-step">{tSteps(`${issue.step}.name`)}</span> {tIssues(issue.code)}
                {issue.detail && <code className="detail-code">{issue.detail}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
