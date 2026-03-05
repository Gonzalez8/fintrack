import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { dividendsApi } from '@/api/transactions'
import { assetsApi } from '@/api/assets'
import { portfolioApi } from '@/api/portfolio'
import { DataTable, type Column } from '@/components/app/DataTable'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { DividendRow, DividendRowSkeleton } from '@/components/app/DividendRow'
import { FilterSheet } from '@/components/app/FilterSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Download, Plus, Trash2 } from 'lucide-react'
import { formatQty, formatErrors } from '@/lib/utils'
import type { Dividend, Position } from '@/types'

export function DividendosPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['dividends', page, filters],
    queryFn: () => dividendsApi.list({ ...filters, page: String(page) }).then((r) => r.data),
  })
  const { data: assetsData } = useQuery({
    queryKey: ['assets-all'],
    queryFn: () => assetsApi.list({ page_size: '500' }).then((r) => r.data),
  })
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })

  const positionMap = new Map<string, Position>(
    (portfolioData?.positions ?? []).map((p) => [p.asset_id, p])
  )

  const createMut = useMutation({
    mutationFn: (data: Record<string, string>) => dividendsApi.create(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dividends'] })
      setDialogOpen(false)
      setError('')
    },
    onError: (err) => setError(formatErrors(err)),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => dividendsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dividends'] }),
  })

  const columns: Column<Dividend>[] = [
    { header: t('common.date'), accessor: 'date' },
    {
      header: t('common.asset'),
      accessor: (r) => (
        <div>
          <span className="font-medium">{r.asset_name}</span>
          {r.asset_ticker && <span className="ml-1 text-xs text-muted-foreground">{r.asset_ticker}</span>}
        </div>
      ),
    },
    { header: t('dividends.shares'), accessor: (r) => formatQty(r.shares), className: 'text-right' },
    { header: t('common.gross'), accessor: (r) => <MoneyCell value={r.gross} />, className: 'text-right' },
    { header: 'Impuesto', accessor: (r) => <MoneyCell value={r.tax} />, className: 'text-right' },
    { header: t('common.net'), accessor: (r) => <MoneyCell value={r.net} />, className: 'text-right' },
    {
      header: '% Retencion',
      accessor: (r) => r.withholding_rate ? `${(parseFloat(r.withholding_rate) * 100).toFixed(2)}%` : '-',
      className: 'text-right',
    },
    {
      header: '',
      accessor: (r) => (
        <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(r.id)}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      ),
    },
  ]

  const totalPages = data ? Math.ceil(data.count / 50) : 1
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const resetFilters = () => { setFilters({}); setPage(1) }

  const today = new Date().toISOString().slice(0, 10)

  const openDialog = () => {
    setForm({ date: today })
    setError('')
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('dividends.title')}>
        <a href="/api/export/dividends.csv" target="_blank" rel="noopener">
          <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />CSV</Button>
        </a>
        <Button size="sm" onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />{t('dividends.new')}
        </Button>
      </PageHeader>

      <FilterSheet activeCount={activeFilterCount} onReset={resetFilters}>
        <Select
          value={filters.year || 'ALL'}
          onValueChange={(v) => { setFilters((f) => ({ ...f, year: v === 'ALL' ? '' : v })); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder={t('common.year')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSheet>

      {/* ── Mobile: lista de filas compactas ── */}
      <div className="md:hidden rounded-xl border bg-card px-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <DividendRowSkeleton key={i} />)
          : (data?.results ?? []).length === 0
            ? <p className="py-12 text-center text-sm text-muted-foreground">{t('dividends.noDividends')}</p>
            : (data?.results ?? []).map((d) => (
              <DividendRow
                key={d.id}
                dividend={d}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))
        }
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-1 py-3">
            <span className="text-xs text-muted-foreground">{t('common.pageOf', { current: page, total: totalPages })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop: tabla completa ── */}
      <div className="hidden md:block">
        <DataTable columns={columns} data={data?.results ?? []} loading={isLoading} page={page} totalPages={totalPages} totalCount={data?.count} onPageChange={setPage} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('dividends.newDividend')}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault()
            setError('')
            const net = parseFloat(form.net || '0')
            const tax = parseFloat(form.tax || '0')
            const gross = net + tax
            const withholding = gross > 0 ? (tax / gross) : 0
            createMut.mutate({
              ...form,
              gross: gross.toFixed(2),
              net: net.toFixed(2),
              tax: tax.toFixed(2),
              withholding_rate: withholding.toFixed(4),
            })
          }}>
            <div>
              <label className="text-sm font-medium">{t('common.date')}</label>
              <Input type="date" required value={form.date ?? ''} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('common.asset')}</label>
              <Select value={form.asset ?? ''} onValueChange={(v) => {
                const pos = positionMap.get(v)
                setForm((f) => ({ ...f, asset: v, shares: pos ? pos.quantity : f.shares }))
              }}>

                <SelectTrigger><SelectValue placeholder={t('common.selectAsset')} /></SelectTrigger>
                <SelectContent>
                  {assetsData?.results.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.ticker ? `(${a.ticker})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">{t('dividends.shares')}</label>
              <Input type="number" step="any" value={form.shares ?? ''} required onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('dividends.netReceived')}</label>
              <Input type="number" step="any" value={form.net ?? ''} required onChange={(e) => setForm((f) => ({ ...f, net: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('dividends.taxWithheld')}</label>
              <Input type="number" step="any" value={form.tax ?? ''} onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))} />
            </div>

            {form.net && (() => {
              const net = parseFloat(form.net || '0')
              const tax = parseFloat(form.tax || '0')
              const gross = net + tax
              const shares = parseFloat(form.shares || '0')
              return (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{t('common.gross')}: {gross.toFixed(2)} EUR {shares > 0 && <span>({(gross / shares).toFixed(4)} {t('dividends.perShare')})</span>}</div>
                  {tax > 0 && gross > 0 && <div>{t('dividends.retention')}: {((tax / gross) * 100).toFixed(2)}%</div>}
                </div>
              )
            })()}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={createMut.isPending}>
              {createMut.isPending ? t('dividends.saving') : t('dividends.save')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
