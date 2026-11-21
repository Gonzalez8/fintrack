"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, LogOut, Moon, Sun, UserCircle, Globe, Eye, EyeOff, ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { usePrivacy } from "@/lib/privacy";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuLabel, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/components/app/providers";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import { clearOfflineData } from "@/lib/offline";
import { useTranslations } from "@/i18n/use-translations";

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

// Desktop account controls for the top bar: privacy shortcut + avatar menu.
export function AccountMenu() {
  const t = useTranslations();
  const user = useUser();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const handleLogout = async () => {
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    await clearOfflineData();
    router.push("/login");
  };

  const handleLanguage = (code: string) => {
    setLanguageCookie(code);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={togglePrivacy}
        aria-label={privacyMode ? t("nav.showAmounts") : t("nav.hideAmounts")}
        title={privacyMode ? t("nav.showAmounts") : t("nav.hideAmounts")}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
          privacyMode ? "text-primary" : "text-muted-foreground",
        )}
      >
        {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("nav.profile")}
          className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-secondary"
        >
          <UserAvatar user={user} className="h-7 w-7 text-xs" />
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
              <span className="truncate text-sm font-medium text-foreground">{user.username}</span>
              {user.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
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
    </div>
  );
}
