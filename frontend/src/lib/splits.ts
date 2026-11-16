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

/** "4:1 split on 02/07/2026"-style summary, using the given i18n template. */
export function describeSplit(
  split: Pick<StockSplit, "ratio_from" | "ratio_to" | "date">,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return t("splits.splitOn", { ratio: formatSplitRatio(split), date: formatSplitDate(split.date) });
}

export type SplitRow<T> = { kind: "tx"; tx: T } | { kind: "split"; split: StockSplit };

/**
 * Interleave applied splits into one page of transactions sorted newest first.
 *
 * A split sorts just before the trades of its own date (those already happen
 * at post-split prices), so in a newest-first list it sits below them. Each
 * split lands on exactly one page: the one whose date range contains it.
 */
export function interleaveSplits<T extends { date: string }>(
  txs: T[],
  splits: StockSplit[],
  { isFirstPage, isLastPage }: { isFirstPage: boolean; isLastPage: boolean },
): SplitRow<T>[] {
  const rows: SplitRow<T>[] = txs.map((tx) => ({ kind: "tx", tx }));
  if (txs.length === 0) return rows;

  const newest = txs[0].date;
  const oldest = txs[txs.length - 1].date;
  const onPage = splits
    .filter((s) => (isFirstPage || s.date <= newest) && (isLastPage || s.date > oldest))
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const split of onPage) {
    const idx = rows.findIndex((r) => r.kind === "tx" && r.tx.date < split.date);
    rows.splice(idx === -1 ? rows.length : idx, 0, { kind: "split", split });
  }
  return rows;
}

/** Shares a transaction represents today, after later splits; null when unchanged. */
export function splitAdjustedQuantity(tx: { quantity: string; split_factor?: string | null }): number | null {
  const factor = Number(tx.split_factor ?? 1);
  if (!factor || factor === 1) return null;
  return Number(tx.quantity) * factor;
}
