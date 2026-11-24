import { generationIdSchema } from "@studio/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GenerateForm } from "@/components/GenerateForm";
import { GenerationTable } from "@/components/GenerationTable";
import { EmptyNotice, ErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { RunMonitor } from "@/components/RunMonitor";
import { Link } from "@/i18n/navigation";
import { generationEventsUrl } from "@/lib/api/browser";
import { attempt } from "@/lib/api/http";
import { serverApi } from "@/lib/api/server";
import { getConfig } from "@/lib/config";
import { firstParam, type SearchParams } from "@/lib/params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("generate");
  return { title: t("title") };
}

export default async function GeneratePage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("generate");
  const config = getConfig();
  const run = firstParam((await searchParams).run);
  const runId = run && generationIdSchema.safeParse(run).success ? run : null;

  const [catalog, recent] = await Promise.all([
    attempt(serverApi.catalog()),
    attempt(serverApi.generations({ limit: config.recentRunsLimit })),
  ]);

  return (
    <div className="stack-lg">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="generate-grid">
        <section className="card" aria-labelledby="new-post">
          <h2 id="new-post">{t("formTitle")}</h2>
          {catalog.ok ? (
            <GenerateForm catalog={catalog.data} apiUrl={config.publicApiUrl} />
          ) : (
            <ErrorNotice code={catalog.error.code} />
          )}
        </section>
        <div>
          {runId ? (
            <RunMonitor key={runId} eventsUrl={generationEventsUrl(config.publicApiUrl, runId)} />
          ) : (
            <EmptyNotice>{t("idle")}</EmptyNotice>
          )}
        </div>
      </div>
      <section className="stack" aria-labelledby="recent-runs">
        <div className="section-head">
          <h2 id="recent-runs">{t("recent")}</h2>
          <Link href="/history">{t("viewAll")}</Link>
        </div>
        {!recent.ok ? (
          <ErrorNotice code={recent.error.code} />
        ) : recent.data.items.length > 0 ? (
          <GenerationTable items={recent.data.items} />
        ) : (
          <EmptyNotice>{t("recentEmpty")}</EmptyNotice>
        )}
      </section>
    </div>
  );
}
