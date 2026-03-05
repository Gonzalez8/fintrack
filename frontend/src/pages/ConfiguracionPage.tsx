import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { settingsApi, backupApi, storageApi } from '@/api/assets'
import { reportsApi } from '@/api/portfolio'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/app/PageHeader'
import type { Settings } from '@/types'

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function formatRelative(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin === 0) return 'ahora mismo'
  if (diffMin > 0) return `en ${diffMin} min`
  return `hace ${Math.abs(diffMin)} min`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ConfiguracionPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then((r) => r.data),
  })

  const [settingsSaved, setSettingsSaved] = useState(false)
  const settingsMut = useMutation({
    mutationFn: (data: Partial<Settings>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setForm({})
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    },
  })

  const [form, setForm] = useState<Partial<Settings>>({})
  const current = { ...settings, ...form }

  const now = useNow()
  const { data: snapshotStatus } = useQuery({
    queryKey: ['snapshot-status'],
    queryFn: () => reportsApi.snapshotStatus().then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data: storageInfo, isLoading: storageLoading } = useQuery({
    queryKey: ['storage-info'],
    queryFn: () => storageApi.info().then((r) => r.data),
    staleTime: 60_000,
  })

  const [retentionDays, setRetentionDays] = useState<number | null | undefined>(undefined)
  const currentRetention = retentionDays !== undefined ? retentionDays : (settings?.data_retention_days ?? null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<Record<string, number | boolean> | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const importMut = useMutation({
    mutationFn: (file: File) => backupApi.import(file).then((r) => r.data.counts),
    onSuccess: (counts) => {
      setImportResult(counts)
      setImportError(null)
      queryClient.invalidateQueries()
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setImportError(err.response?.data?.detail ?? 'Error al importar el backup')
      setImportResult(null)
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImportResult(null)
      setImportError(null)
      importMut.mutate(file)
    }
    e.target.value = ''
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.generalSettings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 max-w-xl">
            <div>
              <label className="text-sm font-medium">{t('settings.baseCurrency')}</label>
              <Input value={current.base_currency ?? 'EUR'} onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.costMethod')}</label>
              <Select value={current.cost_basis_method} onValueChange={(v) => setForm((f) => ({ ...f, cost_basis_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">{t('settings.fifo')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.giftCost')}</label>
              <Select value={current.gift_cost_mode} onValueChange={(v) => setForm((f) => ({ ...f, gift_cost_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZERO">{t('settings.zeroCost')}</SelectItem>
                  <SelectItem value="MARKET">{t('settings.marketPrice')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.moneyDecimals')}</label>
              <Input type="number" value={current.rounding_money ?? 2} onChange={(e) => setForm((f) => ({ ...f, rounding_money: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.quantityDecimals')}</label>
              <Input type="number" value={current.rounding_qty ?? 6} onChange={(e) => setForm((f) => ({ ...f, rounding_qty: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.priceUpdateFreq')}</label>
              <Select value={String(current.price_update_interval ?? 0)} onValueChange={(v) => setForm((f) => ({ ...f, price_update_interval: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('settings.manual')}</SelectItem>
                  <SelectItem value="5">{t('settings.min5')}</SelectItem>
                  <SelectItem value="15">{t('settings.min15')}</SelectItem>
                  <SelectItem value="30">{t('settings.min30')}</SelectItem>
                  <SelectItem value="60">{t('settings.hour1')}</SelectItem>
                  <SelectItem value="360">{t('settings.hours6')}</SelectItem>
                  <SelectItem value="1440">{t('settings.hours24')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('settings.priceSource')}</label>
              <Select value={current.default_price_source ?? 'YAHOO'} onValueChange={(v) => setForm((f) => ({ ...f, default_price_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAHOO">Yahoo Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">{t('settings.snapshotFreq')}</label>
              <Select value={String(current.snapshot_frequency ?? 1440)} onValueChange={(v) => setForm((f) => ({ ...f, snapshot_frequency: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('settings.snapshotDisabled')}</SelectItem>
                  <SelectItem value="15">{t('settings.every15min')}</SelectItem>
                  <SelectItem value="30">{t('settings.every30min')}</SelectItem>
                  <SelectItem value="60">{t('settings.every1h')}</SelectItem>
                  <SelectItem value="180">{t('settings.every3h')}</SelectItem>
                  <SelectItem value="360">{t('settings.every6h')}</SelectItem>
                  <SelectItem value="720">{t('settings.every12h')}</SelectItem>
                  <SelectItem value="1440">{t('settings.every24h')}</SelectItem>
                </SelectContent>
              </Select>

              {snapshotStatus && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {snapshotStatus.frequency_minutes === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      {t('settings.snapshotsDisabled')}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {snapshotStatus.last_snapshot
                          ? <>{t('settings.lastSnapshot')}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.last_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.last_snapshot)}</>
                          : t('settings.noSnapshots')}
                      </span>
                      {snapshotStatus.next_snapshot && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {t('settings.nextSnapshot')}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.next_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.next_snapshot)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => settingsMut.mutate(form)} disabled={Object.keys(form).length === 0 || settingsMut.isPending}>
              {settingsMut.isPending ? t('common.saving') : t('settings.saveSettings')}
            </Button>
            {settingsSaved && <span className="text-sm text-green-600">{t('settings.settingsSaved')}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.storage')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-xl">
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('settings.storageDesc')}</p>
              <div className="flex items-baseline gap-1.5">
                {storageLoading ? (
                  <span className="text-sm text-muted-foreground">{t('settings.calculating')}</span>
                ) : (
                  <>
                    <span className="text-2xl font-semibold tabular-nums">
                      {storageInfo ? storageInfo.total_mb.toFixed(2) : '—'}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('settings.mb')}</span>
                  </>
                )}
              </div>
              {storageInfo && storageInfo.tables.length > 0 && (
                <div className="mt-3 space-y-1">
                  {storageInfo.tables
                    .map((t_item) => (
                      <div key={t_item.table} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{t_item.table}</span>
                        <span className="tabular-nums">{t_item.size_mb.toFixed(3)} {t('settings.mb')}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t">
              <label className="text-sm font-medium">{t('settings.dataRetention')}</label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                {t('settings.dataRetentionDesc')}
              </p>
              <div className="flex items-center gap-3">
                <Select
                  value={currentRetention === null || currentRetention === undefined ? 'never' : String(currentRetention)}
                  onValueChange={(v) => setRetentionDays(v === 'never' ? null : parseInt(v))}
                >
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">{t('settings.neverDelete')}</SelectItem>
                    <SelectItem value="365">{t('settings.olderThan1y')}</SelectItem>
                    <SelectItem value="1825">{t('settings.olderThan5y')}</SelectItem>
                    <SelectItem value="3650">{t('settings.olderThan10y')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    settingsMut.mutate({ data_retention_days: currentRetention } as Partial<Settings>)
                    setRetentionDays(undefined)
                  }}
                  disabled={retentionDays === undefined || settingsMut.isPending}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.backup')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.backupDesc')}
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" asChild>
              <a href={backupApi.exportUrl} download>
                {t('settings.downloadBackup')}
              </a>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? t('settings.importing') : t('settings.importBackup')}
            </Button>
          </div>

          {importResult && (
            <div className="mt-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium mb-1">{t('settings.backupImported')}</p>
              <ul className="space-y-0.5">
                <li>{t('settings.backupAssets')}: {importResult.assets}</li>
                <li>{t('settings.backupAccounts')}: {importResult.accounts}</li>
                <li>{t('settings.backupAccountHistory')}: {importResult.account_snapshots}</li>
                <li>{t('settings.backupPortfolioHistory')}: {importResult.portfolio_snapshots}</li>
                <li>{t('settings.backupPositionHistory')}: {importResult.position_snapshots}</li>
                <li>{t('settings.backupTransactions')}: {importResult.transactions}</li>
                <li>{t('settings.backupDividends')}: {importResult.dividends}</li>
                <li>{t('settings.backupInterests')}: {importResult.interests}</li>
              </ul>
            </div>
          )}

          {importError && (
            <div className="mt-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-700 dark:text-red-400">
              {importError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
