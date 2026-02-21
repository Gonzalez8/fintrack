import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi, snapshotsApi } from '@/api/assets'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyCell } from '@/components/app/MoneyCell'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, ChevronDown, ChevronRight, Camera } from 'lucide-react'
import type { Account, AccountSnapshot } from '@/types'

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  OPERATIVA: 'bg-blue-100 text-blue-800',
  AHORRO: 'bg-green-100 text-green-800',
  INVERSION: 'bg-orange-100 text-orange-800',
  DEPOSITOS: 'bg-purple-100 text-purple-800',
  ALTERNATIVOS: 'bg-yellow-100 text-yellow-800',
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  OPERATIVA: 'Operativa',
  AHORRO: 'Ahorro',
  INVERSION: 'Inversion',
  DEPOSITOS: 'Depositos',
  ALTERNATIVOS: 'Alternativos',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function CuentasPage() {
  const queryClient = useQueryClient()
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'OPERATIVA' })

  // Single snapshot dialog
  const [snapshotDialog, setSnapshotDialog] = useState<Account | null>(null)
  const [snapshotForm, setSnapshotForm] = useState({ date: todayStr(), balance: '', note: '' })

  // Bulk snapshot dialog
  const [showBulk, setShowBulk] = useState(false)
  const [bulkDate, setBulkDate] = useState(todayStr())
  const [bulkBalances, setBulkBalances] = useState<Record<string, { balance: string; note: string }>>({})

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts-all'] })
    queryClient.invalidateQueries({ queryKey: ['account-snapshots'] })
    queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    queryClient.invalidateQueries({ queryKey: ['patrimonio-evolution'] })
  }

  const createAccountMut = useMutation({
    mutationFn: (data: { name: string; type: string }) => accountsApi.create(data as any),
    onSuccess: () => {
      invalidateAll()
      setNewAccount({ name: '', type: 'OPERATIVA' })
      setShowNewAccount(false)
    },
  })

  const deleteAccountMut = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: invalidateAll,
    onError: (err) => {
      const msg = (err as any)?.response?.data?.detail ?? 'Error al eliminar cuenta'
      alert(msg)
    },
  })

  const createSnapshotMut = useMutation({
    mutationFn: (data: { account: string; date: string; balance: string; note?: string }) =>
      snapshotsApi.create(data),
    onSuccess: () => {
      invalidateAll()
      setSnapshotDialog(null)
    },
  })

  const bulkSnapshotMut = useMutation({
    mutationFn: (data: { date: string; snapshots: Array<{ account: string; balance: string; note?: string }> }) =>
      snapshotsApi.bulkCreate(data),
    onSuccess: () => {
      invalidateAll()
      setShowBulk(false)
    },
  })

  const deleteSnapshotMut = useMutation({
    mutationFn: (id: string) => snapshotsApi.delete(id),
    onSuccess: invalidateAll,
  })

  const accounts = accountsData?.results ?? []

  const openSnapshotDialog = (account: Account) => {
    setSnapshotForm({ date: todayStr(), balance: account.balance ?? '0', note: '' })
    setSnapshotDialog(account)
  }

  const openBulkDialog = () => {
    setBulkDate(todayStr())
    const initial: Record<string, { balance: string; note: string }> = {}
    for (const a of accounts) {
      initial[a.id] = { balance: a.balance ?? '0', note: '' }
    }
    setBulkBalances(initial)
    setShowBulk(true)
  }

  const submitBulk = () => {
    const snapshots = Object.entries(bulkBalances).map(([account, { balance, note }]) => ({
      account,
      balance,
      note,
    }))
    bulkSnapshotMut.mutate({ date: bulkDate, snapshots })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cuentas</h2>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Cuentas</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openBulkDialog} disabled={accounts.length === 0}>
              <Camera className="mr-1 h-4 w-4" />Snapshot mensual
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewAccount(true)} disabled={showNewAccount}>
              <Plus className="mr-1 h-4 w-4" />Nueva cuenta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo actual</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showNewAccount && (
                <TableRow>
                  <TableCell></TableCell>
                  <TableCell>
                    <Input
                      className="w-44"
                      placeholder="Nombre"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                      autoFocus
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      className={selectClass + ' w-36'}
                      value={newAccount.type}
                      onChange={(e) => setNewAccount((p) => ({ ...p, type: e.target.value }))}
                    >
                      {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" disabled={!newAccount.name.trim()} onClick={() => createAccountMut.mutate({ name: newAccount.name.trim(), type: newAccount.type })}>
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowNewAccount(false); setNewAccount({ name: '', type: 'OPERATIVA' }) }}>X</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  expanded={!!expanded[account.id]}
                  onToggle={() => setExpanded((p) => ({ ...p, [account.id]: !p[account.id] }))}
                  onSnapshot={() => openSnapshotDialog(account)}
                  onDelete={() => { if (confirm(`Eliminar cuenta ${account.name}?`)) deleteAccountMut.mutate(account.id) }}
                  onDeleteSnapshot={(id) => deleteSnapshotMut.mutate(id)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Single snapshot dialog */}
      <Dialog open={!!snapshotDialog} onOpenChange={(open) => !open && setSnapshotDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar saldo — {snapshotDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <Input type="date" value={snapshotForm.date} onChange={(e) => setSnapshotForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Saldo</label>
              <Input type="number" step="any" value={snapshotForm.balance} onChange={(e) => setSnapshotForm((p) => ({ ...p, balance: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Nota</label>
              <Input value={snapshotForm.note} onChange={(e) => setSnapshotForm((p) => ({ ...p, note: e.target.value }))} placeholder="Opcional" />
            </div>
            <Button
              onClick={() => snapshotDialog && createSnapshotMut.mutate({
                account: snapshotDialog.id,
                date: snapshotForm.date,
                balance: snapshotForm.balance,
                note: snapshotForm.note,
              })}
              disabled={createSnapshotMut.isPending}
            >
              {createSnapshotMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk snapshot dialog */}
      <Dialog open={showBulk} onOpenChange={(open) => !open && setShowBulk(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Snapshot mensual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="w-36"
                        value={bulkBalances[account.id]?.balance ?? ''}
                        onChange={(e) => setBulkBalances((p) => ({
                          ...p,
                          [account.id]: { ...p[account.id], balance: e.target.value },
                        }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-36"
                        placeholder="Opcional"
                        value={bulkBalances[account.id]?.note ?? ''}
                        onChange={(e) => setBulkBalances((p) => ({
                          ...p,
                          [account.id]: { ...p[account.id], note: e.target.value },
                        }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button onClick={submitBulk} disabled={bulkSnapshotMut.isPending} className="w-full">
              {bulkSnapshotMut.isPending ? 'Guardando...' : 'Guardar snapshot'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AccountRow({
  account, expanded, onToggle, onSnapshot, onDelete, onDeleteSnapshot,
}: {
  account: Account
  expanded: boolean
  onToggle: () => void
  onSnapshot: () => void
  onDelete: () => void
  onDeleteSnapshot: (id: string) => void
}) {
  const { data: snapshotsData } = useQuery({
    queryKey: ['account-snapshots', account.id],
    queryFn: () => snapshotsApi.list({ account: account.id, page_size: '100' }).then((r) => r.data),
    enabled: expanded,
  })

  const snapshots = snapshotsData?.results ?? []

  return (
    <>
      <TableRow>
        <TableCell>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onToggle}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{account.name}</TableCell>
        <TableCell>
          <Badge className={ACCOUNT_TYPE_COLORS[account.type] ?? ''} variant="secondary">
            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <MoneyCell value={account.balance} />
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onSnapshot}>Actualizar saldo</Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && snapshots.length > 0 && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/50 p-0">
            <div className="px-8 py-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((s: AccountSnapshot) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.date}</TableCell>
                      <TableCell className="text-right"><MoneyCell value={s.balance} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.note}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Eliminar snapshot?')) onDeleteSnapshot(s.id) }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
      {expanded && snapshots.length === 0 && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/50 text-center text-sm text-muted-foreground py-3">
            Sin snapshots
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
