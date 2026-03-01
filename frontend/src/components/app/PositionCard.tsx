import { Badge } from '@/components/ui/badge'
import { formatMoney, formatPercent, formatQty } from '@/lib/utils'
import { TYPE_BADGE_COLORS } from '@/lib/constants'
import type { Position } from '@/types'

// ─── PositionCard ─────────────────────────────────────────────────────────────

interface Props {
  position: Position
  onClick: () => void
}

export function PositionCard({ position, onClick }: Props) {
  const pnl = parseFloat(position.unrealized_pnl)
  const pnlPct = parseFloat(position.unrealized_pnl_pct)
  const weight = parseFloat(position.weight_pct)
  const isPositive = pnl >= 0
  const pnlColor = isPositive ? 'money-positive' : 'money-negative'

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-4
                 transition-all duration-200 active:bg-muted/40
                 hover:border-primary/25 dark:hover:shadow-glow-blue
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* ── Header: nombre + badge tipo ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">
            {position.asset_name}
          </p>
          {position.asset_ticker && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {position.asset_ticker}
            </p>
          )}
        </div>
        <Badge
          className={`${TYPE_BADGE_COLORS[position.asset_type] ?? ''} shrink-0`}
          variant="secondary"
        >
          {position.asset_type}
        </Badge>
      </div>

      {/* ── Fila principal: valor mercado + P&L ── */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground mb-0.5">
            Valor
          </p>
          <p className="text-xl font-bold tabular-nums leading-none">
            {formatMoney(position.market_value)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground mb-0.5">
            P&amp;L
          </p>
          <p className={`text-base font-bold tabular-nums leading-none ${pnlColor}`}>
            {isPositive ? '+' : ''}{formatMoney(pnl)}
          </p>
          <p className={`text-xs tabular-nums mt-0.5 ${pnlColor}`}>
            {formatPercent(pnlPct)}
          </p>
        </div>
      </div>

      {/* ── Fila secundaria: coste + cantidad ── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>
          Coste:{' '}
          <span className="font-medium text-foreground">
            {formatMoney(position.cost_total)}
          </span>
        </span>
        <span>{formatQty(position.quantity)} acc.</span>
      </div>

      {/* ── Barra de peso en cartera ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(weight, 100)}%`, backgroundColor: '#3b82f6' }}
          />
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
          {weight.toFixed(1)}%
        </span>
      </div>
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function PositionCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-36 animate-pulse rounded bg-muted" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-5 w-14 animate-pulse rounded-full bg-muted shrink-0" />
      </div>
      {/* Main stats */}
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
          <div className="h-7 w-28 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-1.5 items-end flex flex-col">
          <div className="h-2.5 w-8 animate-pulse rounded bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {/* Secondary */}
      <div className="flex items-center justify-between">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
      {/* Weight bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-9 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
