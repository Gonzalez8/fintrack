import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { setAccessToken } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { PageHeader } from '@/components/app/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, UserCircle } from 'lucide-react'
import type { ChangePasswordRequest } from '@/types'

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------
function ProfileCard() {
  const queryClient = useQueryClient()
  const storeUser = useAuthStore((s) => s.user)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.getProfile().then((r) => r.data),
  })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ username: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const updateMut = useMutation({
    mutationFn: (data: { username?: string; email?: string }) => authApi.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data
      if (data && typeof data === 'object') {
        const flat: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v)
        }
        setErrors(flat)
      }
    },
  })

  const startEditing = () => {
    setForm({ username: profile?.username ?? '', email: profile?.email ?? '' })
    setErrors({})
    setEditing(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    updateMut.mutate(form)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Cargando…</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-4 w-4 text-primary" />
          Información de cuenta
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">Usuario</span>
              <span className="font-mono font-medium">{profile?.username}</span>
              <span className="text-muted-foreground">Email</span>
              <span>{profile?.email || <span className="text-muted-foreground italic">Sin email</span>}</span>
              <span className="text-muted-foreground">Miembro desde</span>
              <span>
                {profile?.date_joined
                  ? new Date(profile.date_joined).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}
              </span>
              {storeUser && (
                <>
                  <span className="text-muted-foreground">ID de usuario</span>
                  <span className="font-mono text-xs text-muted-foreground">{storeUser.id}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={startEditing}>
                Editar perfil
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle className="h-3 w-3" /> Guardado
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 max-w-sm">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Usuario</label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoFocus
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="tu@email.com"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Change password card
// ---------------------------------------------------------------------------
function ChangePasswordCard() {
  const [form, setForm] = useState<ChangePasswordRequest>({
    current_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  const setField = (field: keyof ChangePasswordRequest, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const changeMut = useMutation({
    mutationFn: (data: ChangePasswordRequest) => authApi.changePassword(data),
    onSuccess: ({ data }) => {
      setAccessToken(data.access)
      setForm({ current_password: '', new_password: '', new_password_confirm: '' })
      setErrors({})
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: Record<string, string | string[]> } })?.response?.data
      if (data && typeof data === 'object') {
        const flat: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v)
        }
        setErrors(flat)
      } else {
        setErrors({ non_field_errors: 'Error al cambiar la contraseña' })
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    changeMut.mutate(form)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cambiar contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contraseña actual</label>
            <Input
              type="password"
              value={form.current_password}
              onChange={(e) => setField('current_password', e.target.value)}
            />
            {errors.current_password && (
              <p className="text-xs text-destructive">{errors.current_password}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nueva contraseña</label>
            <Input
              type="password"
              value={form.new_password}
              onChange={(e) => setField('new_password', e.target.value)}
            />
            {errors.new_password && (
              <p className="text-xs text-destructive">{errors.new_password}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirmar nueva contraseña</label>
            <Input
              type="password"
              value={form.new_password_confirm}
              onChange={(e) => setField('new_password_confirm', e.target.value)}
            />
            {errors.new_password_confirm && (
              <p className="text-xs text-destructive">{errors.new_password_confirm}</p>
            )}
          </div>
          {errors.non_field_errors && (
            <p className="text-sm text-destructive">{errors.non_field_errors}</p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={changeMut.isPending}>
              {changeMut.isPending ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
            {success && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle className="h-3 w-3" /> Contraseña actualizada
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function PerfilPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-2xl">
      <PageHeader title="Mi perfil" />
      <ProfileCard />
      <ChangePasswordCard />
    </div>
  )
}
