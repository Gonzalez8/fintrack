import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi, snapshotsApi } from '@/api/assets'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyCell } from '@/components/app/MoneyCell'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, ChevronDown, ChevronUp, Camera } from 'lucide-react'
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from '@/lib/constants'
import type { Account, AccountSnapshot } from '@/types'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CuentasPage() {
  const queryClient = useQueryClient()
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })

  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'OPERATIVA' })

  const [snapshotDialog, setSnapshotDialog] = useState<Account | null>(null)
  const [snapshotForm, setSnapshotForm] = useState({ date: todayStr(), balance: '', note: '' })

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

  // Saldo total
  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance || '0'), 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Cuentas">
        <Button size="sm" variant="outline" onClick={openBulkDialog} disabled={accounts.length === 0}>
          <Camera className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Snapshot</span>
        </Button>
        <Button size="sm" onClick={() => setShowNewAccount(true)}>
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Nueva cuenta</span>
        </Button>
      </PageHeader>

      {/* Resumen total */}
      {accounts.length > 0 && (
        <div className="rounded-lg border border-border px-4 py-3 flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            Total cuentas
          </span>
          <span className="font-mono text-xl font-bold tabular-nums">
            <MoneyCell value={totalBalance.toFixed(2)} />
          </span>
        </div>
      )}

      {/* Grid de cuentas */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>
          <Button size="sm" className="mt-3" onClick={() => setShowNewAccount(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Crear primera cuenta
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onSnapshot={() => openSnapshotDialog(account)}
              onDelete={() => {
                if (confirm(`Eliminar cuenta "${account.name}"?`)) deleteAccountMut.mutate(account.id)
              }}
              onDeleteSnapshot={(id) => {
                if (confirm('Eliminar snapshot?')) deleteSnapshotMut.mutate(id)
              }}
            />
          ))}
        </div>
      )}

      {/* ── Dialog: nueva cuenta ── */}
      <Dialog open={showNewAccount} onOpenChange={(open) => !open && setShowNewAccount(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva cuenta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 pt-1">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input
                className="mt-1"
                placeholder="Ej: Santander"
                value={newAccount.name}
                onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAccount.name.trim())
                    createAccountMut.mutate({ name: newAccount.name.trim(), type: newAccount.type })
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={newAccount.type} onValueChange={(v) => setNewAccount((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!newAccount.name.trim() || createAccountMut.isPending}
              onClick={() => createAccountMut.mutate({ name: newAccount.name.trim(), type: newAccount.type })}
            >
              {createAccountMut.isPending ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: snapshot individual ── */}
      <Dialog open={!!snapshotDialog} onOpenChange={(open) => !open && setSnapshotDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Actualizar saldo</DialogTitle>
            <p className="text-sm text-muted-foreground">{snapshotDialog?.name}</p>
          </DialogHeader>
          <div className="grid gap-4 pt-1">
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <Input
                className="mt-1"
                type="date"
                value={snapshotForm.date}
                onChange={(e) => setSnapshotForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Saldo</label>
              <Input
                className="mt-1"
                type="number"
                step="any"
                value={snapshotForm.balance}
                onChange={(e) => setSnapshotForm((p) => ({ ...p, balance: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nota <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <Input
                className="mt-1"
                value={snapshotForm.note}
                onChange={(e) => setSnapshotForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Ej: cierre enero"
              />
            </div>
            <Button
              disabled={!snapshotForm.balance || createSnapshotMut.isPending}
              onClick={() =>
                snapshotDialog &&
                createSnapshotMut.mutate({
                  account: snapshotDialog.id,
                  date: snapshotForm.date,
                  balance: snapshotForm.balance,
                  note: snapshotForm.note,
                })
              }
            >
              {createSnapshotMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: snapshot bulk ── */}
      <Dialog open={showBulk} onOpenChange={(open) => !open && setShowBulk(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Snapshot mensual</DialogTitle>
            <p className="text-sm text-muted-foreground">Actualiza el saldo de todas las cuentas</p>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <Input
                className="mt-1"
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{account.name}</p>
                    <Badge className={ACCOUNT_TYPE_COLORS[account.type] ?? ''} variant="secondary">
                      {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">Saldo</label>
                      <Input
                        className="mt-0.5"
                        type="number"
                        step="any"
                        value={bulkBalances[account.id]?.balance ?? ''}
                        onChange={(e) =>
                          setBulkBalances((p) => ({
                            ...p,
                            [account.id]: { ...p[account.id], balance: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">Nota</label>
                      <Input
                        className="mt-0.5"
                        placeholder="Opcional"
                        value={bulkBalances[account.id]?.note ?? ''}
                        onChange={(e) =>
                          setBulkBalances((p) => ({
                            ...p,
                            [account.id]: { ...p[account.id], note: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={submitBulk} disabled={bulkSnapshotMut.isPending} className="w-full">
              {bulkSnapshotMut.isPending ? 'Guardando...' : 'Guardar snapshot'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── AccountCard ───────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onSnapshot,
  onDelete,
  onDeleteSnapshot,
}: {
  account: Account
  onSnapshot: () => void
  onDelete: () => void
  onDeleteSnapshot: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: snapshotsData } = useQuery({
    queryKey: ['account-snapshots', account.id],
    queryFn: () => snapshotsApi.list({ account: account.id, page_size: '20' }).then((r) => r.data),
    enabled: expanded,
  })

  const snapshots = snapshotsData?.results ?? []

  return (
    <Card className="flex flex-col">
      <CardContent className="flex-1 pt-4">
        {/* Cabecera: nombre + acciones */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{account.name}</p>
            <Badge className={`mt-1 ${ACCOUNT_TYPE_COLORS[account.type] ?? ''}`} variant="secondary">
              {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
            </Badge>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onSnapshot}
              title="Actualizar saldo"
            >
              <Camera className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        {/* Saldo */}
        <p className="mt-4 font-mono text-2xl font-bold tabular-nums">
          <MoneyCell value={account.balance} />
        </p>

        {/* Toggle historial */}
        <button
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Historial
        </button>

        {/* Lista de snapshots */}
        {expanded && (
          <div className="mt-2 space-y-0 border-t border-border/50">
            {snapshots.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">Sin snapshots registrados</p>
            ) : (
              snapshots.map((s: AccountSnapshot) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border-b border-border/30 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-muted-foreground">{s.date}</span>
                    {s.note && (
                      <span className="ml-2 text-[11px] text-muted-foreground/70 truncate">{s.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-sm tabular-nums">
                      <MoneyCell value={s.balance} />
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onDeleteSnapshot(s.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive/70" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
