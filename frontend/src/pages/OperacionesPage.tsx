import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions'
import { portfolioApi } from '@/api/portfolio'
import { assetsApi, accountsApi } from '@/api/assets'
import { DataTable, type Column } from '@/components/app/DataTable'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { TransactionRow, TransactionRowSkeleton } from '@/components/app/TransactionRow'
import { FilterSheet } from '@/components/app/FilterSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Download, Pencil, Trash2, ShoppingCart, TrendingDown, Gift, Info } from 'lucide-react'
import { formatQty, formatErrors } from '@/lib/utils'
import { TX_TYPE_BADGE_COLORS, TX_TYPE_LABELS } from '@/lib/constants'
import type { Transaction } from '@/types'

export function OperacionesPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, filters],
    queryFn: () => transactionsApi.list({ ...filters, page: String(page) }).then((r) => r.data),
  })
  const { data: assetsData } = useQuery({
    queryKey: ['assets-all'],
    queryFn: () => assetsApi.list({ page_size: '500' }).then((r) => r.data),
  })
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, string>) => transactionsApi.create(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setDialogOpen(false)
      setError('')
    },
    onError: (err) => setError(formatErrors(err)),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      transactionsApi.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setDialogOpen(false)
      setEditingId(null)
      setError('')
    },
    onError: (err) => setError(formatErrors(err)),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })

  const columns: Column<Transaction>[] = [
    { header: 'Fecha', accessor: 'date' },
    {
      header: 'Tipo',
      accessor: (r) => <Badge className={TX_TYPE_BADGE_COLORS[r.type] ?? ''} variant="secondary">{TX_TYPE_LABELS[r.type] ?? r.type}</Badge>,
    },
    {
      header: 'Activo',
      accessor: (r) => (
        <div>
          <span className="font-medium">{r.asset_name}</span>
          {r.asset_ticker && <span className="ml-1 text-xs text-muted-foreground">{r.asset_ticker}</span>}
        </div>
      ),
    },
    { header: 'Cuenta', accessor: 'account_name' },
    { header: 'Cantidad', accessor: (r) => formatQty(r.quantity), className: 'text-right' },
    { header: 'Precio', accessor: (r) => <MoneyCell value={r.price} />, className: 'text-right' },
    { header: 'Comision', accessor: (r) => <MoneyCell value={r.commission} />, className: 'text-right' },
    { header: 'Tasas', accessor: (r) => <MoneyCell value={r.tax} />, className: 'text-right' },
    {
      header: '',
      accessor: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(r.id)}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ),
    },
  ]

  const totalPages = data ? Math.ceil(data.count / 50) : 1

  // Número de filtros activos para el badge del FilterSheet
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const resetFilters = () => { setFilters({}); setPage(1) }

  const today = new Date().toISOString().slice(0, 10)
  const isSell = form.type === 'SELL'

  const positionMap = new Map(
    (portfolioData?.positions ?? []).map((p) => [p.asset_id, p])
  )

  const assetOptions = isSell
    ? (assetsData?.results ?? []).filter((a) => positionMap.has(a.id))
    : (assetsData?.results ?? [])

  const selectedPosition = isSell && form.asset ? positionMap.get(form.asset) : null

  const handleAssetChange = (assetId: string) => {
    const updates: Record<string, string> = { asset: assetId }
    if (isSell) {
      const pos = positionMap.get(assetId)
      if (pos) {
        updates.price = pos.current_price
        if (pos.account_id) updates.account = pos.account_id
      }
    } else {
      const asset = (assetsData?.results ?? []).find((a) => a.id === assetId)
      if (asset?.current_price) {
        updates.price = asset.current_price
      }
    }
    setForm((f) => ({ ...f, ...updates }))
  }

  const openNew = (type: 'BUY' | 'SELL' | 'GIFT') => {
    setEditingId(null)
    setForm({ date: today, type })
    setError('')
    setDialogOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id)
    setForm({
      date: tx.date,
      type: tx.type,
      asset: tx.asset,
      account: tx.account,
      quantity: tx.quantity,
      price: tx.price ?? '',
      commission: tx.commission,
      tax: tx.tax,
    })
    setError('')
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Operaciones">
        <a href="/api/export/transactions.csv" target="_blank" rel="noopener">
          <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />CSV</Button>
        </a>
        <Button size="sm" onClick={() => openNew('BUY')}>
          <ShoppingCart className="mr-2 h-4 w-4" />Compra
        </Button>
        <Button size="sm" variant="destructive" onClick={() => openNew('SELL')}>
          <TrendingDown className="mr-2 h-4 w-4" />Venta
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openNew('GIFT')}>
          <Gift className="mr-2 h-4 w-4" />Regalo
        </Button>
      </PageHeader>

      {/* ── Filtros: Sheet en mobile, inline en desktop ── */}
      <FilterSheet activeCount={activeFilterCount} onReset={resetFilters}>
        <Input
          placeholder="Buscar nombre o ticker..."
          className="w-full sm:w-52"
          value={filters.search ?? ''}
          onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1) }}
        />
        <Input
          placeholder="Desde fecha" type="date" className="w-full sm:w-40"
          value={filters.from_date ?? ''}
          onChange={(e) => { setFilters((f) => ({ ...f, from_date: e.target.value })); setPage(1) }}
        />
        <Input
          placeholder="Hasta fecha" type="date" className="w-full sm:w-40"
          value={filters.to_date ?? ''}
          onChange={(e) => { setFilters((f) => ({ ...f, to_date: e.target.value })); setPage(1) }}
        />
        <Select
          value={filters.type || 'ALL'}
          onValueChange={(v) => { setFilters((f) => ({ ...f, type: v === 'ALL' ? '' : v })); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="BUY">Compra</SelectItem>
            <SelectItem value="SELL">Venta</SelectItem>
            <SelectItem value="GIFT">Regalo</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.account_id || 'ALL'}
          onValueChange={(v) => { setFilters((f) => ({ ...f, account_id: v === 'ALL' ? '' : v })); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Cuenta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las cuentas</SelectItem>
            {accountsData?.results.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSheet>

      {/* ── Mobile: lista de filas compactas ── */}
      <div className="md:hidden rounded-xl border bg-card px-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <TransactionRowSkeleton key={i} />)
          : (data?.results ?? []).length === 0
            ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sin operaciones
              </p>
            )
            : (data?.results ?? []).map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onEdit={openEdit}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))
        }
        {/* Paginación mobile */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-1 py-3">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Siguiente
              </Button>
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
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Operación' : `Nueva ${TX_TYPE_LABELS[form.type] ?? 'Operación'}`}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              if (editingId) {
                updateMut.mutate({ id: editingId, data: form })
              } else {
                createMut.mutate(form)
              }
            }}
          >
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <Input type="date" required value={form.date ?? ''} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>

            {editingId && (
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={form.type ?? ''} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">Compra</SelectItem>
                    <SelectItem value="SELL">Venta</SelectItem>
                    <SelectItem value="GIFT">Regalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Activo</label>
              <Select value={form.asset ?? ''} onValueChange={handleAssetChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar activo" /></SelectTrigger>
                <SelectContent>
                  {assetOptions.map((a) => {
                    const pos = positionMap.get(a.id)
                    const suffix = isSell && pos ? ` — ${formatQty(pos.quantity)} uds` : ''
                    return (
                      <SelectItem key={a.id} value={a.id}>{a.name} {a.ticker ? `(${a.ticker})` : ''}{suffix}</SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {!isSell && (
              <div>
                <label className="text-sm font-medium">Cuenta</label>
                <Select value={form.account ?? ''} onValueChange={(v) => setForm((f) => ({ ...f, account: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                  <SelectContent>
                    {accountsData?.results.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Cantidad</label>
              <Input
                type="number" step="any" min="0" required
                value={form.quantity ?? ''}
                max={selectedPosition ? selectedPosition.quantity : undefined}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
              {selectedPosition && (
                <p className="text-xs text-muted-foreground mt-1">
                  Disponible: <strong>{formatQty(selectedPosition.quantity)}</strong> uds
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Precio unitario</label>
              <Input type="number" step="any" min="0" value={form.price ?? ''} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Comision</label>
                <div className="relative">
                  <Input
                    type="number" step="any" min="0"
                    className="pr-7"
                    value={form.commission ?? '0'}
                    onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium inline-flex items-center gap-1">
                  Tasas / Impuestos
                  <span className="relative group cursor-help">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-md bg-popover border text-popover-foreground text-xs p-2 shadow-md z-50 pointer-events-none">
                      FTT / stamp duty / tasas de mercado según país
                    </span>
                  </span>
                </label>
                <div className="relative">
                  <Input
                    type="number" step="any" min="0"
                    className="pr-7"
                    value={form.tax ?? '0'}
                    onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                </div>
              </div>
            </div>

            {form.quantity && form.price && (() => {
              const qty = parseFloat(form.quantity) || 0
              const price = parseFloat(form.price) || 0
              const comm = parseFloat(form.commission) || 0
              const tax = parseFloat(form.tax) || 0
              const subtotal = qty * price
              const total = isSell
                ? subtotal - comm - tax
                : subtotal + comm + tax
              return (
                <div className="rounded-md bg-muted/50 p-3 space-y-1">
                  <p className="text-sm font-medium">
                    Total operacion: <strong>{total.toFixed(2)} €</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {qty} × {price}{isSell ? ' −' : ' +'} {comm} comision{tax > 0 ? ` ${isSell ? '−' : '+'} ${tax} tasas` : ''}
                  </p>
                </div>
              )
            })()}

            <p className="text-xs text-muted-foreground">
              La tributacion por plusvalias se calcula en la seccion Fiscal, no aqui.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? 'Guardando...' : 'Guardar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
