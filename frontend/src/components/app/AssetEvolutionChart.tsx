import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { assetsApi } from '@/api/assets'
import { formatMoney } from '@/lib/utils'
import type { Position } from '@/types'

type Range = '1W' | '1M' | '3M' | '1Y' | 'MAX'

const RANGES: { key: Range; label: string }[] = [
  { key: '1W', label: '1S' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '1Y', label: '1A' },
  { key: 'MAX', label: 'MAX' },
]

interface ChartPoint {
  captured_at: string
  mv: number
  cb: number
}

function filterByRange(data: ChartPoint[], range: Range): ChartPoint[] {
  if (range === 'MAX' || !data.length) return data
  const now = new Date()
  const cutoff = new Date(now)
  if (range === '1W') cutoff.setDate(now.getDate() - 7)
  else if (range === '1M') cutoff.setMonth(now.getMonth() - 1)
  else if (range === '3M') cutoff.setMonth(now.getMonth() - 3)
  else cutoff.setFullYear(now.getFullYear() - 1)
  return data.filter((p) => new Date(p.captured_at) >= cutoff)
}

function formatTooltipDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatAxisDate(isoStr: string, range: Range): string {
  const d = new Date(isoStr)
  if (range === '1W') return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
  if (range === '1M') return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  if (range === '3M') return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

interface HoverState {
  value: number
  costBasis: number
  timestamp: string
}

interface Props {
  position: Position
}

export function AssetEvolutionChart({ position }: Props) {
  const [range, setRange] = useState<Range>('1Y')
  const [hover, setHover] = useState<HoverState | null>(null)

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['asset-position-history', position.asset_id],
    queryFn: () => assetsApi.positionHistory(position.asset_id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const allData = useMemo<ChartPoint[]>(
    () => rawData.map((p) => ({
      captured_at: p.captured_at,
      mv: parseFloat(p.market_value),
      cb: parseFloat(p.cost_basis),
    })),
    [rawData],
  )

  const chartData = useMemo(() => filterByRange(allData, range), [allData, range])
  const hasEnoughData = chartData.length >= 2

  const firstMV = hasEnoughData ? chartData[0].mv : 0
  const lastMV = hasEnoughData ? chartData[chartData.length - 1].mv : 0
  const isPositive = lastMV >= firstMV
  const color = isPositive ? '#16a34a' : '#dc2626'
  const gradientId = `asset-grad-${isPositive ? 'g' : 'r'}`

  const periodReturnAbs = lastMV - firstMV
  const periodReturnPct = firstMV > 0 ? (periodReturnAbs / firstMV) * 100 : 0

  const liveValue = parseFloat(position.market_value)
  const displayValue = hover ? hover.value : liveValue
  const displayCostBasis = hover ? hover.costBasis : parseFloat(position.cost_total)
  const displayTimestamp = hover ? hover.timestamp : null

  const xTicks = useMemo(() => {
    if (chartData.length <= 4) return chartData.map((p) => p.captured_at)
    const indices = [0, Math.floor(chartData.length / 3), Math.floor((2 * chartData.length) / 3), chartData.length - 1]
    return [...new Set(indices.map((i) => chartData[i].captured_at))]
  }, [chartData])

  const tickFormatter = useCallback((v: string) => formatAxisDate(v, range), [range])

  const handleMouseMove = useCallback((state: any) => {
    if (state?.isTooltipActive && state.activePayload?.[0]) {
      const payload = state.activePayload[0].payload as ChartPoint
      setHover({ value: payload.mv, costBasis: payload.cb, timestamp: payload.captured_at })
    }
  }, [])

  const handleMouseLeave = useCallback(() => setHover(null), [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Cargando historial...
      </div>
    )
  }

  if (allData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <p className="text-sm font-medium">Sin datos históricos</p>
        <p className="text-xs text-center max-w-xs">
          Activa los snapshots en Configuración para registrar la evolución de la cartera.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-4 pb-4">
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">
            {formatMoney(displayValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Coste: {formatMoney(displayCostBasis)}
          </p>
          <div className="mt-2 h-5">
            {displayTimestamp ? (
              <p className="text-sm text-muted-foreground">{formatTooltipDate(displayTimestamp)}</p>
            ) : !hasEnoughData ? (
              <p className="text-sm text-muted-foreground">Datos insuficientes para el período</p>
            ) : (
              <p className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {periodReturnAbs >= 0 ? '+' : ''}{formatMoney(periodReturnAbs)}{' '}
                <span className="text-xs">
                  ({periodReturnPct >= 0 ? '+' : ''}{periodReturnPct.toFixed(2)}%)
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
              onClick={() => { setRange(key); setHover(null) }}
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
        <ComposedChart
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

          <Tooltip cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.6 }} content={() => null} />

          <Area
            type="monotone"
            dataKey="mv"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: 'white', strokeWidth: 2 }}
            isAnimationActive
            animationDuration={400}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="cb"
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 pb-4 pt-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
          Valor de mercado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-gray-400" />
          Coste
        </span>
      </div>
    </div>
  )
}
