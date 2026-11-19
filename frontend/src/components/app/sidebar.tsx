"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Settings, LogOut, Moon, Sun,
  TrendingUp, UserCircle, Globe, Eye, EyeOff, ChevronsUpDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { usePrivacy } from "@/lib/privacy";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/components/app/providers";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import { NAV_AREAS, findArea } from "@/lib/navigation";

export const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
];

export function setLanguageCookie(code: string) {
  document.cookie = `fintrack_lang=${code};path=/;max-age=${365 * 86400}`;
}

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

export function Sidebar() {
  const t = useTranslations();
  const user = useUser();
  const { resolvedTheme, setTheme } = useTheme();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const pathname = usePathname();
  const currentArea = findArea(pathname);

  const handleLogout = async () => {
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const handleLanguage = (code: string) => {
    setLanguageCookie(code);
    router.refresh();
  };

  const initial = (user.username || "?").charAt(0).toUpperCase();

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
        {NAV_AREAS.map((area) => (
          <SidebarLink
            key={area.key}
            href={area.sections[0].href}
            icon={area.icon}
            label={t(area.labelKey)}
            active={currentArea?.key === area.key}
          />
        ))}
      </nav>

      {/* Account */}
      <div className="flex items-center gap-1 p-2 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.username}</span>
              {user.email && (
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <UserCircle /> {t("nav.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings /> {t("nav.settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe /> {t("nav.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem key={lang.code} onClick={() => handleLanguage(lang.code)}>
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun /> : <Moon />}
              {isDark ? t("nav.lightMode") : t("nav.darkMode")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut /> {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={togglePrivacy}
          aria-label={privacyMode ? t("nav.showAmounts") : t("nav.hideAmounts")}
          title={privacyMode ? t("nav.showAmounts") : t("nav.hideAmounts")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            privacyMode ? "text-primary" : "text-muted-foreground",
          )}
        >
          {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
