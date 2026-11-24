import type { GenerationSummary } from "@studio/shared";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useLabels } from "@/lib/labels";
import { UI } from "@/lib/ui";
import { StatusBadge } from "./StatusBadge";

export function GenerationTable({ items }: { items: GenerationSummary[] }) {
  const t = useTranslations("table");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const labels = useLabels();
  const score = (value: number | null) =>
    value === null ? tCommon("notAvailable") : format.number(value, UI.scoreFormat);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">{t("caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("topic")}</th>
            <th scope="col">{t("tone")}</th>
            <th scope="col">{t("postType")}</th>
            <th scope="col">{t("status")}</th>
            <th scope="col" className="num">{t("validator")}</th>
            <th scope="col" className="num">{t("judge")}</th>
            <th scope="col">{t("created")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <th scope="row" className="topic-cell">
                <Link href={`/history/${item.id}`}>{item.topic}</Link>
              </th>
              <td>{labels.tone(item.tone)}</td>
              <td>{labels.postType(item.postType)}</td>
              <td>
                <StatusBadge status={item.status} />
              </td>
              <td className="num">{score(item.validatorScore)}</td>
              <td className="num">{score(item.judgeScore)}</td>
              <td>
                <time dateTime={item.createdAt}>{format.dateTime(new Date(item.createdAt), UI.dateTimeFormat)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
