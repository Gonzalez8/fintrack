import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { assetsApi } from '@/api/assets'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'

const selectClass = 'flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

interface NewAssetFormProps {
  onCreated: (id: string) => void
}

export function NewAssetForm({ onCreated }: NewAssetFormProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [type, setType] = useState('STOCK')

  const createMut = useMutation({
    mutationFn: (data: { name: string; ticker?: string; type: string }) =>
      assetsApi.create(data as any),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['assets-all'] })
      onCreated(res.data.id)
      setName('')
      setTicker('')
      setType('STOCK')
      setOpen(false)
    },
  })

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="text-xs w-full" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3 w-3" />Nuevo activo
      </Button>
    )
  }

  return (
    <div className="rounded-md border p-2 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Nuevo activo</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setOpen(false)}>
          <ChevronUp className="h-3 w-3" />
        </Button>
      </div>
      <Input className="h-8 text-xs" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <Input className="h-8 text-xs flex-1" placeholder="Ticker (opcional)" value={ticker} onChange={(e) => setTicker(e.target.value)} />
        <select className={selectClass + ' flex-1'} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="STOCK">Accion</option>
          <option value="ETF">ETF</option>
          <option value="FUND">Fondo</option>
          <option value="CRYPTO">Crypto</option>
        </select>
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full text-xs"
        disabled={!name.trim() || createMut.isPending}
        onClick={() => createMut.mutate({ name: name.trim(), ticker: ticker.trim() || undefined, type })}
      >
        {createMut.isPending ? 'Creando...' : 'Crear activo'}
      </Button>
    </div>
  )
}
