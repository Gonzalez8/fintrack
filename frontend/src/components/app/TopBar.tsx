import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { formatMoney } from '@/lib/utils'

export function TopBar() {
  const { data } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })

  const unrealizedPnl = parseFloat(data?.total_unrealized_pnl ?? '0')
  const pnlClass = unrealizedPnl > 0 ? 'money-positive' : unrealizedPnl < 0 ? 'money-negative' : 'text-muted-foreground'

  return (
    <div
      className="hidden md:flex h-[52px] shrink-0 items-center gap-6 px-6 border-b"
      style={{ borderColor: 'hsl(var(--sidebar-border))' }}
    >
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">Patrimonio</span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data ? formatMoney(data.grand_total) : '—'}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">P&L</span>
        <span className={`font-mono text-sm font-medium tabular-nums ml-1.5 ${pnlClass}`}>
          {data ? (unrealizedPnl >= 0 ? '+' : '') + formatMoney(data.total_unrealized_pnl) : '—'}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">Mercado</span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data ? formatMoney(data.total_market_value) : '—'}
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground/60">Efectivo</span>
        <span className="font-mono text-sm font-medium tabular-nums ml-1.5">
          {data ? formatMoney(data.total_cash) : '—'}
        </span>
      </div>
    </div>
  )
}
