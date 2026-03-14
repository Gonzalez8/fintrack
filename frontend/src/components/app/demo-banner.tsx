"use client";

import { useTranslations } from "@/i18n/use-translations";

export function DemoBanner() {
  const t = useTranslations();

  return (
    <div className="bg-amber-500/90 text-white text-center text-sm py-1.5 px-4 font-medium">
      <span className="font-semibold">{t("demo.banner")}</span>
      {" — "}
      {t("demo.bannerMessage")}
    </div>
  );
}
