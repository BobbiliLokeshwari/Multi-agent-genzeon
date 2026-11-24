"use client";

import { useTranslations } from "next-intl";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  return (
    <div className="notice notice-error stack" role="alert">
      <p className="notice-title">{t("errors.title")}</p>
      <p>{t("errors.INTERNAL_ERROR")}</p>
      <div>
        <button type="button" className="btn" onClick={reset}>
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}
