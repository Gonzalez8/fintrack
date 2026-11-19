"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, UserCircle, LogOut, Moon, Sun, Eye, EyeOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { usePrivacy } from "@/lib/privacy";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useUser } from "@/components/app/providers";
import { useTranslations } from "@/i18n/use-translations";

// Mobile account menu behind the avatar: settings, profile and display options.
export function AccountSheet() {
  const t = useTranslations();
  const user = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleLogout = async () => {
    setOpen(false);
    await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("nav.profile")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary active:scale-95 transition-transform"
      >
        {initial}
      </SheetTrigger>

      <SheetContent side="bottom" className="pb-safe-mobile">
        <SheetHeader className="px-4 pt-2 pb-4">
          <SheetTitle className="text-base">{user.username}</SheetTitle>
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
          <div className="flex gap-2">
            <button
              onClick={togglePrivacy}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium active:scale-95 transition-transform ${
                privacyMode ? "bg-primary/10 text-primary" : "bg-muted"
              }`}
            >
              {privacyMode ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {privacyMode ? t("nav.showAmounts") : t("nav.hideAmounts")}
            </button>

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
          </div>

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
