"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Settings,
  Menu, Coins, Landmark, Wallet, Percent, FileText,
  LogOut, Moon, Sun, PiggyBank, UserCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";

export function MobileNav() {
  const t = useTranslations();

  const PRIMARY_TABS = [
    { href: "/", icon: LayoutDashboard, label: t("nav.home"), exact: true },
    { href: "/portfolio", icon: Briefcase, label: t("nav.portfolio"), exact: false },
    { href: "/transactions", icon: ArrowLeftRight, label: t("nav.operations"), exact: false },
  ];

  const SECONDARY_ITEMS = [
    { href: "/dividends", icon: Coins, label: t("nav.dividends") },
    { href: "/interests", icon: Percent, label: t("nav.interests") },
    { href: "/assets", icon: Landmark, label: t("nav.assets") },
    { href: "/accounts", icon: Wallet, label: t("nav.accounts") },
    { href: "/tax", icon: FileText, label: t("nav.fiscal") },
    { href: "/savings", icon: PiggyBank, label: t("nav.savings") },
    { href: "/profile", icon: UserCircle, label: t("nav.profile") },
  ];
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const handleLogout = async () => {
    setSheetOpen(false);
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const handleSecondaryNav = (href: string) => {
    setSheetOpen(false);
    router.push(href);
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navegacion principal"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-sidebar md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-stretch">
        {/* Primary tabs */}
        {PRIMARY_TABS.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors select-none relative",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className={active ? "font-mono" : ""}>{label}</span>
            </Link>
          );
        })}

        {/* "Mas" Sheet trigger */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
              aria-label="Mas secciones"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors select-none"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>{t("nav.more")}</span>
          </SheetTrigger>

          <SheetContent side="bottom" className="pb-safe-mobile">
            <SheetHeader className="px-4 pt-2 pb-4">
              <SheetTitle className="text-base">{t("nav.moreSections")}</SheetTitle>
            </SheetHeader>

            {/* Secondary nav grid */}
            <div className="grid grid-cols-3 gap-2 px-4">
              {SECONDARY_ITEMS.map(({ href, icon: Icon, label }) => (
                <button
                  key={href}
                  onClick={() => handleSecondaryNav(href)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-muted py-4 text-xs font-medium active:scale-95 transition-transform"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {/* Utility actions */}
            <div className="mt-4 border-t px-4 pt-3 pb-2 flex gap-2">
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-muted py-3 text-sm font-medium active:scale-95 transition-transform"
              >
                {isDark ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                )}
                {isDark ? t("nav.lightMode") : t("nav.darkMode")}
              </button>

              <button
                onClick={handleLogout}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3 text-sm font-medium text-destructive active:scale-95 transition-transform"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Config tab (direct) */}
        <Link
          href="/settings"
          aria-label="Settings"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors select-none relative",
            isActive("/settings", false)
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          {isActive("/settings", false) && (
            <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
          )}
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className={isActive("/settings", false) ? "font-mono" : ""}>
            {t("nav.config")}
          </span>
        </Link>
      </div>
    </nav>
  );
}
