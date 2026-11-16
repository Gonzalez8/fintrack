import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { uiLocale } from "@/lib/utils";
import type { StockSplit } from "@/types";

/** "4:1" for a 4-for-1 split, "1:10" for a 1-for-10 reverse split. */
export function formatSplitRatio(split: Pick<StockSplit, "ratio_from" | "ratio_to">): string {
  return `${Number(split.ratio_to)}:${Number(split.ratio_from)}`;
}

export function formatSplitDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(uiLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A split changes quantities and unit costs across the whole app (positions,
 * reports, tax), so refresh every query plus the server-rendered data.
 */
export function useSplitsChanged() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(() => {
    queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}
