"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import { NAV_AREAS, findArea, isSectionActive, type NavArea } from "@/lib/navigation";

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all duration-150 border-l-2",
        active
          ? "border-primary bg-primary/[0.08] text-[#60a5fa]"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-[#60a5fa]" : "text-muted-foreground",
        )}
      />
      {label}
    </Link>
  );
}

const EXPANDED_KEY = "fintrack_nav_expanded";

function readExpanded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function SidebarGroup({
  area,
  active,
  open,
  onToggle,
}: {
  area: NavArea;
  active: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const label = t(area.labelKey);

  return (
    <div>
      <div className="relative">
        <SidebarLink href={area.sections[0].href} icon={area.icon} label={label} active={active && !open} />
        {!active && (
          <button
            onClick={onToggle}
            aria-expanded={open}
            aria-label={label}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
          </button>
        )}
      </div>
      {open && (
        <div className="mb-1">
          {area.sections.map((section) => {
            const sectionActive = isSectionActive(section.href, pathname);
            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  "flex items-center py-1.5 pl-[42px] pr-4 text-[13px] border-l-2 transition-colors",
                  sectionActive
                    ? "border-primary bg-primary/[0.08] font-medium text-[#60a5fa]"
                    : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {t(section.labelKey)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  const currentArea = findArea(pathname);
  const [expanded, setExpanded] = useState<string[] | null>(null);
  const expandedKeys = expanded ?? (mounted ? readExpanded() : []);

  const toggleArea = (key: string) => {
    const next = expandedKeys.includes(key)
      ? expandedKeys.filter((k) => k !== key)
      : [...expandedKeys, key];
    setExpanded(next);
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
    } catch { /* storage unavailable: keep it in memory */ }
  };

  return (
    <aside className="sticky top-0 hidden md:flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-sidebar-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.4)]">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <span className="font-mono text-[15px] font-bold tracking-[3px] uppercase">
          Fintrack
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_AREAS.map((area) => {
          const active = currentArea?.key === area.key;
          if (area.sections.length === 1) {
            return (
              <SidebarLink
                key={area.key}
                href={area.sections[0].href}
                icon={area.icon}
                label={t(area.labelKey)}
                active={active}
              />
            );
          }
          // The current area is always open; the rest remember the user's choice.
          const open = active || expandedKeys.includes(area.key);
          return (
            <SidebarGroup
              key={area.key}
              area={area}
              active={active}
              open={open}
              onToggle={() => toggleArea(area.key)}
            />
          );
        })}
      </nav>

    </aside>
  );
}
