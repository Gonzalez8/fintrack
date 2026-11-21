"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, UserCircle, LogOut, Moon, Sun, Globe,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useUser } from "@/components/app/providers";
import { UserAvatar } from "@/components/app/user-avatar";
import { LANGUAGES, setLanguageCookie } from "@/components/app/account-menu";
import { cn } from "@/lib/utils";
import { clearOfflineData } from "@/lib/offline";
import { useTranslations } from "@/i18n/use-translations";

// Mobile account menu behind the avatar: profile, settings, language, theme and logout.
export function AccountSheet() {
  const t = useTranslations();
  const user = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const currentLang = mounted
    ? document.cookie.match(/(?:^|; )fintrack_lang=([^;]+)/)?.[1] ?? "es"
    : "";

  const handleLanguage = (code: string) => {
    setLanguageCookie(code);
    router.refresh();
  };

  const handleLogout = async () => {
    setOpen(false);
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    await clearOfflineData();
    router.push("/login");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("nav.profile")}
        className="shrink-0 rounded-full active:scale-95 transition-transform"
      >
        <UserAvatar user={user} className="h-9 w-9 text-sm" />
      </SheetTrigger>

      <SheetContent side="bottom" className="pb-safe-mobile">
        <SheetHeader className="px-4 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} className="h-11 w-11 text-base" />
            <div className="min-w-0 text-left">
              <SheetTitle className="truncate text-base">{user.username}</SheetTitle>
              {user.email && (
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 px-4">
          <button
            onClick={() => go("/settings")}
            className="flex items-center justify-center gap-2 rounded-lg bg-muted py-3 text-sm font-medium active:scale-95 transition-transform"
          >
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("nav.settings")}
          </button>
          <button
            onClick={() => go("/profile")}
            className="flex items-center justify-center gap-2 rounded-lg bg-muted py-3 text-sm font-medium active:scale-95 transition-transform"
          >
            <UserCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("nav.profile")}
          </button>
        </div>

        <div className="mt-4 border-t px-4 pt-3 pb-2 space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={t("nav.language")} />
            <div className="flex flex-1 gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguage(lang.code)}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold uppercase active:scale-95 transition-transform",
                    currentLang === lang.code ? "bg-primary/10 text-primary" : "bg-muted",
                  )}
                >
                  {lang.code}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted py-3 text-sm font-medium active:scale-95 transition-transform"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3 text-sm font-medium text-destructive active:scale-95 transition-transform"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("nav.logout")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
