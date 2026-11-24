import { SCORE_MAX, scoreBand } from "@studio/shared";
import { useFormatter, useTranslations } from "next-intl";
import { UI } from "@/lib/ui";

export function ScoreBar({ label, score, emphasis = false }: { label: string; score: number | null; emphasis?: boolean }) {
  const t = useTranslations("common");
  const format = useFormatter();
  const value =
    score === null
      ? t("notScored")
      : t("scoreOutOf", { score: format.number(score, UI.scoreFormat), max: format.number(SCORE_MAX) });
  return (
    <div className="score" data-emphasis={emphasis || undefined} data-band={score === null ? undefined : scoreBand(score)}>
      <span className="score-label">{label}</span>
      <span className="score-track" aria-hidden="true">
        <span className="score-fill" style={{ inlineSize: `${((score ?? 0) / SCORE_MAX) * 100}%` }} />
      </span>
      <span className="score-value">{value}</span>
    </div>
  );
}
