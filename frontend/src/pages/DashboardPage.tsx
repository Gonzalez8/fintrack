import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { reportsApi } from '@/api/portfolio'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { MoneyCell } from '@/components/app/MoneyCell'
import { RVEvolutionChart } from '@/components/app/RVEvolutionChart'
import { PatrimonioEvolutionChart } from '@/components/app/PatrimonioEvolutionChart'
import { formatMoney, formatPercent } from '@/lib/utils'
import { PageHeader } from '@/components/app/PageHeader'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useChartTheme, CHART_COLORS } from '@/lib/chartTheme'
import { useTranslation } from 'react-i18next'

export function DashboardPage() {
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })
  const { data: yearSummary } = useQuery({
    queryKey: ['year-summary'],
    queryFn: () => reportsApi.yearSummary().then((r) => r.data),
  })

  const ct = useChartTheme()
  const { t } = useTranslation()

  const currentYear = new Date().getFullYear()
  const currentYearData = yearSummary?.find((y) => y.year === currentYear)

  const pieData = portfolio?.positions.map((p) => ({
    name: p.asset_name,
    value: parseFloat(p.market_value),
  })) ?? []

  const barData = yearSummary?.map((y) => ({
    year: y.year,
    [t('dashboard.dividends')]: parseFloat(y.dividends_net),
    [t('dashboard.interests')]: parseFloat(y.interests_net),
    [t('dashboard.sales')]: parseFloat(y.sales_pnl),
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
      { name: t('dashboard.equities'), value: rv },
      { name: t('dashboard.fixedIncome'), value: rf },
      { name: t('topbar.cash'), value: cash },
    ].filter((d) => d.value > 0)
  })()

  const ALLOC_COLORS: Record<string, string> = {
    [t('dashboard.equities')]: '#3b82f6',
    [t('dashboard.fixedIncome')]: '#22c55e',
    [t('topbar.cash')]: '#f59e0b',
  }

  const totalPnlPct = portfolio && parseFloat(portfolio.total_cost) > 0
    ? ((parseFloat(portfolio.total_unrealized_pnl) / parseFloat(portfolio.total_cost)) * 100).toFixed(2)
    : '0'

  void pieData

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} />

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">{t('dashboard.totalPatrimony')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">{formatMoney(portfolio?.grand_total)}</div>
            {portfolio && parseFloat(portfolio.total_cash) > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {t('dashboard.investments')}: {formatMoney(portfolio.total_market_value)} + {t('dashboard.cash')}: {formatMoney(portfolio.total_cash)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">{t('dashboard.income', { year: currentYear })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">{formatMoney(currentYearData?.total_net ?? '0')}</div>
            {currentYearData && (
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div>{t('dashboard.dividends')}: {formatMoney(currentYearData.dividends_net)} · {t('dashboard.interests')}: {formatMoney(currentYearData.interests_net)}</div>
                <div>{t('dashboard.sales')}: <MoneyCell value={currentYearData.sales_pnl} colored /></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">{t('dashboard.unrealizedPnl')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">
              <MoneyCell value={portfolio?.total_unrealized_pnl} colored />
              <span className="ml-2 text-sm">
                {formatPercent(totalPnlPct)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.assetAllocation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ percent }: any) => `${(percent * 100).toFixed(1)}%`}
                >
                  {allocationData.map((d, i) => (
                    <Cell key={i} fill={ALLOC_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  contentStyle={ct.tooltipStyle}
                  labelStyle={ct.tooltipLabelStyle}
                  itemStyle={ct.tooltipItemStyle}
                />
                <Legend wrapperStyle={ct.legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.assetDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {portfolio?.positions.map((p, i) => {
                const pct = parseFloat(p.weight_pct)
                return (
                  <div key={p.asset_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="font-medium truncate">{p.asset_name}</span>
                        {p.asset_ticker && <span className="text-xs text-muted-foreground shrink-0">{p.asset_ticker}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-muted-foreground">{formatMoney(p.market_value)}</span>
                        <span className="w-14 text-right font-medium">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.incomeByYear')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div style={{ height: Math.max(300, barData.length * 50) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                      tick={ct.axisTick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis type="category" dataKey="year" width={42} tick={ct.axisTick} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: number) => formatMoney(v)}
                      labelFormatter={(label) => t('dashboard.yearLabel', { year: label })}
                      contentStyle={ct.tooltipStyle}
                      labelStyle={ct.tooltipLabelStyle}
                      itemStyle={ct.tooltipItemStyle}
                      cursor={ct.tooltipCursor}
                    />
                    <Legend wrapperStyle={ct.legendStyle} />
                    <Bar dataKey={t('dashboard.dividends')} stackId="income" fill="#3b82f6" />
                    <Bar dataKey={t('dashboard.interests')} stackId="income" fill="#22c55e" />
                    <Bar dataKey={t('dashboard.sales')} stackId="income" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <PatrimonioEvolutionChart />
      <RVEvolutionChart />
    </div>
  )
}
