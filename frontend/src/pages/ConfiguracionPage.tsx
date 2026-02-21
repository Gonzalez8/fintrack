import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/assets'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import type { Settings } from '@/types'

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Configuracion</h2>

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
                  <SelectItem value="WAC">WAC (Media Ponderada)</SelectItem>
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
              <label className="text-sm font-medium">Fuente de precios por defecto</label>
              <Select value={current.default_price_source ?? 'YAHOO'} onValueChange={(v) => setForm((f) => ({ ...f, default_price_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAHOO">Yahoo Finance</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Frecuencia de snapshots</label>
              <Select value={String(current.snapshot_frequency ?? 1440)} onValueChange={(v) => setForm((f) => ({ ...f, snapshot_frequency: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Desactivado</SelectItem>
                  <SelectItem value="360">Cada 6 horas</SelectItem>
                  <SelectItem value="720">Cada 12 horas</SelectItem>
                  <SelectItem value="1440">Cada 24 horas</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  )
}
