import { POST_TYPES, TONES, generationIdSchema, isOneOf, isTerminalStatus } from "@studio/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { GenerationResult } from "@/components/GenerationResult";
import { ErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { StepTimeline } from "@/components/StepTimeline";
import { Link } from "@/i18n/navigation";
import { attempt } from "@/lib/api/http";
import { serverApi } from "@/lib/api/server";
import { UI } from "@/lib/ui";

interface DetailProps {
  params: Promise<{ locale: string; id: string }>;
}

const SECONDS_PER_MINUTE = 60;

async function load(id: string) {
  if (!generationIdSchema.safeParse(id).success) notFound();
  const result = await attempt(serverApi.generation(id));
  if (!result.ok && result.error.code === "NOT_FOUND") notFound();
  return result;
}

export async function generateMetadata({ params }: DetailProps): Promise<Metadata> {
  const result = await load((await params).id);
  return result.ok ? { title: result.data.topic } : {};
}

export default async function GenerationDetailPage({ params }: DetailProps) {
  const t = await getTranslations();
  const format = await getFormatter();
  const result = await load((await params).id);
  if (!result.ok) return <ErrorNotice code={result.error.code} />;
  const run = result.data;

  const tone = isOneOf(TONES, run.tone) ? t(`tones.${run.tone}`) : run.tone || t("common.notAvailable");
  const postType = isOneOf(POST_TYPES, run.postType)
    ? t(`postTypes.${run.postType}`)
    : run.postType || t("common.notAvailable");
  const durationSeconds =
    run.startedAt && run.finishedAt
      ? (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
      : null;
  const duration =
    durationSeconds === null
      ? t("common.notAvailable")
      : durationSeconds >= SECONDS_PER_MINUTE
        ? format.number(durationSeconds / SECONDS_PER_MINUTE, { style: "unit", unit: "minute", maximumFractionDigits: 1 })
        : format.number(durationSeconds, { style: "unit", unit: "second", maximumFractionDigits: 0 });

  const meta: Array<[string, ReactNode]> = [
    [t("detail.status"), <StatusBadge key="status" status={run.status} />],
    [t("detail.source"), t(`source.${run.source}`)],
    [t("detail.tone"), tone],
    [t("detail.postType"), postType],
    [t("detail.promptVersion"), run.promptVersion],
    [t("detail.agentModel"), run.agentModel ?? t("common.notAvailable")],
    [t("detail.judgeModel"), run.judgeModel ?? t("common.notAvailable")],
    [t("detail.attempts"), format.number(run.attempts)],
    [t("detail.created"), format.dateTime(new Date(run.createdAt), UI.dateTimeFormat)],
    [t("detail.duration"), duration],
  ];

  return (
    <div className="stack-lg">
      <p>
        <Link href="/history">← {t("detail.back")}</Link>
      </p>
      <PageHeader eyebrow={t("detail.eyebrow")} title={run.topic} />
      <dl className="meta-grid">
        {meta.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!isTerminalStatus(run.status) && (
        <p className="notice" role="status">
          {t("detail.inProgress")}{" "}
          <Link href={{ pathname: "/generate", query: { run: run.id } }}>{t("detail.watchLive")}</Link>
        </p>
      )}
      <StepTimeline generation={run} />
      <GenerationResult generation={run} />
    </div>
  );
}
