import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { assetsApi } from '@/api/assets'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { MoneyCell } from '@/components/app/MoneyCell'
import { RefreshCw, Trash2 } from 'lucide-react'

const typeLabels: Record<string, string> = {
  STOCK: 'Accion',
  ETF: 'ETF',
  FUND: 'Fondo',
  CRYPTO: 'Crypto',
}

const statusVariant = (s: string | null) => {
  if (s === 'OK') return 'default' as const
  if (s === 'ERROR') return 'destructive' as const
  return 'secondary' as const
}

export function ActivosPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const params: Record<string, string> = { page_size: '500' }
  if (search) params.search = search
  if (typeFilter !== 'ALL') params.type = typeFilter
  if (statusFilter !== 'ALL') params.price_status = statusFilter

  const { data } = useQuery({
    queryKey: ['assets-all', search, typeFilter, statusFilter],
    queryFn: () => assetsApi.list(params).then((r) => r.data),
  })

  const [priceResult, setPriceResult] = useState<{ updated: number; errors: string[] } | null>(null)
  const updatePricesMut = useMutation({
    mutationFn: () => assetsApi.updatePrices().then((r) => r.data),
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
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Activos</h2>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Catalogo de activos</CardTitle>
          <div className="flex items-center gap-3">
            {priceResult && (
              <span className="text-sm text-muted-foreground">
                {priceResult.updated} actualizados
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
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-3">
            <Input
              placeholder="Buscar nombre o ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                <SelectItem value="STOCK">Accion</SelectItem>
                <SelectItem value="ETF">ETF</SelectItem>
                <SelectItem value="FUND">Fondo</SelectItem>
                <SelectItem value="CRYPTO">Crypto</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="OK">OK</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
                <SelectItem value="NO_TICKER">Sin ticker</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Pais</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Actualizado</TableHead>
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
                      size="sm"
                      variant="ghost"
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
                    No hay activos
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
