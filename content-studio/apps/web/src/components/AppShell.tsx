import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { NavLinks } from "./NavLinks";

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const links = [
    { href: "/generate", label: t("nav.generate") },
    { href: "/history", label: t("nav.history") },
    { href: "/insights", label: t("nav.insights") },
    { href: "/prompts", label: t("nav.prompts") },
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        {t("nav.skipToContent")}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/generate" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            {t("meta.title")}
          </Link>
          <NavLinks links={links} label={t("nav.label")} />
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
