import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { portfolioApi, reportsApi } from '@/api/portfolio'
import { formatMoney } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import type { RVPoint } from '@/types'

type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | 'MAX'

const RANGES: { key: Range; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1S' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '1Y', label: '1A' },
  { key: 'MAX', label: 'MAX' },
]

function filterByRange(data: RVPoint[], range: Range): RVPoint[] {
  if (range === 'MAX' || !data.length) return data
  const now = new Date()
  const cutoff = new Date(now)
  if (range === '1D') cutoff.setDate(now.getDate() - 1)
  else if (range === '1W') cutoff.setDate(now.getDate() - 7)
  else if (range === '1M') cutoff.setMonth(now.getMonth() - 1)
  else if (range === '3M') cutoff.setMonth(now.getMonth() - 3)
  else cutoff.setFullYear(now.getFullYear() - 1)
  return data.filter((p) => new Date(p.captured_at) >= cutoff)
}

function formatTooltipDate(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAxisDate(isoStr: string, range: Range): string {
  const d = new Date(isoStr)
  if (range === '1D')
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  if (range === '1W')
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
  if (range === '1M')
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  if (range === '3M')
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

interface HoverState {
  value: number
  timestamp: string
}

export function RVEvolutionChart() {
  const [range, setRange] = useState<Range>('1Y')
  const [hover, setHover] = useState<HoverState | null>(null)

  // Snapshot series: source of truth for the chart and range return
  const { data: allData = [], isLoading } = useQuery({
    queryKey: ['rv-evolution'],
    queryFn: () => reportsApi.rvEvolution().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Live portfolio value: updated after "Actualizar precios"
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
    staleTime: 30 * 1000,
  })

  const chartData = useMemo(() => filterByRange(allData, range), [allData, range])
  const hasEnoughData = chartData.length >= 2

  // Range return: always computed from first vs last PortfolioSnapshot in range
  const firstSnapshotValue = hasEnoughData ? parseFloat(chartData[0].value) : 0
  const lastSnapshotValue = hasEnoughData ? parseFloat(chartData[chartData.length - 1].value) : 0
  const isPositive = lastSnapshotValue >= firstSnapshotValue
  const color = isPositive ? '#16a34a' : '#dc2626'
  const gradientId = `rv-grad-${isPositive ? 'green' : 'red'}`

  const periodReturnAbs = lastSnapshotValue - firstSnapshotValue
  const periodReturnPct =
    firstSnapshotValue > 0 ? (periodReturnAbs / firstSnapshotValue) * 100 : 0

  // Live value from portfolio API — shown as the big number when not hovering
  const liveValue = portfolioData
    ? parseFloat(portfolioData.total_market_value)
    : lastSnapshotValue

  // Badge: live prices are fresher than the last snapshot
  const isLiveUpdated =
    !hover && hasEnoughData && Math.abs(liveValue - lastSnapshotValue) > 0.01

  // When hovering, show the snapshot point value; otherwise show live value
  const displayValue = hover ? hover.value : liveValue
  const displayTimestamp = hover ? hover.timestamp : null

  const xTicks = useMemo(() => {
    if (chartData.length <= 4) return chartData.map((p) => p.captured_at)
    const indices = [
      0,
      Math.floor(chartData.length / 3),
      Math.floor((2 * chartData.length) / 3),
      chartData.length - 1,
    ]
    return [...new Set(indices.map((i) => chartData[i].captured_at))]
  }, [chartData])

  const tickFormatter = useCallback((v: string) => formatAxisDate(v, range), [range])

  const handleMouseMove = useCallback((state: any) => {
    if (state?.isTooltipActive && state.activePayload?.[0]) {
      setHover({
        value: state.activePayload[0].value as number,
        timestamp: state.activePayload[0].payload.captured_at as string,
      })
    }
  }, [])

  const handleMouseLeave = useCallback(() => setHover(null), [])

  if (isLoading || allData.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Evolución Renta Variable
              </p>
              {isLiveUpdated && (
                <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  Actualizado ahora
                </span>
              )}
            </div>

            <p className="text-3xl font-bold tabular-nums leading-none">
              {formatMoney(displayValue)}
            </p>

            <div className="mt-2 h-5">
              {displayTimestamp ? (
                <p className="text-sm text-muted-foreground">
                  {formatTooltipDate(displayTimestamp)}
                </p>
              ) : !hasEnoughData ? (
                <p className="text-sm text-muted-foreground">Datos insuficientes</p>
              ) : (
                <p
                  className={`text-sm font-medium ${
                    isPositive ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {periodReturnAbs >= 0 ? '+' : ''}
                  {formatMoney(periodReturnAbs)}{' '}
                  <span className="text-xs">
                    ({periodReturnPct >= 0 ? '+' : ''}
                    {periodReturnPct.toFixed(2)}%)
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Range selector */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-1">
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setRange(key)
                  setHover(null)
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  range === key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            key={range}
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="captured_at"
              ticks={xTicks}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickFormatter={tickFormatter}
              padding={{ left: 16, right: 16 }}
            />
            <YAxis hide domain={['auto', 'auto']} />

            <Tooltip
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.6 }}
              content={() => null}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: 'white', strokeWidth: 2 }}
              isAnimationActive
              animationDuration={500}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
