"use client";

import { Link, usePathname } from "@/i18n/navigation";

export function NavLinks({ links, label }: { links: Array<{ href: string; label: string }>; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="nav">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
