import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
      <PageHeader title="Configuración" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajustes Generales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 max-w-xl">
            <div>
              <label className="text-sm font-medium">Moneda base</label>
              <Input value={current.base_currency ?? 'EUR'} onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Metodo coste</label>
              <Select value={current.cost_basis_method} onValueChange={(v) => setForm((f) => ({ ...f, cost_basis_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO (Primera entrada, primera salida)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Coste regalos</label>
              <Select value={current.gift_cost_mode} onValueChange={(v) => setForm((f) => ({ ...f, gift_cost_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZERO">Coste cero</SelectItem>
                  <SelectItem value="MARKET">Precio mercado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Decimales dinero</label>
              <Input type="number" value={current.rounding_money ?? 2} onChange={(e) => setForm((f) => ({ ...f, rounding_money: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Decimales cantidad</label>
              <Input type="number" value={current.rounding_qty ?? 6} onChange={(e) => setForm((f) => ({ ...f, rounding_qty: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Actualizar precios cada</label>
              <Select value={String(current.price_update_interval ?? 0)} onValueChange={(v) => setForm((f) => ({ ...f, price_update_interval: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Manual</SelectItem>
                  <SelectItem value="5">5 minutos</SelectItem>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="360">6 horas</SelectItem>
                  <SelectItem value="1440">24 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Fuente precio (modo AUTO)</label>
              <Select value={current.default_price_source ?? 'YAHOO'} onValueChange={(v) => setForm((f) => ({ ...f, default_price_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAHOO">Yahoo Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Frecuencia de snapshots</label>
              <Select value={String(current.snapshot_frequency ?? 1440)} onValueChange={(v) => setForm((f) => ({ ...f, snapshot_frequency: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Desactivado</SelectItem>
                  <SelectItem value="15">Cada 15 minutos</SelectItem>
                  <SelectItem value="30">Cada 30 minutos</SelectItem>
                  <SelectItem value="60">Cada hora</SelectItem>
                  <SelectItem value="180">Cada 3 horas</SelectItem>
                  <SelectItem value="360">Cada 6 horas</SelectItem>
                  <SelectItem value="720">Cada 12 horas</SelectItem>
                  <SelectItem value="1440">Cada 24 horas</SelectItem>
                </SelectContent>
              </Select>

              {snapshotStatus && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {snapshotStatus.frequency_minutes === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      Snapshots desactivados
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {snapshotStatus.last_snapshot
                          ? <>Último: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.last_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.last_snapshot)}</>
                          : 'Sin snapshots aún'}
                      </span>
                      {snapshotStatus.next_snapshot && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Próximo: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.next_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.next_snapshot)}
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
              {settingsMut.isPending ? 'Guardando...' : 'Guardar ajustes'}
            </Button>
            {settingsSaved && <span className="text-sm text-green-600">Ajustes guardados correctamente</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Almacenamiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-xl">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Espacio total utilizado por la base de datos.</p>
              <div className="flex items-baseline gap-1.5">
                {storageLoading ? (
                  <span className="text-sm text-muted-foreground">Calculando...</span>
                ) : (
                  <>
                    <span className="text-2xl font-semibold tabular-nums">
                      {storageInfo ? storageInfo.total_mb.toFixed(2) : '—'}
                    </span>
                    <span className="text-sm text-muted-foreground">MB</span>
                  </>
                )}
              </div>
              {storageInfo && storageInfo.tables.length > 0 && (
                <div className="mt-3 space-y-1">
                  {storageInfo.tables
                    .map((t) => (
                      <div key={t.table} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{t.table}</span>
                        <span className="tabular-nums">{t.size_mb.toFixed(3)} MB</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t">
              <label className="text-sm font-medium">Retención de datos históricos</label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Define cada cuánto tiempo se purgarán los datos históricos (snapshots, historial de precios).
                La purga automática no está activa aún; esta opción guardará tu preferencia para cuando se implemente.
              </p>
              <div className="flex items-center gap-3">
                <Select
                  value={currentRetention === null || currentRetention === undefined ? 'never' : String(currentRetention)}
                  onValueChange={(v) => setRetentionDays(v === 'never' ? null : parseInt(v))}
                >
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Nunca eliminar</SelectItem>
                    <SelectItem value="365">Más antiguos que 1 año</SelectItem>
                    <SelectItem value="1825">Más antiguos que 5 años</SelectItem>
                    <SelectItem value="3650">Más antiguos que 10 años</SelectItem>
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
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Copia de seguridad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Exporta todos los datos (activos, cuentas, transacciones, dividendos e intereses) a un fichero JSON.
            Para restaurar, importa un fichero de backup previamente exportado.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" asChild>
              <a href={backupApi.exportUrl} download>
                Descargar backup
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
              {importMut.isPending ? 'Importando...' : 'Importar backup'}
            </Button>
          </div>

          {importResult && (
            <div className="mt-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium mb-1">Backup importado correctamente</p>
              <ul className="space-y-0.5">
                <li>Activos: {importResult.assets}</li>
                <li>Cuentas: {importResult.accounts}</li>
                <li>Hist. saldos cuentas: {importResult.account_snapshots}</li>
                <li>Hist. evolución cartera: {importResult.portfolio_snapshots}</li>
                <li>Hist. posiciones por activo: {importResult.position_snapshots}</li>
                <li>Transacciones: {importResult.transactions}</li>
                <li>Dividendos: {importResult.dividends}</li>
                <li>Intereses: {importResult.interests}</li>
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
