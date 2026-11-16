"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/i18n/use-translations";
import { describeSplit } from "@/lib/splits";
import type { PositionSplit } from "@/types";

/** Small marker for positions whose quantity includes applied splits. */
export function SplitBadge({ splits }: { splits?: PositionSplit[] }) {
  const t = useTranslations();
  if (!splits?.length) return null;
  const detail = splits.map((s) => describeSplit(s, t)).join(" · ");
  return (
    <Badge
      variant="outline"
      title={t("splits.includes", { detail })}
      className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
    >
      {t("splits.badge")}
    </Badge>
  );
}
