"use client";

import { type ReactNode } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  rows: DetailRow[];
}

export function DetailDrawer({ open, onOpenChange, title, subtitle, rows }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3 border-b mb-3">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </SheetHeader>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-between items-baseline gap-4">
              <span className="text-sm text-muted-foreground shrink-0">{row.label}</span>
              <span className="text-sm font-mono tabular-nums text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
