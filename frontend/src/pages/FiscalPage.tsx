import { useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, reportsApi } from '@/api/portfolio'
import { dividendsApi, interestsApi } from '@/api/transactions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { formatQty, formatPercent, formatMoney } from '@/lib/utils'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FiscalPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

  const { data: yearSummary } = useQuery({
    queryKey: ['year-summary'],
    queryFn: () => reportsApi.yearSummary().then((r) => r.data),
  })

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })

  const { data: dividendsData } = useQuery({
    queryKey: ['dividends-fiscal', year],
    queryFn: () => dividendsApi.list({ year, page_size: '500' }).then((r) => r.data),
  })

  const { data: interestsData } = useQuery({
    queryKey: ['interests-fiscal', year],
    queryFn: () => interestsApi.list({ year, page_size: '500' }).then((r) => r.data),
  })

  const summary = yearSummary?.find((y) => y.year === parseInt(year))

  // Ventas realizadas del año seleccionado
  const salesYear = portfolio?.realized_sales.filter((s) => s.date.startsWith(year)) ?? []
  const salesTotals = (() => {
    const qty  = salesYear.reduce((s, r) => s + parseFloat(r.quantity), 0)
    const cost = salesYear.reduce((s, r) => s + parseFloat(r.cost_basis), 0)
    const sell = salesYear.reduce((s, r) => s + parseFloat(r.sell_total), 0)
    const pnl  = salesYear.reduce((s, r) => s + parseFloat(r.realized_pnl), 0)
    const pct  = cost > 0 ? (pnl / cost * 100) : 0
    return { qty, cost, sell, pnl, pct }
  })()

  // Dividendos agrupados por país y activo
  const divByCountryAsset = new Map<string, Map<string, { name: string; ticker: string | null; gross: number; tax: number; net: number }>>()
  for (const d of dividendsData?.results ?? []) {
    const country = d.asset_issuer_country ?? '__none__'
    if (!divByCountryAsset.has(country)) divByCountryAsset.set(country, new Map())
    const assetMap = divByCountryAsset.get(country)!
    if (!assetMap.has(d.asset)) assetMap.set(d.asset, { name: d.asset_name, ticker: d.asset_ticker, gross: 0, tax: 0, net: 0 })
    const entry = assetMap.get(d.asset)!
    entry.gross += parseFloat(d.gross)
    entry.tax   += parseFloat(d.tax)
    entry.net   += parseFloat(d.net)
  }
  const sortedCountries = [...divByCountryAsset.keys()].sort((a, b) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })
  const divTotals = { gross: 0, tax: 0, net: 0 }
  for (const assetMap of divByCountryAsset.values()) {
    for (const r of assetMap.values()) {
      divTotals.gross += r.gross
      divTotals.tax   += r.tax
      divTotals.net   += r.net
    }
  }

  // Intereses agrupados por cuenta
  const intByAccount = new Map<string, { name: string; gross: number; net: number }>()
  for (const i of interestsData?.results ?? []) {
    const key = i.account
    if (!intByAccount.has(key)) intByAccount.set(key, { name: i.account_name, gross: 0, net: 0 })
    const entry = intByAccount.get(key)!
    entry.gross += parseFloat(i.gross)
    entry.net   += parseFloat(i.net)
  }
  const intRows   = [...intByAccount.values()].sort((a, b) => b.net - a.net)
  const intTotals = intRows.reduce((t, r) => ({ gross: t.gross + r.gross, net: t.net + r.net }), { gross: 0, net: 0 })

  return (
    <div className="space-y-8">
      <PageHeader title="Fiscal" subtitle="Declaración de la Renta">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)} className="font-mono">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Dividendos netos" value={summary?.dividends_net ?? '0'} />
        <KpiCard label="Intereses netos"  value={summary?.interests_net ?? '0'} />
        <KpiCard label="Ganancias ventas" value={summary?.sales_pnl ?? '0'} colored />
        <KpiCard label={`Total neto ${year}`} value={summary?.total_net ?? '0'} colored highlight />
      </div>

      {/* ── Ventas ── */}
      <section className="space-y-3">
        <SectionHeader
          eyebrow="Ganancias y pérdidas patrimoniales"
          title={`Ventas ${year}`}
          total={salesYear.length > 0 ? { value: String(salesTotals.pnl.toFixed(2)), colored: true } : undefined}
        />

        {salesYear.length === 0 ? (
          <EmptyState label={`Sin ventas en ${year}`} />
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {salesYear.map((s, i) => {
                const positive = parseFloat(s.realized_pnl) >= 0
                return (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{s.asset_name}</p>
                        {s.asset_ticker && (
                          <p className="font-mono text-xs text-muted-foreground">{s.asset_ticker}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono text-sm font-bold tabular-nums ${positive ? 'money-positive' : 'money-negative'}`}>
                          {formatMoney(s.realized_pnl)}
                        </p>
                        <p className={`font-mono text-[11px] tabular-nums ${positive ? 'money-positive' : 'money-negative'}`}>
                          {formatPercent(s.realized_pnl_pct)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 border-t border-border/40 pt-2">
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">Adquisición</p>
                        <p className="font-mono text-xs tabular-nums">{formatMoney(s.cost_basis)}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">Transmisión</p>
                        <p className="font-mono text-xs tabular-nums">{formatMoney(s.sell_total)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Totales mobile */}
              <TotalRow
                label="Suma total"
                cells={[
                  { label: 'Adquisición', value: formatMoney(String(salesTotals.cost.toFixed(2))) },
                  { label: 'Transmisión', value: formatMoney(String(salesTotals.sell.toFixed(2))) },
                  { label: 'Ganancia',    value: formatMoney(String(salesTotals.pnl.toFixed(2))),  colored: true, positive: salesTotals.pnl >= 0 },
                ]}
              />
            </div>

            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entidad</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Valor adquisición</TableHead>
                    <TableHead className="text-right">Valor transmisión</TableHead>
                    <TableHead className="text-right">Ganancia</TableHead>
                    <TableHead className="text-right">% Relativo venta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesYear.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-medium">{s.asset_name}</span>
                        {s.asset_ticker && <span className="ml-2 text-xs text-muted-foreground">{s.asset_ticker}</span>}
                      </TableCell>
                      <TableCell className="text-right">{formatQty(s.quantity)}</TableCell>
                      <TableCell className="text-right">{formatMoney(s.cost_basis)}</TableCell>
                      <TableCell className="text-right">{formatMoney(s.sell_total)}</TableCell>
                      <TableCell className="text-right"><MoneyCell value={s.realized_pnl} colored /></TableCell>
                      <TableCell className="text-right">{formatPercent(s.realized_pnl_pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>Suma total</TableCell>
                    <TableCell className="text-right">{formatQty(String(salesTotals.qty))}</TableCell>
                    <TableCell className="text-right">{formatMoney(String(salesTotals.cost.toFixed(2)))}</TableCell>
                    <TableCell className="text-right">{formatMoney(String(salesTotals.sell.toFixed(2)))}</TableCell>
                    <TableCell className="text-right"><MoneyCell value={String(salesTotals.pnl.toFixed(2))} colored /></TableCell>
                    <TableCell className="text-right">{formatPercent(String(salesTotals.pct.toFixed(2)))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* ── Dividendos ── */}
      <section className="space-y-3">
        <SectionHeader
          eyebrow="Rendimientos del capital mobiliario"
          title={`Dividendos ${year}`}
          total={divTotals.net > 0 ? { value: String(divTotals.net.toFixed(2)) } : undefined}
        />

        {sortedCountries.length === 0 ? (
          <EmptyState label={`Sin dividendos en ${year}`} />
        ) : (
          <>
            {/* Mobile: cards agrupadas por país */}
            <div className="space-y-4 sm:hidden">
              {sortedCountries.map((country) => {
                const assetMap     = divByCountryAsset.get(country)!
                const assets       = [...assetMap.values()].sort((a, b) => b.net - a.net)
                const cTotals      = assets.reduce((t, r) => ({ gross: t.gross + r.gross, tax: t.tax + r.tax, net: t.net + r.net }), { gross: 0, tax: 0, net: 0 })
                const countryLabel = country === '__none__' ? 'Sin país' : country
                return (
                  <div key={country} className="rounded-lg border border-border overflow-hidden">
                    {/* Cabecera de país */}
                    <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                      <span className="font-mono text-[10px] tracking-[2px] uppercase font-semibold">{countryLabel}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatMoney(String(cTotals.net.toFixed(2)))} neto
                      </span>
                    </div>
                    {/* Activos */}
                    {assets.map((d, i) => (
                      <div key={i} className="border-t border-border/50 px-3 py-2.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{d.name}</p>
                            {d.ticker && <p className="font-mono text-xs text-muted-foreground">{d.ticker}</p>}
                          </div>
                          <p className="font-mono text-sm tabular-nums font-semibold shrink-0">
                            {formatMoney(String(d.net.toFixed(2)))}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">Bruto</p>
                            <p className="font-mono text-[11px] tabular-nums">{formatMoney(String(d.gross.toFixed(2)))}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">Retención</p>
                            <p className="font-mono text-[11px] tabular-nums">{formatMoney(String(d.tax.toFixed(2)))}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">% Ret.</p>
                            <p className="font-mono text-[11px] tabular-nums">
                              {d.gross > 0 ? formatPercent(String((d.tax / d.gross * 100).toFixed(2))) : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
              {/* Total global */}
              <TotalRow
                label="Total dividendos"
                cells={[
                  { label: 'Bruto',      value: formatMoney(String(divTotals.gross.toFixed(2))) },
                  { label: 'Retención',  value: formatMoney(String(divTotals.tax.toFixed(2))) },
                  { label: 'Neto',       value: formatMoney(String(divTotals.net.toFixed(2))) },
                ]}
              />
            </div>

            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>País</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Retención</TableHead>
                    <TableHead className="text-right">% Ret.</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCountries.map((country) => {
                    const assetMap     = divByCountryAsset.get(country)!
                    const assets       = [...assetMap.values()].sort((a, b) => b.net - a.net)
                    const cTotals      = assets.reduce((t, r) => ({ gross: t.gross + r.gross, tax: t.tax + r.tax, net: t.net + r.net }), { gross: 0, tax: 0, net: 0 })
                    const countryLabel = country === '__none__' ? 'Sin país' : country
                    return (
                      <Fragment key={country}>
                        {assets.map((d, i) => (
                          <TableRow key={`${country}-${i}`}>
                            {i === 0 && (
                              <TableCell rowSpan={assets.length + 1} className="font-semibold align-top">
                                {countryLabel}
                              </TableCell>
                            )}
                            <TableCell>
                              <span className="font-medium">{d.name}</span>
                              {d.ticker && <span className="ml-2 text-xs text-muted-foreground">{d.ticker}</span>}
                            </TableCell>
                            <TableCell className="text-right">{formatMoney(String(d.gross.toFixed(2)))}</TableCell>
                            <TableCell className="text-right">{formatMoney(String(d.tax.toFixed(2)))}</TableCell>
                            <TableCell className="text-right">{d.gross > 0 ? formatPercent(String((d.tax / d.gross * 100).toFixed(2))) : '-'}</TableCell>
                            <TableCell className="text-right">{formatMoney(String(d.net.toFixed(2)))}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow key={`${country}-subtotal`} className="bg-muted/50">
                          <TableCell className="font-medium text-sm">Subtotal {countryLabel}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(String(cTotals.gross.toFixed(2)))}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(String(cTotals.tax.toFixed(2)))}</TableCell>
                          <TableCell className="text-right font-medium">{cTotals.gross > 0 ? formatPercent(String((cTotals.tax / cTotals.gross * 100).toFixed(2))) : '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(String(cTotals.net.toFixed(2)))}</TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={2}>Suma total</TableCell>
                    <TableCell className="text-right">{formatMoney(String(divTotals.gross.toFixed(2)))}</TableCell>
                    <TableCell className="text-right">{formatMoney(String(divTotals.tax.toFixed(2)))}</TableCell>
                    <TableCell className="text-right">{divTotals.gross > 0 ? formatPercent(String((divTotals.tax / divTotals.gross * 100).toFixed(2))) : '-'}</TableCell>
                    <TableCell className="text-right">{formatMoney(String(divTotals.net.toFixed(2)))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* ── Intereses ── */}
      <section className="space-y-3">
        <SectionHeader
          eyebrow="Rendimientos del capital mobiliario"
          title={`Intereses ${year}`}
          total={intTotals.net > 0 ? { value: String(intTotals.net.toFixed(2)) } : undefined}
        />

        {intRows.length === 0 ? (
          <EmptyState label={`Sin intereses en ${year}`} />
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {intRows.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
                  <p className="text-sm font-medium truncate mr-3">{r.name}</p>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm tabular-nums font-semibold">{formatMoney(String(r.net.toFixed(2)))}</p>
                    <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      Bruto: {formatMoney(String(r.gross.toFixed(2)))}
                    </p>
                  </div>
                </div>
              ))}
              <TotalRow
                label="Total intereses"
                cells={[
                  { label: 'Bruto', value: formatMoney(String(intTotals.gross.toFixed(2))) },
                  { label: 'Neto',  value: formatMoney(String(intTotals.net.toFixed(2))) },
                ]}
              />
            </div>

            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{formatMoney(String(r.gross.toFixed(2)))}</TableCell>
                      <TableCell className="text-right">{formatMoney(String(r.net.toFixed(2)))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>Suma total</TableCell>
                    <TableCell className="text-right">{formatMoney(String(intTotals.gross.toFixed(2)))}</TableCell>
                    <TableCell className="text-right">{formatMoney(String(intTotals.net.toFixed(2)))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({ label, value, colored, highlight }: {
  label: string
  value: string
  colored?: boolean
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-primary/25 dark:bg-primary/[0.04]' : ''}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className="font-mono text-xl font-bold tabular-nums">
          {colored ? <MoneyCell value={value} colored /> : formatMoney(value)}
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ eyebrow, title, total }: {
  eyebrow: string
  title: string
  total?: { value: string; colored?: boolean }
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between border-b border-border pb-2">
      <div>
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">{eyebrow}</p>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {total && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          Total:{' '}
          <span className={total.colored ? (parseFloat(total.value) >= 0 ? 'money-positive' : 'money-negative') : ''}>
            {formatMoney(total.value)}
          </span>
        </p>
      )}
    </div>
  )
}

function TotalRow({ label, cells }: {
  label: string
  cells: Array<{ label: string; value: string; colored?: boolean; positive?: boolean }>
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-2">{label}</p>
      <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
        {cells.map((cell, i) => (
          <div key={i}>
            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">{cell.label}</p>
            <p className={`font-mono text-sm tabular-nums font-semibold ${
              cell.colored ? (cell.positive ? 'money-positive' : 'money-negative') : ''
            }`}>
              {cell.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="py-3 text-sm text-muted-foreground">{label}</p>
  )
}
