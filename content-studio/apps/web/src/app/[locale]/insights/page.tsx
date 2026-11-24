import { POST_TYPES, SCORE_MAX, TONES, isOneOf, type InsightsGroup } from "@studio/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyNotice, ErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";
import { attempt } from "@/lib/api/http";
import { serverApi } from "@/lib/api/server";
import { UI } from "@/lib/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("insights");
  return { title: t("title") };
}

export default async function InsightsPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const result = await attempt(serverApi.insights());
  const header = <PageHeader title={t("insights.title")} subtitle={t("insights.subtitle")} />;
  if (!result.ok) return <div className="stack-lg">{header}<ErrorNotice code={result.error.code} /></div>;

  const data = result.data;
  const score = (value: number | null) =>
    value === null ? t("common.notAvailable") : format.number(value, UI.scoreFormat);
  const finished = data.totals.byStatus.SUCCEEDED + data.totals.byStatus.FAILED;
  const successRate =
    finished === 0
      ? t("common.notAvailable")
      : format.number(data.totals.byStatus.SUCCEEDED / finished, { style: "percent", maximumFractionDigits: 0 });
  const width = (value: number | null) => `${((value ?? 0) / SCORE_MAX) * 100}%`;

  const groupList = (title: string, groups: InsightsGroup[], label: (key: string) => string) => (
    <section className="card stack" aria-label={title}>
      <h2>{title}</h2>
      <ul className="bars">
        {groups.map((group) => (
          <li key={group.key} className="bar-row">
            <span className="bar-label">{label(group.key)}</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ inlineSize: width(group.avgJudge) }} />
            </span>
            <span className="bar-value">
              {t("insights.groupDetail", {
                count: group.count,
                judge: score(group.avgJudge),
                validator: score(group.avgValidator),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );

  // Imported CLI runs can carry free-text values; show those as typed.
  const toneLabel = (key: string) => (isOneOf(TONES, key) ? t(`tones.${key}`) : key);
  const typeLabel = (key: string) => (isOneOf(POST_TYPES, key) ? t(`postTypes.${key}`) : key);

  return (
    <div className="stack-lg">
      {header}
      <dl className="kpis">
        <div className="kpi">
          <dt>{t("insights.totalRuns")}</dt>
          <dd>{format.number(data.totals.all)}</dd>
        </div>
        <div className="kpi">
          <dt>{t("insights.successRate")}</dt>
          <dd>{successRate}</dd>
        </div>
        <div className="kpi">
          <dt>{t("insights.avgValidator")}</dt>
          <dd>{score(data.averages.validator)}</dd>
        </div>
        <div className="kpi">
          <dt>{t("insights.avgJudge")}</dt>
          <dd>{score(data.averages.judge)}</dd>
        </div>
      </dl>

      {data.averages.scoredRuns === 0 ? (
        <EmptyNotice>{t("insights.empty")}</EmptyNotice>
      ) : (
        <>
          <div className="two-col">
            {groupList(t("insights.byTone"), data.byTone, toneLabel)}
            {groupList(t("insights.byPostType"), data.byPostType, typeLabel)}
          </div>

          <section className="card stack" aria-labelledby="trend">
            <div>
              <h2 id="trend">{t("insights.trend")}</h2>
              <p className="muted small">
                {t("insights.trendSubtitle", { days: data.trend.days, timeZone: data.trend.timeZone })}
              </p>
            </div>
            {data.trend.points.length === 0 ? (
              <EmptyNotice>{t("insights.trendEmpty")}</EmptyNotice>
            ) : (
              <ul className="bars">
                {data.trend.points.map((point) => (
                  <li key={point.day} className="bar-row">
                    <span className="bar-label">
                      {/* Days are already in the requested zone; format them as UTC so they don't shift. */}
                      <time dateTime={point.day}>
                        {format.dateTime(new Date(`${point.day}T00:00:00Z`), {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                    </span>
                    <span className="bar-track" aria-hidden="true">
                      <span className="bar-fill" style={{ inlineSize: width(point.avgJudge) }} />
                    </span>
                    <span className="bar-value">
                      {t("insights.trendDetail", { count: point.count, score: score(point.avgJudge) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card stack" aria-labelledby="gap">
            <h2 id="gap">{t("insights.gapTitle")}</h2>
            {data.largestGap ? (
              <p>
                <Link href={`/history/${data.largestGap.id}`}>{data.largestGap.topic}</Link>
                {" — "}
                {t("insights.gapBody", {
                  validator: score(data.largestGap.validatorScore),
                  judge: score(data.largestGap.judgeScore),
                  gap: score(data.largestGap.gap),
                })}
              </p>
            ) : (
              <p className="muted">{t("insights.gapNone")}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
