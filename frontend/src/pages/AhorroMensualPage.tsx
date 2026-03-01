import { useMemo, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/portfolio'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/app/PageHeader'
import { MoneyCell } from '@/components/app/MoneyCell'
import { MonthlySavingsChart } from '@/components/app/MonthlySavingsChart'
import { MonthlySavingsTable } from '@/components/app/MonthlySavingsTable'
import type { MonthlySavingsPoint, MonthlySavingsStats } from '@/types'
import { type Range, RANGE_LABELS, filterByRange } from '@/lib/savingsUtils'

// ─── Client-side stats (range-aware + trimmed mean) ──────────────────────────

interface ClientStats {
  current_cash: string
  last_month_delta: string | null
  avg_monthly_delta: string | null
  is_normalized: boolean
  best_month: MonthlySavingsPoint | null
  worst_month: MonthlySavingsPoint | null
  delta_count: number
}

function computeClientStats(months: MonthlySavingsPoint[], normalize: boolean): ClientStats | null {
  if (months.length === 0) return null

  const deltaMonths = months.filter(m => m.real_savings !== null)
  const indexed = deltaMonths.map(m => ({ m, delta: parseFloat(m.real_savings!) }))

  const best  = indexed.length > 0 ? indexed.reduce((a, x) => x.delta > a.delta ? x : a) : null
  const worst = indexed.length > 0 ? indexed.reduce((a, x) => x.delta < a.delta ? x : a) : null

  let avgDelta: number | null = null
  let isNormalized = false

  if (indexed.length >= 6 && normalize) {
    // Trimmed mean: drop the one highest and one lowest delta
    const sorted = [...indexed].sort((a, b) => a.delta - b.delta)
    const trimmed = sorted.slice(1, -1)
    avgDelta = trimmed.reduce((s, x) => s + x.delta, 0) / trimmed.length
    isNormalized = true
  } else if (indexed.length > 0) {
    avgDelta = indexed.reduce((s, x) => s + x.delta, 0) / indexed.length
  }

  const last = months[months.length - 1]
  return {
    current_cash: last.cash_end,
    last_month_delta: last.real_savings,
    avg_monthly_delta: avgDelta !== null ? avgDelta.toFixed(2) : null,
    is_normalized: isNormalized,
    best_month: best?.m ?? null,
    worst_month: worst?.m ?? null,
    delta_count: indexed.length,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MONTH_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmtMonthShort(m: string): string {
  const [year, month] = m.split('-')
  return `${MONTH_ABBR[parseInt(month) - 1]} ${year}`
}

function KpiCard({ label, value, colored, subtitle }: {
  label: string
  value: string | null
  colored?: boolean
  subtitle?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className="font-mono text-xl font-bold tabular-nums">
          {value == null
            ? <span className="text-muted-foreground">—</span>
            : colored
              ? <MoneyCell value={value} colored />
              : formatMoney(value)
          }
        </div>
        {subtitle && (
          <p className="font-mono text-[9px] text-muted-foreground mt-1 tracking-wide leading-tight">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function BestWorstCard({ best, worst }: {
  best: MonthlySavingsPoint | null
  worst: MonthlySavingsPoint | null
}) {
  return (
    <Card>
      <CardContent className="pb-4 pt-4 px-4 space-y-3">
        <div>
          <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-1">
            Mejor mes
          </p>
          <p className="font-mono text-lg font-bold tabular-nums money-positive leading-none">
            {best?.real_savings != null ? `+${formatMoney(best.real_savings)}` : '—'}
          </p>
          {best && (
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {fmtMonthShort(best.month)}
            </p>
          )}
        </div>
        <div className="h-px bg-border/60" />
        <div>
          <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-1">
            Peor mes
          </p>
          <p className={`font-mono text-lg font-bold tabular-nums leading-none ${
            worst?.real_savings != null && parseFloat(worst.real_savings) < 0
              ? 'money-negative'
              : 'money-positive'
          }`}>
            {worst?.real_savings != null ? formatMoney(worst.real_savings) : '—'}
          </p>
          {worst && (
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {fmtMonthShort(worst.month)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AhorroMensualPage() {
  const [range, setRange]           = useState<Range>('1A')
  const [normalize, setNormalize]   = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['monthly-savings'],
    queryFn: () => analyticsApi.monthlySavings().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const allMonths      = data?.months ?? []
  const filteredMonths = useMemo(() => filterByRange(allMonths, range), [allMonths, range])
  const stats          = useMemo(() => computeClientStats(filteredMonths, normalize), [filteredMonths, normalize])

  // Subtitle for the "Media mensual" card
  const avgSubtitle = stats
    ? `${RANGE_LABELS[range]}${stats.is_normalized ? ' · sin outliers' : ''}`
    : undefined

  // Scroll to table + set selected month when a chart bar is clicked
  const handleMonthSelect = useCallback((month: string | null) => {
    setSelectedMonth(month)
    if (month && tableRef.current) {
      requestAnimationFrame(() => {
        tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [])

  // Convert to MonthlySavingsStats shape for the table
  const tableStats: MonthlySavingsStats | null = stats
    ? {
        current_cash: stats.current_cash,
        last_month_delta: stats.last_month_delta,
        avg_monthly_delta: stats.avg_monthly_delta,
        best_month: stats.best_month,
        worst_month: stats.worst_month,
      }
    : null

  // ── Loading / error / empty ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ahorro mensual" subtitle="Flujo de efectivo mes a mes" />
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
          Cargando...
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ahorro mensual" subtitle="Flujo de efectivo mes a mes" />
        <p className="text-sm text-destructive">Error al cargar los datos.</p>
      </div>
    )
  }

  if (allMonths.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ahorro mensual" subtitle="Flujo de efectivo mes a mes" />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No hay snapshots de efectivo todavía.
            <br />
            Añade snapshots en el apartado de <strong>Cuentas</strong> para ver el historial.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ahorro mensual" subtitle="Flujo de efectivo mes a mes" />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Efectivo actual"
          value={stats?.current_cash ?? null}
        />
        <KpiCard
          label="Ahorro último mes"
          value={stats?.last_month_delta ?? null}
          colored
        />
        <KpiCard
          label="Media mensual"
          value={stats?.avg_monthly_delta ?? null}
          colored
          subtitle={avgSubtitle}
        />
        <BestWorstCard
          best={stats?.best_month ?? null}
          worst={stats?.worst_month ?? null}
        />
      </div>

      {/* ── Bar chart — range + normalize controls live here ── */}
      <MonthlySavingsChart
        months={filteredMonths}
        range={range}
        onRangeChange={setRange}
        normalize={normalize}
        onNormalizeChange={setNormalize}
        deltaCount={stats?.delta_count ?? 0}
        selectedMonth={selectedMonth}
        onMonthSelect={handleMonthSelect}
      />

      {/* ── Table — shows the same filtered window ── */}
      <div ref={tableRef}>
        <MonthlySavingsTable
          months={filteredMonths}
          stats={tableStats}
          title={range === 'MAX' ? 'Histórico completo' : RANGE_LABELS[range]}
          groupByYear={range === 'MAX'}
          selectedMonth={selectedMonth}
          onMonthSelect={setSelectedMonth}
        />
      </div>
    </div>
  )
}
