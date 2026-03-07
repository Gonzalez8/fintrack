"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { formatMoney, moneyColor } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { PortfolioData } from "@/types";

export function TopBar() {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
  });

  const unrealizedPnl = parseFloat(data?.totals?.total_unrealized_pnl ?? "0");
  const pnlClass = moneyColor(unrealizedPnl);

  return (
    <div className="hidden md:flex h-[52px] shrink-0 items-center gap-6 px-6 border-b border-sidebar-border">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">
          {t("topbar.patrimony")}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data?.totals
            ? formatMoney(data.totals.grand_total)
            : "\u2014"}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">
          P&L
        </span>
        <span
          className={`font-mono text-sm font-medium tabular-nums ml-1.5 ${pnlClass}`}
        >
          {data?.totals
            ? (unrealizedPnl >= 0 ? "+" : "") +
              formatMoney(data.totals.total_unrealized_pnl)
            : "\u2014"}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">
          {t("topbar.market")}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data?.totals ? formatMoney(data.totals.total_market_value) : "\u2014"}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">
          {t("topbar.cash")}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data?.totals ? formatMoney(data.totals.total_cash) : "\u2014"}
        </span>
      </div>
    </div>
  );
}
