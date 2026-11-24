import type { GenerationStatus } from "@studio/shared";
import { useTranslations } from "next-intl";

export function StatusBadge({ status }: { status: GenerationStatus }) {
  const t = useTranslations("status");
  return (
    <span className="badge" data-status={status}>
      {t(status)}
    </span>
  );
}
