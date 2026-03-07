"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Landmark, Wallet, ArrowLeftRight,
  Coins, Percent, FileText, Settings, LogOut, Moon, Sun,
  TrendingUp, PiggyBank, UserCircle, Globe,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";

const LANGUAGES = [
  { code: "es", label: "Espanol" },
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Francais" },
];

function useNavSections() {
  const t = useTranslations();
  return {
    sections: [
      {
        label: t("nav.summary"),
        links: [
          { href: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
          { href: "/portfolio", icon: Briefcase, label: t("nav.portfolio") },
        ],
      },
      {
        label: t("nav.operations"),
        links: [
          { href: "/assets", icon: Landmark, label: t("nav.assets") },
          { href: "/accounts", icon: Wallet, label: t("nav.accounts") },
          { href: "/transactions", icon: ArrowLeftRight, label: t("nav.operations") },
          { href: "/dividends", icon: Coins, label: t("nav.dividends") },
          { href: "/interests", icon: Percent, label: t("nav.interests") },
        ],
      },
      {
        label: t("nav.analysis"),
        links: [
          { href: "/savings", icon: PiggyBank, label: t("nav.savings") },
        ],
      },
    ],
    bottomLinks: [
      { href: "/tax", icon: FileText, label: t("nav.fiscal") },
      { href: "/settings", icon: Settings, label: t("nav.settings") },
      { href: "/profile", icon: UserCircle, label: t("nav.profile") },
    ],
    t,
  };
}

function SidebarLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all duration-150 border-l-2",
        isActive
          ? "border-primary bg-primary/[0.08] text-[#60a5fa]"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-[#60a5fa]" : "text-muted-foreground",
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const { sections, bottomLinks, t } = useNavSections();

  const handleLogout = async () => {
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const handleLanguage = (code: string) => {
    document.cookie = `fintrack_lang=${code};path=/;max-age=${365 * 86400}`;
    router.refresh();
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
        {sections.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="mb-1 px-4 font-mono text-[9px] tracking-[3px] uppercase text-muted-foreground/50">
              {section.label}
            </p>
            {section.links.map((link) => (
              <SidebarLink key={link.href} {...link} />
            ))}
          </div>
        ))}

        <div className="my-3 h-px bg-border/60 mx-4" />

        {bottomLinks.map((link) => (
          <SidebarLink key={link.href} {...link} />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 space-y-1 border-t border-sidebar-border">
        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all border-l-2 border-transparent hover:bg-secondary hover:text-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              {t("nav.language")}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => handleLanguage(lang.code)}
              >
                {lang.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all border-l-2 border-transparent hover:bg-secondary hover:text-foreground"
        >
          {isDark ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {isDark ? t("nav.lightMode") : t("nav.darkMode")}
        </button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground px-4 rounded-none border-l-2 border-transparent hover:border-transparent"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {t("nav.logout")}
        </Button>
      </div>
    </aside>
  );
}
