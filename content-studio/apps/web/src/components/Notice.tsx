import type { ClientErrorCode } from "@studio/shared";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function ErrorNotice({ code }: { code: ClientErrorCode }) {
  const t = useTranslations("errors");
  return (
    <div className="notice notice-error" role="alert">
      <p className="notice-title">{t("title")}</p>
      <p>{t(code)}</p>
    </div>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <p className="notice notice-empty">{children}</p>;
}
