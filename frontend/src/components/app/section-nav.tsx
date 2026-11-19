"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountSheet } from "@/components/app/account-sheet";
import { findArea, isSectionActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";

const STANDALONE_TITLES: Record<string, string> = {
  "/settings": "nav.settings",
  "/profile": "nav.profile",
};

// Sticky header with the sections of the current area as underline tabs.
// Mobile also shows the area title and the account avatar.
export function SectionNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const area = findArea(pathname);
  const sections = area && area.sections.length > 1 ? area.sections : [];

  const standalone = Object.keys(STANDALONE_TITLES).find((href) =>
    isSectionActive(href, pathname),
  );
  const title = area
    ? t(area.labelKey)
    : standalone
      ? t(STANDALONE_TITLES[standalone])
      : "";

  const tabs = sections.length > 0 && (
    <div
      role="tablist"
      className="flex overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((section) => {
        const active = isSectionActive(section.href, pathname);
        return (
          <Link
            key={section.href}
            href={section.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex h-11 flex-[1_0_auto] items-center justify-center px-2 text-sm border-b-2 transition-colors md:flex-none md:px-4",
              active
                ? "border-primary font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {t(section.labelKey)}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <div
        className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <span className="truncate text-xl font-bold tracking-tight">{title}</span>
          <AccountSheet />
        </div>
        {tabs && <div className="px-2">{tabs}</div>}
      </div>

      {tabs && (
        <div className="sticky top-0 z-40 hidden border-b bg-background/95 px-4 backdrop-blur md:block">
          {tabs}
        </div>
      )}
    </>
  );
}
