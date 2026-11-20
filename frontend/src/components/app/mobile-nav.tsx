"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_AREAS, findArea } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";

export function MobileNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const currentArea = findArea(pathname);

  return (
    <nav
      aria-label={t("nav.mainNav")}
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-sidebar md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid h-16 grid-cols-5 items-stretch">
        {NAV_AREAS.map(({ key, icon: Icon, labelKey, sections }) => {
          const active = currentArea?.key === key;
          return (
            <Link
              key={key}
              href={sections[0].href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors select-none",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate px-0.5">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
