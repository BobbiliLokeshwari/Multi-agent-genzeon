import { GENERATION_STATUSES, POST_TYPES, TONES } from "@studio/shared";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GenerationTable } from "@/components/GenerationTable";
import { EmptyNotice, ErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";
import { attempt } from "@/lib/api/http";
import { serverApi } from "@/lib/api/server";
import { getConfig } from "@/lib/config";
import { firstParam, type SearchParams } from "@/lib/params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: t("title") };
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations();
  const params = await searchParams;
  const filters = {
    q: firstParam(params.q),
    status: firstParam(params.status),
    tone: firstParam(params.tone),
    postType: firstParam(params.postType),
  };
  const cursor = firstParam(params.cursor);
  const result = await attempt(
    serverApi.generations({ ...filters, ...(cursor ? { cursor } : {}), limit: getConfig().historyPageSize }),
  );
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Record<string, string>;

  return (
    <div className="stack-lg">
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />

      {/* A plain GET form: filtering works without JavaScript and every view has a shareable URL. */}
      <form className="filters" role="search" aria-label={t("history.filters")}>
        <div className="field">
          <label htmlFor="q">{t("history.search")}</label>
          <input id="q" name="q" type="search" defaultValue={filters.q} />
        </div>
        <div className="field">
          <label htmlFor="status">{t("history.status")}</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("history.all")}</option>
            {GENERATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tone">{t("history.tone")}</label>
          <select id="tone" name="tone" defaultValue={filters.tone ?? ""}>
            <option value="">{t("history.all")}</option>
            {TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`tones.${tone}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="postType">{t("history.postType")}</label>
          <select id="postType" name="postType" defaultValue={filters.postType ?? ""}>
            <option value="">{t("history.all")}</option>
            {POST_TYPES.map((postType) => (
              <option key={postType} value={postType}>
                {t(`postTypes.${postType}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button type="submit" className="btn btn-primary">
            {t("history.apply")}
          </button>
          <Link href="/history" className="btn">
            {t("history.reset")}
          </Link>
        </div>
      </form>

      {!result.ok ? (
        <ErrorNotice code={result.error.code} />
      ) : result.data.items.length === 0 ? (
        <EmptyNotice>{t("history.empty")}</EmptyNotice>
      ) : (
        <>
          <GenerationTable items={result.data.items} />
          <nav className="pager">
            {cursor && (
              <Link href={{ pathname: "/history", query: activeFilters }}>{t("history.first")}</Link>
            )}
            {result.data.nextCursor && (
              <Link href={{ pathname: "/history", query: { ...activeFilters, cursor: result.data.nextCursor } }}>
                {t("history.next")}
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
