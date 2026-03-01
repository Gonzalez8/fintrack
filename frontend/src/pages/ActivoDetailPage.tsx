import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetsApi } from '@/api/assets'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { PriceChart } from '@/components/app/PriceChart'
import { ArrowLeft, Pencil, X } from 'lucide-react'
import { TYPE_BADGE_COLORS } from '@/lib/constants'
import type { Asset } from '@/types'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ActivoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Asset>>({})
  const [saved, setSaved] = useState(false)
  const [manualPrice, setManualPrice] = useState('')
  const [priceSaved, setPriceSaved] = useState(false)

  useEffect(() => {
    if (asset) {
      setForm({
        name: asset.name,
        ticker: asset.ticker,
        isin: asset.isin,
        type: asset.type,
        currency: asset.currency,
        price_mode: asset.price_mode,
        issuer_country: asset.issuer_country,
        domicile_country: asset.domicile_country,
        withholding_country: asset.withholding_country,
      })
    }
  }, [asset])

  const updateMut = useMutation({
    mutationFn: (data: Partial<Asset>) => assetsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const setPriceMut = useMutation({
    mutationFn: (price: string) => assetsApi.setPrice(id!, price),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] })
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setManualPrice('')
      setPriceSaved(true)
      setTimeout(() => setPriceSaved(false), 3000)
    },
  })

  if (isLoading) return <div className="text-muted-foreground">Cargando...</div>
  if (!asset) return <div className="text-muted-foreground">Activo no encontrado</div>

  const statusVariant = asset.price_status === 'OK' ? 'default' as const
    : asset.price_status === 'ERROR' ? 'destructive' as const
    : 'secondary' as const

  return (
    <div className="space-y-6">
      <PageHeader title={asset.name}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/activos')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Volver
        </Button>
        {editing ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(false)
                setForm({
                  name: asset.name, ticker: asset.ticker, isin: asset.isin,
                  type: asset.type, currency: asset.currency, price_mode: asset.price_mode,
                  issuer_country: asset.issuer_country,
                  domicile_country: asset.domicile_country,
                  withholding_country: asset.withholding_country,
                })
              }}
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
        )}
      </PageHeader>

      {/* ── Vista ── */}
      {!editing && (
        <div className="space-y-6">
          {/* Header de identidad */}
          <div className="flex flex-wrap items-center gap-2">
            {asset.ticker && (
              <span className="font-mono text-lg font-bold text-primary">{asset.ticker}</span>
            )}
            <Badge className={TYPE_BADGE_COLORS[asset.type] ?? ''} variant="secondary">
              {asset.type}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">{asset.currency}</Badge>
            {saved && <span className="text-sm text-green-600 ml-2">Guardado correctamente</span>}
          </div>

          {/* Gráfico de precios */}
          <div className="rounded-lg border border-border overflow-hidden">
            <PriceChart assetId={id!} ticker={asset.ticker} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Precio */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">Precio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Precio actual</p>
                    <p className="text-2xl font-bold tabular-nums"><MoneyCell value={asset.current_price} /></p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Modo</p>
                    <p className="text-sm font-medium">{asset.price_mode}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Fuente</p>
                    <p className="text-sm">{asset.price_source ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Estado</p>
                    {asset.price_status
                      ? <Badge variant={statusVariant}>{asset.price_status}</Badge>
                      : <span className="text-sm text-muted-foreground">-</span>}
                  </div>
                  <div className="col-span-2">
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Actualizado</p>
                    <p className="text-sm">
                      {asset.price_updated_at
                        ? new Date(asset.price_updated_at).toLocaleDateString('es-ES', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '-'}
                    </p>
                  </div>
                </div>

                {asset.price_mode === 'MANUAL' && (
                  <div className="border-t mt-4 pt-4">
                    <p className="text-sm text-muted-foreground mb-3">Actualizar precio manualmente</p>
                    <div className="flex items-center gap-3 max-w-xs">
                      <Input
                        type="number" step="any"
                        placeholder={asset.current_price ?? 'Precio'}
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                      />
                      <Button
                        onClick={() => setPriceMut.mutate(manualPrice)}
                        disabled={!manualPrice || setPriceMut.isPending}
                        size="sm"
                      >
                        {setPriceMut.isPending ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </div>
                    {priceSaved && <p className="mt-2 text-sm text-green-600">Precio actualizado</p>}
                    {setPriceMut.isError && <p className="mt-2 text-sm text-destructive">Error al guardar</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Datos fiscales */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">Datos fiscales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">ISIN</p>
                    <p className="text-sm font-mono">{asset.isin ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Pais emisor</p>
                    <p className="text-sm font-mono">{asset.issuer_country ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Domicilio</p>
                    <p className="text-sm font-mono">{asset.domicile_country ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Retención origen</p>
                    <p className="text-sm font-mono">{asset.withholding_country ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">Moneda</p>
                    <p className="text-sm font-mono">{asset.currency}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Edición ── */}
      {editing && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del activo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">Nombre</label>
                    <Input
                      value={form.name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 grid-cols-3">
                    <div>
                      <label className="text-sm font-medium">Ticker</label>
                      <Input
                        value={form.ticker ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value || null }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">ISIN</label>
                      <Input
                        value={form.isin ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase() || null
                          setForm((f) => {
                            const updated: Partial<Asset> = { ...f, isin: val }
                            if (val && val.length >= 2 && !f.issuer_country) {
                              updated.issuer_country = val.slice(0, 2)
                            }
                            return updated
                          })
                        }}
                        maxLength={12}
                        placeholder="US0378331005"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Moneda</label>
                      <Input
                        value={form.currency ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">Tipo</label>
                      <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as Asset['type'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STOCK">Accion</SelectItem>
                          <SelectItem value="ETF">ETF</SelectItem>
                          <SelectItem value="FUND">Fondo</SelectItem>
                          <SelectItem value="CRYPTO">Crypto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Modo precio</label>
                      <Select value={form.price_mode} onValueChange={(v) => setForm((f) => ({ ...f, price_mode: v as Asset['price_mode'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="AUTO">Auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos fiscales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">Pais emisor (ISO alpha-2)</label>
                    <Input
                      value={form.issuer_country ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, issuer_country: e.target.value.toUpperCase() || null }))}
                      maxLength={2}
                      placeholder="ES"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Domicilio instrumento</label>
                    <Input
                      value={form.domicile_country ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, domicile_country: e.target.value.toUpperCase() || null }))}
                      maxLength={2}
                      placeholder="IE"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Pais retencion origen</label>
                    <Input
                      value={form.withholding_country ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, withholding_country: e.target.value.toUpperCase() || null }))}
                      maxLength={2}
                      placeholder="US"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Precio (modo manual) */}
          {asset.price_mode === 'MANUAL' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Precio manual</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 max-w-xs">
                  <Input
                    type="number" step="any"
                    placeholder={asset.current_price ?? 'Precio'}
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                  />
                  <Button
                    onClick={() => setPriceMut.mutate(manualPrice)}
                    disabled={!manualPrice || setPriceMut.isPending}
                    size="sm"
                  >
                    {setPriceMut.isPending ? 'Guardando...' : 'Actualizar'}
                  </Button>
                </div>
                {priceSaved && <p className="mt-2 text-sm text-green-600">Precio actualizado</p>}
                {setPriceMut.isError && <p className="mt-2 text-sm text-destructive">Error al guardar</p>}
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </div>
  )
}
