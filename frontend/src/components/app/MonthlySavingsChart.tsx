import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { useChartTheme, POSITIVE, NEGATIVE } from '@/lib/chartTheme'
import { formatMoney } from '@/lib/utils'
import type { MonthlySavingsPoint } from '@/types'
import { type Range, RANGES } from '@/lib/savingsUtils'

const MONTH_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmtAxisMonth(v: string): string {
  const [year, month] = v.split('-')
  return `${MONTH_ABBR[parseInt(month) - 1]} '${year.slice(2)}`
}

interface Props {
  months: MonthlySavingsPoint[]   // already filtered by parent
  range: Range
  onRangeChange: (r: Range) => void
  normalize: boolean
  onNormalizeChange: (n: boolean) => void
  deltaCount: number              // how many months have a delta (for normalize hint)
  selectedMonth?: string | null
  onMonthSelect?: (month: string | null) => void
}

export function MonthlySavingsChart({
  months, range, onRangeChange, normalize, onNormalizeChange, deltaCount,
  selectedMonth, onMonthSelect,
}: Props) {
  const ct = useChartTheme()

  const chartData = useMemo(() =>
    months
      .filter(m => m.real_savings !== null)
      .map(m => ({
        month: m.month,
        real_savings: parseFloat(m.real_savings!),
        cash_delta: parseFloat(m.cash_delta ?? '0'),
        investment_cost_delta: parseFloat(m.investment_cost_delta ?? '0'),
        cash_end: parseFloat(m.cash_end),
      })),
    [months]
  )

  const canNormalize = deltaCount >= 6
  const hasSelection = selectedMonth != null && chartData.some(d => d.month === selectedMonth)

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={ct.tooltipStyle as React.CSSProperties}>
        <p style={ct.tooltipLabelStyle as React.CSSProperties}>{fmtAxisMonth(label)}</p>
        <p style={{
          ...(ct.tooltipItemStyle as React.CSSProperties),
          color: d.real_savings >= 0 ? POSITIVE : NEGATIVE,
          fontWeight: 600,
        }}>
          Ahorro real: {d.real_savings >= 0 ? '+' : ''}{formatMoney(d.real_savings)}
        </p>
        <p style={ct.tooltipItemStyle as React.CSSProperties}>
          Δ Efectivo: {d.cash_delta >= 0 ? '+' : ''}{formatMoney(d.cash_delta)}
        </p>
        <p style={ct.tooltipItemStyle as React.CSSProperties}>
          Δ Coste inv.: {d.investment_cost_delta >= 0 ? '+' : ''}{formatMoney(d.investment_cost_delta)}
        </p>
      </div>
    )
  }

  if (chartData.length === 0) return null

  // 30px per bar gives ~360px for 12 months — fits most phones without scrolling
  const minWidth = Math.max(chartData.length * 30, 260)

  const handleBarClick = (data: any) => {
    if (!onMonthSelect) return
    const month: string = data?.activePayload?.[0]?.payload?.month
    if (!month) return
    // Toggle: clicking the same bar deselects
    onMonthSelect(selectedMonth === month ? null : month)
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        {/*
          Mobile:  title on row 1, controls full-width on row 2
          Desktop: title left, controls right on same row
        */}
        <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">

            {/* Title */}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ahorro mensual real
            </p>

            {/* Controls */}
            <div className="flex items-center gap-2">

              {/* Sin outliers toggle */}
              <button
                onClick={() => onNormalizeChange(!normalize)}
                title={
                  canNormalize
                    ? 'Media trimmed: excluye el mejor y peor mes'
                    : 'Necesitas al menos 6 meses en el rango'
                }
                className={`shrink-0 px-2.5 py-1.5 font-mono text-[10px] tracking-wide rounded-md border transition-all duration-150 ${
                  normalize && canNormalize
                    ? 'bg-background shadow-sm text-primary border-primary/20'
                    : normalize && !canNormalize
                      ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                Sin outliers
              </button>

              {/* Divider */}
              <div className="shrink-0 h-4 w-px bg-border/60" />

              {/* Range selector — buttons expand to fill width on mobile */}
              <div className="flex flex-1 sm:flex-none gap-0.5 bg-secondary/50 border border-border rounded-lg p-1">
                {RANGES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => onRangeChange(key)}
                    className={`flex-1 sm:flex-none px-0 sm:px-3 py-1.5 sm:py-1.5 font-mono text-[10px] tracking-wide rounded-md transition-all duration-150 ${
                      range === key
                        ? 'bg-background shadow-sm text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* ── Chart ─────────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div style={{ minWidth }}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                onClick={onMonthSelect ? handleBarClick : undefined}
                style={onMonthSelect ? { cursor: 'pointer' } : undefined}
              >
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtAxisMonth}
                  tick={ct.axisTick}
                  tickLine={false}
                  axisLine={false}
                  interval={chartData.length > 24 ? Math.floor(chartData.length / 12) : 'preserveStartEnd'}
                />
                <YAxis
                  tick={ct.axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v)
                    if (abs >= 1000) return `${(v / 1000).toFixed(0)}k€`
                    return `${v.toFixed(0)}€`
                  }}
                  width={42}
                />
                <ReferenceLine y={0} stroke={ct.border as string} strokeWidth={1} />
                <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="real_savings" radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {chartData.map((entry, index) => {
                    const isSelected = entry.month === selectedMonth
                    // When a selection is active, dim unselected bars
                    const opacity = hasSelection && !isSelected ? 0.35 : 0.85
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.real_savings >= 0 ? POSITIVE : NEGATIVE}
                        fillOpacity={opacity}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}
