import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pollTask } from '@/api/tasks'
import type { UpdatePricesResult } from '@/types'
import { assetsApi } from '@/api/assets'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { AssetRow, AssetRowSkeleton } from '@/components/app/AssetRow'
import { FilterSheet } from '@/components/app/FilterSheet'
import { RefreshCw, Trash2, Plus } from 'lucide-react'
import type { Asset } from '@/types'

const statusVariant = (s: string | null) => {
  if (s === 'OK') return 'default' as const
  if (s === 'ERROR') return 'destructive' as const
  return 'secondary' as const
}

export function AssetsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const typeLabels: Record<string, string> = {
    STOCK: t('assets.stock'),
    ETF: t('assets.etf'),
    FUND: t('assets.fund'),
    CRYPTO: t('assets.crypto'),
  }

  const params: Record<string, string> = { page_size: '500' }
  if (search) params.search = search
  if (typeFilter !== 'ALL') params.type = typeFilter
  if (statusFilter !== 'ALL') params.price_status = statusFilter

  const { data, isLoading } = useQuery({
    queryKey: ['assets-all', search, typeFilter, statusFilter],
    queryFn: () => assetsApi.list(params).then((r) => r.data),
  })

  const activeFilterCount =
    (search ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0)

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setStatusFilter('ALL')
  }

  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState<Partial<Asset>>({ type: 'STOCK', currency: 'EUR', price_mode: 'AUTO' })
  const [newError, setNewError] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: (data: Partial<Asset>) => assetsApi.create(data).then((r) => r.data),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      setNewOpen(false)
      setNewForm({ type: 'STOCK', currency: 'EUR', price_mode: 'AUTO' })
      setNewError(null)
      navigate(`/activos/${asset.id}`)
    },
    onError: (err) => {
      setNewError((err as any)?.response?.data?.detail ?? 'Error al crear el activo')
    },
  })

  const [priceResult, setPriceResult] = useState<{ updated: number; errors: string[] } | null>(null)
  const updatePricesMut = useMutation({
    mutationFn: async () => {
      const { data } = await assetsApi.updatePrices()
      const taskResult = await pollTask(data.task_id)
      if (taskResult.status === 'FAILURE') throw new Error(taskResult.error ?? 'Error desconocido')
      return taskResult.result as UpdatePricesResult
    },
    onSuccess: (result) => {
      setPriceResult({ updated: result.updated, errors: result.errors })
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: () => {
      setPriceResult({ updated: 0, errors: ['Error al conectar con Yahoo Finance'] })
    },
  })

  const deleteAssetMut = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: (err) => {
      const msg = (err as any)?.response?.data?.detail ?? 'Error al eliminar activo'
      alert(msg)
    },
  })

  const assets = data?.results ?? []

  return (
    <div className="space-y-4">
      <PageHeader title={t('assets.title')}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPriceResult(null); updatePricesMut.mutate() }}
          disabled={updatePricesMut.isPending}
          aria-label={t('assets.updatePrices')}
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${updatePricesMut.isPending ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {updatePricesMut.isPending ? t('assets.updating') : t('assets.updatePrices')}
          </span>
        </Button>
        <Button
          size="sm"
          onClick={() => { setNewError(null); setNewOpen(true) }}
          aria-label={t('assets.newAsset')}
        >
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t('assets.newAsset')}</span>
        </Button>
      </PageHeader>

      {priceResult && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{priceResult.updated}</span> {t('assets.pricesUpdated')}
          {priceResult.errors.length > 0 && (
            <span className="text-destructive ml-1">· {priceResult.errors.length} {t('assets.errors')}</span>
          )}
        </p>
      )}

      <Card>
        <CardContent className="pt-4">
          <FilterSheet activeCount={activeFilterCount} onReset={resetFilters}>
            <Input
              placeholder={t('assets.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="flex-1 sm:w-36">
                <SelectValue placeholder={t('common.type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('assets.allTypes')}</SelectItem>
                <SelectItem value="STOCK">{t('assets.stock')}</SelectItem>
                <SelectItem value="ETF">{t('assets.etf')}</SelectItem>
                <SelectItem value="FUND">{t('assets.fund')}</SelectItem>
                <SelectItem value="CRYPTO">{t('assets.crypto')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 sm:w-36">
                <SelectValue placeholder={t('common.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('assets.allStatuses')}</SelectItem>
                <SelectItem value="OK">{t('assets.statusOk')}</SelectItem>
                <SelectItem value="ERROR">{t('assets.statusError')}</SelectItem>
                <SelectItem value="NO_TICKER">{t('assets.noTicker')}</SelectItem>
              </SelectContent>
            </Select>
          </FilterSheet>

          {/* ── Mobile: lista de filas compactas ── */}
          <div className="md:hidden mt-4 rounded-xl border bg-card px-3">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <AssetRowSkeleton key={i} />)
              : assets.length === 0
                ? <p className="py-12 text-center text-sm text-muted-foreground">{t('assets.noAssets')}</p>
                : assets.map((asset) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      onClick={() => navigate(`/activos/${asset.id}`)}
                      onDelete={(id) => deleteAssetMut.mutate(id)}
                    />
                  ))
            }
          </div>

          {/* ── Desktop: tabla completa ── */}
          <div className="hidden md:block overflow-x-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.ticker')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>Pais</TableHead>
                  <TableHead className="text-right">{t('common.price')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('assets.updated')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/activos/${asset.id}`)}
                  >
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell>{asset.ticker ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabels[asset.type] ?? asset.type}</Badge>
                    </TableCell>
                    <TableCell>{asset.issuer_country ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <MoneyCell value={asset.current_price} />
                    </TableCell>
                    <TableCell>
                      {asset.price_status && (
                        <Badge variant={statusVariant(asset.price_status)}>
                          {asset.price_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {asset.price_updated_at
                        ? new Date(asset.price_updated_at).toLocaleDateString('es-ES', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Eliminar ${asset.name}?`)) deleteAssetMut.mutate(asset.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {assets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t('assets.noAssets')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('assets.newAsset')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <label className="text-sm font-medium">{t('common.name')} *</label>
              <Input
                placeholder={t('common.namePlaceholder')}
                value={newForm.name ?? ''}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('common.ticker')}</label>
                <Input
                  placeholder={t('common.tickerPlaceholder')}
                  value={newForm.ticker ?? ''}
                  onChange={(e) => setNewForm((f) => ({ ...f, ticker: e.target.value || undefined }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('common.isin')}</label>
                <Input
                  placeholder={t('common.isinPlaceholder')}
                  maxLength={12}
                  value={newForm.isin ?? ''}
                  onChange={(e) => setNewForm((f) => ({ ...f, isin: e.target.value.toUpperCase() || undefined }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">{t('common.type')}</label>
                <Select value={newForm.type} onValueChange={(v) => setNewForm((f) => ({ ...f, type: v as Asset['type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STOCK">{t('assets.stock')}</SelectItem>
                    <SelectItem value="ETF">{t('assets.etf')}</SelectItem>
                    <SelectItem value="FUND">{t('assets.fund')}</SelectItem>
                    <SelectItem value="CRYPTO">{t('assets.crypto')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('common.currency')}</label>
                <Input
                  maxLength={3}
                  value={newForm.currency ?? 'EUR'}
                  onChange={(e) => setNewForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('assets.priceMode')}</label>
                <Select value={newForm.price_mode} onValueChange={(v) => setNewForm((f) => ({ ...f, price_mode: v as Asset['price_mode'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">{t('common.auto')}</SelectItem>
                    <SelectItem value="MANUAL">{t('common.manual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newError && <p className="text-sm text-destructive">{newError}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => createMut.mutate(newForm)}
              disabled={!newForm.name || createMut.isPending}
            >
              {createMut.isPending ? t('assets.creating') : t('assets.createAsset')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
