import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <PageHeader title={t("title")} subtitle={t("body")}>
      <p>
        <Link href="/generate" className="btn btn-primary">
          {t("home")}
        </Link>
      </p>
    </PageHeader>
  );
}
