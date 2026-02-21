import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { reportsApi } from '@/api/portfolio'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { MoneyCell } from '@/components/app/MoneyCell'
import { formatMoney, formatPercent } from '@/lib/utils'
import { PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#6366f1', '#f97316',
]

export function DashboardPage() {
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })
  const { data: patrimonioEvo } = useQuery({
    queryKey: ['patrimonio-evolution'],
    queryFn: () => reportsApi.patrimonioEvolution().then((r) => r.data),
  })
  const { data: yearSummary } = useQuery({
    queryKey: ['year-summary'],
    queryFn: () => reportsApi.yearSummary().then((r) => r.data),
  })

  const currentYear = new Date().getFullYear()
  const currentYearData = yearSummary?.find((y) => y.year === currentYear)

  const pieData = portfolio?.positions.map((p) => ({
    name: p.asset_name,
    value: parseFloat(p.market_value),
  })) ?? []

  const barData = yearSummary?.map((y) => ({
    year: y.year,
    Dividendos: parseFloat(y.dividends_net),
    Intereses: parseFloat(y.interests_net),
    Ventas: parseFloat(y.sales_pnl),
  })).reverse() ?? []

  const allocationData = (() => {
    if (!portfolio) return []
    let rv = 0, rf = 0
    for (const p of portfolio.positions) {
      const mv = parseFloat(p.market_value)
      if (p.asset_type === 'STOCK' || p.asset_type === 'ETF' || p.asset_type === 'CRYPTO') rv += mv
      else rf += mv
    }
    const cash = parseFloat(portfolio.total_cash)
    return [
      { name: 'Renta Variable', value: rv },
      { name: 'Renta Fija', value: rf },
      { name: 'Efectivo', value: cash },
    ].filter((d) => d.value > 0)
  })()

  const ALLOC_COLORS: Record<string, string> = {
    'Renta Variable': '#2563eb',
    'Renta Fija': '#16a34a',
    'Efectivo': '#ca8a04',
  }

  const evolutionData = (patrimonioEvo ?? []).map((p) => {
    const cash = parseFloat(p.cash)
    const investments = parseFloat(p.investments)
    return {
      month: p.month,
      Efectivo: cash,
      Inversiones: investments,
      Total: cash + investments,
    }
  })

  const totalPnlPct = portfolio && parseFloat(portfolio.total_cost) > 0
    ? ((parseFloat(portfolio.total_unrealized_pnl) / parseFloat(portfolio.total_cost)) * 100).toFixed(2)
    : '0'

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Patrimonio Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(portfolio?.grand_total)}</div>
            {portfolio && parseFloat(portfolio.total_cash) > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                Inversiones: {formatMoney(portfolio.total_market_value)} + Efectivo: {formatMoney(portfolio.total_cash)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos {currentYear}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(currentYearData?.total_net ?? '0')}</div>
            {currentYearData && (
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div>Dividendos: {formatMoney(currentYearData.dividends_net)} · Intereses: {formatMoney(currentYearData.interests_net)}</div>
                <div>Ventas: <MoneyCell value={currentYearData.sales_pnl} colored /></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P&L No Realizado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <MoneyCell value={portfolio?.total_unrealized_pnl} colored />
              <span className="ml-2 text-sm">
                {formatPercent(totalPnlPct)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asignación de Patrimonio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ percent }) => `${(percent * 100).toFixed(1)}%`}>
                  {allocationData.map((d, i) => (
                    <Cell key={i} fill={ALLOC_COLORS[d.name] ?? COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución por Activo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {portfolio?.positions.map((p, i) => {
                const pct = parseFloat(p.weight_pct)
                return (
                  <div key={p.asset_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium truncate">{p.asset_name}</span>
                        {p.asset_ticker && <span className="text-xs text-muted-foreground shrink-0">{p.asset_ticker}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-muted-foreground">{formatMoney(p.market_value)}</span>
                        <span className="w-14 text-right font-medium">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingresos por Año</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div style={{ height: Math.max(300, barData.length * 50) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <XAxis type="number" tickFormatter={(v: number) => formatMoney(v)} />
                    <YAxis type="category" dataKey="year" width={50} />
                    <Tooltip
                      formatter={(v: number) => formatMoney(v)}
                      labelFormatter={(label) => `Año ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="Dividendos" stackId="income" fill="#2563eb" />
                    <Bar dataKey="Intereses" stackId="income" fill="#16a34a" />
                    <Bar dataKey="Ventas" stackId="income" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {evolutionData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolucion del Patrimonio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={evolutionData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Area type="monotone" dataKey="Efectivo" stackId="1" fill="#ca8a04" stroke="#ca8a04" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Inversiones" stackId="1" fill="#2563eb" stroke="#2563eb" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
