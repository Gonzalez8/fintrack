import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/api/portfolio'
import { assetsApi } from '@/api/assets'
import { DataTable, type Column } from '@/components/app/DataTable'
import { MoneyCell } from '@/components/app/MoneyCell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatQty, formatPercent, formatMoney } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import type { Position } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  STOCK: 'bg-blue-100 text-blue-800',
  ETF: 'bg-green-100 text-green-800',
  FUND: 'bg-purple-100 text-purple-800',
  CRYPTO: 'bg-orange-100 text-orange-800',
}

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
      <Badge className={TYPE_COLORS[r.asset_type] ?? ''} variant="secondary">
        {r.asset_type}
      </Badge>
    ),
  },
  { header: 'Cantidad', accessor: (r) => formatQty(r.quantity), className: 'text-right' },
  { header: 'Precio Medio', accessor: (r) => <MoneyCell value={r.avg_cost} />, className: 'text-right' },
  { header: 'Coste Total', accessor: (r) => <MoneyCell value={r.cost_total} />, className: 'text-right' },
  { header: 'Precio Actual', accessor: (r) => <MoneyCell value={r.current_price} />, className: 'text-right' },
  { header: 'Valor Mercado', accessor: (r) => <MoneyCell value={r.market_value} />, className: 'text-right' },
  {
    header: 'P&L',
    accessor: (r) => (
      <div className="text-right">
        <MoneyCell value={r.unrealized_pnl} colored />
        <div className="text-xs text-muted-foreground">{formatPercent(r.unrealized_pnl_pct)}</div>
      </div>
    ),
    className: 'text-right',
  },
  { header: 'Peso', accessor: (r) => `${r.weight_pct}%`, className: 'text-right' },
]

export function CarteraPage() {
  const queryClient = useQueryClient()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cartera</h2>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap gap-6 text-sm">
          <div>Coste total: <strong>{formatMoney(data.total_cost)}</strong></div>
          <div>Inversiones: <strong>{formatMoney(data.total_market_value)}</strong></div>
          <div>
            P&L: <strong className={parseFloat(data.total_unrealized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatMoney(data.total_unrealized_pnl)}
            </strong>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.positions.filter((p) => p.asset_ticker && parseFloat(p.current_price) > 0) ?? []}
        loading={isLoading}
      />

    </div>
  )
}
