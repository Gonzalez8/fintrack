import { useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, reportsApi } from '@/api/portfolio'
import { dividendsApi, interestsApi } from '@/api/transactions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MoneyCell } from '@/components/app/MoneyCell'
import { formatQty, formatPercent, formatMoney } from '@/lib/utils'

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

  // Filter realized sales for selected year
  const salesYear = portfolio?.realized_sales.filter((s) => s.date.startsWith(year)) ?? []
  const salesTotals = (() => {
    const qty = salesYear.reduce((s, r) => s + parseFloat(r.quantity), 0)
    const cost = salesYear.reduce((s, r) => s + parseFloat(r.cost_basis), 0)
    const sell = salesYear.reduce((s, r) => s + parseFloat(r.sell_total), 0)
    const pnl = salesYear.reduce((s, r) => s + parseFloat(r.realized_pnl), 0)
    const pct = cost > 0 ? (pnl / cost * 100) : 0
    return { qty, cost, sell, pnl, pct }
  })()

  // Aggregate dividends by country then by asset
  const divByCountryAsset = new Map<string, Map<string, { name: string; ticker: string | null; gross: number; tax: number; net: number }>>()
  for (const d of dividendsData?.results ?? []) {
    const country = d.asset_issuer_country ?? '__none__'
    if (!divByCountryAsset.has(country)) divByCountryAsset.set(country, new Map())
    const assetMap = divByCountryAsset.get(country)!
    if (!assetMap.has(d.asset)) assetMap.set(d.asset, { name: d.asset_name, ticker: d.asset_ticker, gross: 0, tax: 0, net: 0 })
    const entry = assetMap.get(d.asset)!
    entry.gross += parseFloat(d.gross)
    entry.tax += parseFloat(d.tax)
    entry.net += parseFloat(d.net)
  }
  // Sort countries alphabetically, "__none__" last
  const sortedCountries = [...divByCountryAsset.keys()].sort((a, b) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })
  const divTotals = { gross: 0, tax: 0, net: 0 }
  for (const assetMap of divByCountryAsset.values()) {
    for (const r of assetMap.values()) {
      divTotals.gross += r.gross
      divTotals.tax += r.tax
      divTotals.net += r.net
    }
  }

  // Aggregate interests by account
  const intByAccount = new Map<string, { name: string; gross: number; net: number }>()
  for (const i of interestsData?.results ?? []) {
    const key = i.account
    if (!intByAccount.has(key)) intByAccount.set(key, { name: i.account_name, gross: 0, net: 0 })
    const entry = intByAccount.get(key)!
    entry.gross += parseFloat(i.gross)
    entry.net += parseFloat(i.net)
  }
  const intRows = [...intByAccount.values()].sort((a, b) => b.net - a.net)
  const intTotals = intRows.reduce((t, r) => ({ gross: t.gross + r.gross, net: t.net + r.net }), { gross: 0, net: 0 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fiscal — Declaración de la Renta</h2>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dividendos netos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(summary?.dividends_net ?? '0')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Intereses netos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(summary?.interests_net ?? '0')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganancias por ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><MoneyCell value={summary?.sales_pnl ?? '0'} colored /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total neto {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(summary?.total_net ?? '0')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales table */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Ganancias y pérdidas patrimoniales — Ventas {year}</h3>
        {salesYear.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas en {year}</p>
        ) : (
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
                <TableCell className="text-right">{formatMoney(String(salesTotals.cost))}</TableCell>
                <TableCell className="text-right">{formatMoney(String(salesTotals.sell))}</TableCell>
                <TableCell className="text-right"><MoneyCell value={String(salesTotals.pnl)} colored /></TableCell>
                <TableCell className="text-right">{formatPercent(String(salesTotals.pct.toFixed(2)))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>

      {/* Dividends table */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Rendimientos del capital mobiliario — Dividendos {year}</h3>
        {sortedCountries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin dividendos en {year}</p>
        ) : (
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
                const assetMap = divByCountryAsset.get(country)!
                const assets = [...assetMap.values()].sort((a, b) => b.net - a.net)
                const countryTotals = assets.reduce(
                  (t, r) => ({ gross: t.gross + r.gross, tax: t.tax + r.tax, net: t.net + r.net }),
                  { gross: 0, tax: 0, net: 0 }
                )
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
                        <TableCell className="text-right">{formatMoney(String(d.gross))}</TableCell>
                        <TableCell className="text-right">{formatMoney(String(d.tax))}</TableCell>
                        <TableCell className="text-right">{d.gross > 0 ? formatPercent(String((d.tax / d.gross * 100).toFixed(2))) : '-'}</TableCell>
                        <TableCell className="text-right">{formatMoney(String(d.net))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow key={`${country}-subtotal`} className="bg-muted/50">
                      <TableCell className="font-medium text-sm">Subtotal {countryLabel}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(String(countryTotals.gross))}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(String(countryTotals.tax))}</TableCell>
                      <TableCell className="text-right font-medium">{countryTotals.gross > 0 ? formatPercent(String((countryTotals.tax / countryTotals.gross * 100).toFixed(2))) : '-'}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(String(countryTotals.net))}</TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Suma total</TableCell>
                <TableCell className="text-right">{formatMoney(String(divTotals.gross))}</TableCell>
                <TableCell className="text-right">{formatMoney(String(divTotals.tax))}</TableCell>
                <TableCell className="text-right">{divTotals.gross > 0 ? formatPercent(String((divTotals.tax / divTotals.gross * 100).toFixed(2))) : '-'}</TableCell>
                <TableCell className="text-right">{formatMoney(String(divTotals.net))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>

      {/* Interests table */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Rendimientos del capital mobiliario — Intereses {year}</h3>
        {intRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin intereses en {year}</p>
        ) : (
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
                  <TableCell className="text-right">{formatMoney(String(r.gross))}</TableCell>
                  <TableCell className="text-right">{formatMoney(String(r.net))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Suma total</TableCell>
                <TableCell className="text-right">{formatMoney(String(intTotals.gross))}</TableCell>
                <TableCell className="text-right">{formatMoney(String(intTotals.net))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
