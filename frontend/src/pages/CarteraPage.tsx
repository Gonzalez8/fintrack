import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { assetsApi } from '@/api/assets'
import { DataTable, type Column } from '@/components/app/DataTable'
import { MoneyCell } from '@/components/app/MoneyCell'
import { AssetEvolutionChart } from '@/components/app/AssetEvolutionChart'
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
      const color = pnl > 0 ? 'text-green-600' : pnl < 0 ? 'text-red-600' : ''
      return (
        <div className="text-right">
          <span className={`font-semibold text-base ${color}`}>{formatMoney(r.unrealized_pnl)}</span>
          <div className={`text-xs ${color || 'text-muted-foreground'}`}>{formatPercent(r.unrealized_pnl_pct)}</div>
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

  const totalPnl = parseFloat(data?.total_unrealized_pnl ?? '0')
  const totalCost = parseFloat(data?.total_cost ?? '0')
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : '0'
  const pnlColor = totalPnl > 0 ? 'text-green-600' : totalPnl < 0 ? 'text-red-600' : ''

  return (
    <div className="space-y-6">
      <PageHeader title="Cartera">
        {priceResult && (
          <span className="text-sm text-muted-foreground">
            {priceResult.updated} precios actualizados
            {priceResult.errors.length > 0 && (
              <span className="text-destructive ml-1">({priceResult.errors.length} errores)</span>
            )}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPriceResult(null); updatePricesMut.mutate() }}
          disabled={updatePricesMut.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${updatePricesMut.isPending ? 'animate-spin' : ''}`} />
          {updatePricesMut.isPending ? 'Actualizando...' : 'Actualizar precios'}
        </Button>
      </PageHeader>

      {data && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Valor de Mercado</p>
              <p className="text-2xl font-bold">{formatMoney(data.total_market_value)}</p>
            </CardContent>
          </Card>
          <Card className={totalPnl >= 0 ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">P&L No Realizado</p>
              <p className={`text-2xl font-bold ${pnlColor}`}>{formatMoney(data.total_unrealized_pnl)}</p>
              <p className={`text-sm ${pnlColor}`}>{formatPercent(totalPnlPct)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Coste Total</p>
              <p className="text-lg font-semibold">{formatMoney(data.total_cost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Efectivo</p>
              <p className="text-lg font-semibold">{formatMoney(data.total_cash)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.positions.filter((p) => p.asset_ticker && parseFloat(p.current_price) > 0) ?? []}
        loading={isLoading}
        onRowClick={(row) => setSelectedPosition(row)}
      />

      <Dialog open={!!selectedPosition} onOpenChange={(open) => { if (!open) setSelectedPosition(null) }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
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
