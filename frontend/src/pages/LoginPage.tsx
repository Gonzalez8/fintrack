import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background dark:[background:radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(59,130,246,0.08)_0%,transparent_70%)]">
      <Card className="w-full max-w-sm dark:shadow-[0_24px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(59,130,246,0.1)]">
        <CardHeader className="items-center pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.5)] mb-3">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <h1 className="font-mono text-[18px] font-bold tracking-[4px] uppercase">Fintrack</h1>
          <p className="font-mono text-[9px] tracking-[4px] uppercase text-primary">Investment Terminal</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Usuario</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contraseña</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
