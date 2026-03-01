import { useMemo, useState, useEffect, Fragment } from 'react'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableFooter,
  TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import type { MonthlySavingsPoint, MonthlySavingsStats } from '@/types'
import { CommentsDrawer } from '@/components/app/CommentsDrawer'

// ─── Formatters ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const MONTH_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmtMonth(m: string): string {
  const [year, month] = m.split('-')
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`
}

function fmtMonthShort(m: string): string {
  const [year, month] = m.split('-')
  return `${MONTH_ABBR[parseInt(month) - 1]} ${year}`
}

// ─── Delta cell ───────────────────────────────────────────────────────────────

function DeltaCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const num = parseFloat(value)
  const sign = num > 0 ? '+' : ''
  const cls = num > 0 ? 'money-positive' : num < 0 ? 'money-negative' : 'text-muted-foreground'
  return <span className={`font-mono tabular-nums ${cls}`}>{sign}{formatMoney(value)}</span>
}

// ─── Note indicator ───────────────────────────────────────────────────────────

function NoteIndicator({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 ml-1.5 text-primary/60"
      title={`${count} ${count === 1 ? 'comentario' : 'comentarios'}`}
    >
      <MessageSquare className="h-3 w-3" />
      {count > 1 && <span className="font-mono text-[9px]">{count}</span>}
    </span>
  )
}

// ─── Mobile month card ────────────────────────────────────────────────────────

function MobileMonthCard({
  m, indent = false, selected = false, onSelect,
}: {
  m: MonthlySavingsPoint
  indent?: boolean
  selected?: boolean
  onSelect?: (month: string) => void
}) {
  const hasComments = (m.comments?.length ?? 0) > 0
  const isClickable = hasComments
  return (
    <div
      className={`py-3 ${indent ? 'pl-8 pr-4' : 'px-4'} transition-colors ${
        selected
          ? 'bg-primary/5 border-l-2 border-primary'
          : isClickable
            ? 'active:bg-secondary/40 cursor-pointer'
            : ''
      }`}
      onClick={isClickable ? () => onSelect?.(m.month) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') onSelect?.(m.month) } : undefined}
      aria-label={isClickable ? `Ver comentarios de ${fmtMonth(m.month)}` : undefined}
    >
      {/* Primary: month name + ahorro real */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm flex items-center">
          {fmtMonth(m.month)}
          <NoteIndicator count={m.comments?.length ?? 0} />
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums shrink-0">
          <DeltaCell value={m.real_savings} />
        </span>
      </div>
      {/* Secondary: breakdown */}
      <div className="mt-1.5 grid grid-cols-3 gap-x-2 text-[11px] font-mono">
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Efectivo</p>
          <p className="tabular-nums text-foreground/80">{formatMoney(m.cash_end)}</p>
        </div>
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Δ Efectivo</p>
          <p><DeltaCell value={m.cash_delta} /></p>
        </div>
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Δ Coste inv.</p>
          <p><DeltaCell value={m.investment_cost_delta} /></p>
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  months: MonthlySavingsPoint[]   // ascending (oldest first)
  stats: MonthlySavingsStats | null
  title?: string
  groupByYear?: boolean
  selectedMonth?: string | null
  onMonthSelect?: (month: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthlySavingsTable({
  months,
  stats,
  title = 'Histórico completo',
  groupByYear = false,
  selectedMonth,
  onMonthSelect,
}: Props) {
  const currentYear = String(new Date().getFullYear())

  // Descending order for display
  const tableData = useMemo(() => [...months].reverse(), [months])

  // Collapsed year state — non-current years start collapsed; resets when months change
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!groupByYear) return
    const toCollapse = new Set<string>()
    for (const m of months) {
      const y = m.month.slice(0, 4)
      if (y !== currentYear) toCollapse.add(y)
    }
    setCollapsedYears(toCollapse)
  }, [months, groupByYear, currentYear])

  // Auto-expand year when selectedMonth changes
  useEffect(() => {
    if (!groupByYear || !selectedMonth) return
    const year = selectedMonth.slice(0, 4)
    setCollapsedYears(prev => {
      if (!prev.has(year)) return prev
      const next = new Set(prev)
      next.delete(year)
      return next
    })
  }, [selectedMonth, groupByYear])

  const toggleYear = (year: string) => {
    setCollapsedYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  // Comments drawer state
  const [drawerMonth, setDrawerMonth] = useState<string | null>(null)
  const drawerComments = useMemo(() => {
    if (!drawerMonth) return []
    return months.find(m => m.month === drawerMonth)?.comments ?? []
  }, [drawerMonth, months])

  const handleRowClick = (month: string) => {
    const m = months.find(x => x.month === month)
    if (m && (m.comments?.length ?? 0) > 0) {
      setDrawerMonth(month)
    }
    onMonthSelect?.(month)
  }

  // Group by year (descending order preserved from tableData)
  const yearGroups = useMemo(() => {
    if (!groupByYear) return null
    const map = new Map<string, MonthlySavingsPoint[]>()
    for (const m of tableData) {
      const year = m.month.slice(0, 4)
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(m)
    }
    return Array.from(map.entries())
  }, [tableData, groupByYear])

  // "Mostrando" indicator
  const indicator = useMemo(() => {
    if (months.length === 0) return null
    const first = months[0]
    const last  = months[months.length - 1]
    return {
      count: months.length,
      from: fmtMonthShort(first.month),
      to: fmtMonthShort(last.month),
    }
  }, [months])

  if (tableData.length === 0) return null

  // Highlight style for selected month row
  const highlightStyle = {
    boxShadow: 'inset 2px 0 0 hsl(var(--primary))',
    background: 'hsl(var(--primary) / 0.05)',
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {title}
            </CardTitle>
            {indicator && (
              <p className="font-mono text-[9px] text-muted-foreground">
                Mostrando {indicator.count} {indicator.count === 1 ? 'mes' : 'meses'}
                {' · '}
                {indicator.from} – {indicator.to}
              </p>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">

          {/* ── Mobile card list (< sm) ── */}
          <div className="sm:hidden divide-y divide-border/40">
            {groupByYear && yearGroups ? (
              yearGroups.map(([year, yearMonths]) => {
                const isCollapsed = collapsedYears.has(year)
                const yearDelta = yearMonths
                  .filter(m => m.real_savings !== null)
                  .reduce((sum, m) => sum + parseFloat(m.real_savings!), 0)
                return (
                  <Fragment key={year}>
                    {/* Year header */}
                    <div
                      className="cursor-pointer bg-secondary/30 active:bg-secondary/60 transition-colors select-none px-4 py-2.5 flex items-center justify-between"
                      onClick={() => toggleYear(year)}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150 ${
                            isCollapsed ? '' : 'rotate-90'
                          }`}
                        />
                        <span className="font-mono text-[10px] tracking-[3px] uppercase font-semibold">
                          {year}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          · {yearMonths.length} {yearMonths.length === 1 ? 'mes' : 'meses'}
                        </span>
                      </div>
                      <DeltaCell value={yearDelta.toFixed(2)} />
                    </div>
                    {/* Month cards */}
                    {!isCollapsed && yearMonths.map(m => (
                      <MobileMonthCard
                        key={m.month}
                        m={m}
                        indent
                        selected={selectedMonth === m.month}
                        onSelect={handleRowClick}
                      />
                    ))}
                  </Fragment>
                )
              })
            ) : (
              tableData.map(m => (
                <MobileMonthCard
                  key={m.month}
                  m={m}
                  selected={selectedMonth === m.month}
                  onSelect={handleRowClick}
                />
              ))
            )}
            {/* Mobile footer */}
            {stats?.avg_monthly_delta != null && (
              <div className="px-4 py-3 flex items-center justify-between bg-muted/20">
                <span className="text-sm font-semibold">Media mensual</span>
                <DeltaCell value={stats.avg_monthly_delta} />
              </div>
            )}
          </div>

          {/* ── Desktop table (sm+) ── */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Efectivo fin</TableHead>
                  <TableHead className="text-right">Δ Efectivo</TableHead>
                  <TableHead className="text-right">Δ Coste inv.</TableHead>
                  <TableHead className="text-right">Ahorro real</TableHead>
                </TableRow>
              </TableHeader>

              {groupByYear && yearGroups ? (
                /* ── Grouped by year (MAX range) ── */
                <TableBody>
                  {yearGroups.map(([year, yearMonths]) => {
                    const isCollapsed = collapsedYears.has(year)
                    const yearDelta = yearMonths
                      .filter(m => m.real_savings !== null)
                      .reduce((sum, m) => sum + parseFloat(m.real_savings!), 0)

                    return (
                      <Fragment key={year}>
                        {/* Year header row */}
                        <TableRow
                          className="cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors select-none"
                          onClick={() => toggleYear(year)}
                        >
                          <TableCell colSpan={5} className="py-2 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150 ${
                                    isCollapsed ? '' : 'rotate-90'
                                  }`}
                                />
                                <span className="font-mono text-[10px] tracking-[3px] uppercase font-semibold">
                                  {year}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  · {yearMonths.length} {yearMonths.length === 1 ? 'mes' : 'meses'}
                                </span>
                              </div>
                              <DeltaCell value={yearDelta.toFixed(2)} />
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Month rows */}
                        {!isCollapsed && yearMonths.map(m => {
                          const isSelected = selectedMonth === m.month
                          const hasComments = (m.comments?.length ?? 0) > 0
                          return (
                            <TableRow
                              key={m.month}
                              style={isSelected ? highlightStyle : undefined}
                              className={`transition-colors ${hasComments ? 'cursor-pointer hover:bg-secondary/30' : ''}`}
                              onClick={hasComments || onMonthSelect ? () => handleRowClick(m.month) : undefined}
                            >
                              <TableCell className="font-mono text-sm pl-9">
                                <span className="inline-flex items-center">
                                  {fmtMonth(m.month)}
                                  <NoteIndicator count={m.comments?.length ?? 0} />
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm">
                                {formatMoney(m.cash_end)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                <DeltaCell value={m.cash_delta} />
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                <DeltaCell value={m.investment_cost_delta} />
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                <DeltaCell value={m.real_savings} />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </TableBody>
              ) : (
                /* ── Flat list (non-MAX ranges) ── */
                <TableBody>
                  {tableData.map(m => {
                    const isSelected = selectedMonth === m.month
                    const hasComments = (m.comments?.length ?? 0) > 0
                    return (
                      <TableRow
                        key={m.month}
                        style={isSelected ? highlightStyle : undefined}
                        className={`transition-colors ${hasComments || onMonthSelect ? 'cursor-pointer hover:bg-secondary/30' : ''}`}
                        onClick={hasComments || onMonthSelect ? () => handleRowClick(m.month) : undefined}
                      >
                        <TableCell className="font-mono text-sm">
                          <span className="inline-flex items-center">
                            {fmtMonth(m.month)}
                            <NoteIndicator count={m.comments?.length ?? 0} />
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {formatMoney(m.cash_end)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <DeltaCell value={m.cash_delta} />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <DeltaCell value={m.investment_cost_delta} />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <DeltaCell value={m.real_savings} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              )}

              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Media mensual</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">
                    <DeltaCell value={stats?.avg_monthly_delta ?? null} />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

        </CardContent>
      </Card>

      {/* Comments drawer/dialog */}
      <CommentsDrawer
        open={drawerMonth !== null}
        onOpenChange={(open) => { if (!open) setDrawerMonth(null) }}
        month={drawerMonth}
        comments={drawerComments}
      />
    </>
  )
}
