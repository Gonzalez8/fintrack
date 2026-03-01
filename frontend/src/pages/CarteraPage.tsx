import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { assetsApi } from '@/api/assets'
import { DataTable, type Column } from '@/components/app/DataTable'
import { MoneyCell } from '@/components/app/MoneyCell'
import { AssetEvolutionChart } from '@/components/app/AssetEvolutionChart'
import { PositionCard, PositionCardSkeleton } from '@/components/app/PositionCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/app/PageHeader'
import { formatQty, formatPercent, formatMoney } from '@/lib/utils'
import { TYPE_BADGE_COLORS } from '@/lib/constants'
import { RefreshCw } from 'lucide-react'
import type { Position } from '@/types'

const columns: Column<Position>[] = [
  {
    header: 'Activo',
    accessor: (r) => (
      <div>
        <span className="font-medium">{r.asset_name}</span>
        {r.asset_ticker && <span className="ml-2 text-xs text-muted-foreground">{r.asset_ticker}</span>}
      </div>
    ),
  },
  {
    header: 'Tipo',
    accessor: (r) => (
      <Badge className={TYPE_BADGE_COLORS[r.asset_type] ?? ''} variant="secondary">
        {r.asset_type}
      </Badge>
    ),
  },
  { header: 'Cantidad', accessor: (r) => formatQty(r.quantity), className: 'text-right' },
  { header: 'Coste Total', accessor: (r) => <MoneyCell value={r.cost_total} />, className: 'text-right' },
  { header: 'Precio Actual', accessor: (r) => <MoneyCell value={r.current_price} />, className: 'text-right' },
  {
    header: 'Valor Mercado',
    accessor: (r) => <span className="font-semibold text-base">{formatMoney(r.market_value)}</span>,
    className: 'text-right',
  },
  {
    header: 'P&L',
    accessor: (r) => {
      const pnl = parseFloat(r.unrealized_pnl)
      const colorClass = pnl > 0 ? 'money-positive' : pnl < 0 ? 'money-negative' : ''
      return (
        <div className="text-right">
          <span className={`font-semibold text-base ${colorClass}`}>{formatMoney(r.unrealized_pnl)}</span>
          <div className={`text-xs ${colorClass || 'text-muted-foreground'}`}>{formatPercent(r.unrealized_pnl_pct)}</div>
        </div>
      )
    },
    className: 'text-right',
  },
  { header: 'Peso', accessor: (r) => `${r.weight_pct}%`, className: 'text-right' },
]

export function CarteraPage() {
  const queryClient = useQueryClient()
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [priceResult, setPriceResult] = useState<{
    updated: number
    errors: string[]
  } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => portfolioApi.get().then((r) => r.data),
  })

  const updatePricesMut = useMutation({
    mutationFn: () => assetsApi.updatePrices().then((r) => r.data),
    onSuccess: (result) => {
      setPriceResult({ updated: result.updated, errors: result.errors })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
    },
    onError: () => {
      setPriceResult({ updated: 0, errors: ['Error al conectar con Yahoo Finance'] })
    },
  })

  const filteredPositions = data?.positions.filter(
    (p) => p.asset_ticker && parseFloat(p.current_price) > 0,
  ) ?? []

  const totalPnl = parseFloat(data?.total_unrealized_pnl ?? '0')
  const totalCost = parseFloat(data?.total_cost ?? '0')
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : '0'
  const pnlColor = totalPnl > 0 ? 'money-positive' : totalPnl < 0 ? 'money-negative' : ''

  return (
    <div className="space-y-4">
      <PageHeader title="Cartera">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPriceResult(null); updatePricesMut.mutate() }}
          disabled={updatePricesMut.isPending}
          aria-label="Actualizar precios"
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${updatePricesMut.isPending ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {updatePricesMut.isPending ? 'Actualizando...' : 'Actualizar precios'}
          </span>
        </Button>
      </PageHeader>

      {priceResult && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{priceResult.updated}</span> precios actualizados
          {priceResult.errors.length > 0 && (
            <span className="text-destructive ml-1">· {priceResult.errors.length} errores</span>
          )}
        </p>
      )}

      {data && (
        <div className="grid gap-3 grid-cols-2 sm:gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Valor de Mercado</p>
              <p className="text-lg sm:text-2xl font-bold">{formatMoney(data.total_market_value)}</p>
            </CardContent>
          </Card>
          <Card className={totalPnl >= 0 ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">P&L No Realizado</p>
              <p className={`text-lg sm:text-2xl font-bold ${pnlColor}`}>{formatMoney(data.total_unrealized_pnl)}</p>
              <p className={`text-sm ${pnlColor}`}>{formatPercent(totalPnlPct)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Coste Total</p>
              <p className="text-base sm:text-lg font-semibold">{formatMoney(data.total_cost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Efectivo</p>
              <p className="text-base sm:text-lg font-semibold">{formatMoney(data.total_cash)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Mobile: lista de cards ── */}
      <div className="space-y-3 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <PositionCardSkeleton key={i} />)
          : filteredPositions.length === 0
            ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <p className="text-sm">Sin posiciones activas</p>
              </div>
            )
            : filteredPositions.map((p) => (
              <PositionCard
                key={p.asset_id}
                position={p}
                onClick={() => setSelectedPosition(p)}
              />
            ))
        }
      </div>

      {/* ── Desktop: tabla completa ── */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={filteredPositions}
          loading={isLoading}
          onRowClick={(row) => setSelectedPosition(row)}
        />
      </div>

      <Dialog open={!!selectedPosition} onOpenChange={(open) => { if (!open) setSelectedPosition(null) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              {selectedPosition?.asset_name}
              {selectedPosition?.asset_ticker && (
                <span className="text-sm font-normal text-muted-foreground">{selectedPosition.asset_ticker}</span>
              )}
              {selectedPosition?.asset_type && (
                <Badge className={TYPE_BADGE_COLORS[selectedPosition.asset_type] ?? ''} variant="secondary">
                  {selectedPosition.asset_type}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPosition && <AssetEvolutionChart position={selectedPosition} />}
        </DialogContent>
      </Dialog>

    </div>
  )
}
