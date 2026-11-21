"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/use-translations";

export interface CollapsedList<T> {
  items: T[];
  total: number;
  expanded: boolean;
  canExpand: boolean;
  toggle: () => void;
}

/** First `visible` items of a long list, with a toggle to show them all (lists on the asset page). */
export function useCollapsedList<T>(all: T[], visible = 5): CollapsedList<T> {
  const [expanded, setExpanded] = useState(false);
  return {
    items: expanded ? all : all.slice(0, visible),
    total: all.length,
    expanded,
    canExpand: all.length > visible,
    toggle: () => setExpanded((v) => !v),
  };
}

/** "Show all (N)" / "Show less" for a list from useCollapsedList; nothing when it fits. */
export function ShowAllButton<T>({ list, className }: { list: CollapsedList<T>; className?: string }) {
  const t = useTranslations();
  if (!list.canExpand) return null;
  return (
    <Button variant="ghost" size="sm" className={className ?? "h-8 px-2"} onClick={list.toggle}>
      {list.expanded ? t("common.showLess") : t("common.showAll", { count: list.total })}
    </Button>
  );
}
