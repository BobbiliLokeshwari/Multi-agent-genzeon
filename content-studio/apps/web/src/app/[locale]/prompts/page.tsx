import { splitTemplate } from "@studio/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyNotice, ErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";
import { attempt } from "@/lib/api/http";
import { serverApi } from "@/lib/api/server";
import { firstParam, type SearchParams } from "@/lib/params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prompts");
  return { title: t("title") };
}

export default async function PromptsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("prompts");
  const format = await getFormatter();
  const params = await searchParams;
  const header = <PageHeader title={t("title")} subtitle={t("subtitle")} />;

  const versions = await attempt(serverApi.prompts());
  if (!versions.ok) return <div className="stack-lg">{header}<ErrorNotice code={versions.error.code} /></div>;
  if (versions.data.length === 0) return <div className="stack-lg">{header}<EmptyNotice>{t("empty")}</EmptyNotice></div>;

  const requested = firstParam(params.version);
  const selected =
    versions.data.find((v) => v.version === requested) ??
    versions.data.find((v) => v.isDefault) ??
    versions.data[0]!;
  const detail = await attempt(serverApi.promptVersion(selected.version));
  if (!detail.ok) return <div className="stack-lg">{header}<ErrorNotice code={detail.error.code} /></div>;

  const requestedFile = firstParam(params.file);
  const file = detail.data.files.find((f) => f.name === requestedFile) ?? detail.data.files[0];

  return (
    <div className="stack-lg">
      {header}
      <div className="prompts-layout">
        <nav className="card stack" aria-label={t("versions")}>
          {versions.data.map((version) => (
            <div key={version.version} className="stack-sm">
              <p className="eyebrow">
                {version.version}
                {version.isDefault && <span className="tag">{t("default")}</span>}
              </p>
              <ul className="file-list">
                {version.files.map((entry) => {
                  const current = version.version === selected.version && entry.name === file?.name;
                  return (
                    <li key={entry.name}>
                      <Link
                        href={{ pathname: "/prompts", query: { version: version.version, file: entry.name } }}
                        aria-current={current ? "page" : undefined}
                      >
                        {entry.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {file && (
          <article className="card stack" aria-labelledby="prompt-file">
            <div className="panel-head">
              <h2 id="prompt-file" className="mono">{file.name}</h2>
              <span className="tag">{t(`kinds.${file.kind}`)}</span>
              <span className="muted small">
                {format.number(file.bytes, { style: "unit", unit: "byte", unitDisplay: "narrow" })}
              </span>
            </div>
            <div>
              <h3 className="small-heading">{t("placeholders")}</h3>
              {file.placeholders.length === 0 ? (
                <p className="muted small">{t("noPlaceholders")}</p>
              ) : (
                <ul className="chips">
                  {file.placeholders.map((name) => (
                    <li key={name} className="chip mono">${name}</li>
                  ))}
                </ul>
              )}
            </div>
            <pre className="code-block">
              {splitTemplate(file.content).map((part, index) =>
                part.placeholder ? <mark key={index} className="placeholder">{part.text}</mark> : part.text,
              )}
            </pre>
          </article>
        )}
      </div>
    </div>
  );
}
