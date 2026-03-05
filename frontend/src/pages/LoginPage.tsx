import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const ALLOW_REGISTRATION = import.meta.env.VITE_ALLOW_REGISTRATION !== 'false'

// Extend window for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      onSuccess()
    } catch {
      setError(t('login.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('common.username')}</label>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('common.password')}</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('login.signingIn') : t('login.signIn')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Register form
// ---------------------------------------------------------------------------
function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', password_confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const { t } = useTranslation()

  const setField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await register({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        password_confirm: form.password_confirm,
      })
      onSuccess()
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string | string[]> } })?.response?.data
      if (data && typeof data === 'object') {
        const flat: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v)
        }
        setErrors(flat)
      } else {
        setErrors({ non_field_errors: t('login.registrationError') })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('common.username')}</label>
        <Input value={form.username} onChange={(e) => setField('username', e.target.value)} autoFocus />
        {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          {t('common.email')} <span className="text-xs">({t('common.optional')})</span>
        </label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder={t('common.emailPlaceholder')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('common.password')}</label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('login.confirmPassword')}</label>
        <Input
          type="password"
          value={form.password_confirm}
          onChange={(e) => setField('password_confirm', e.target.value)}
        />
        {errors.password_confirm && (
          <p className="text-xs text-destructive">{errors.password_confirm}</p>
        )}
      </div>
      {errors.non_field_errors && (
        <p className="text-sm text-destructive">{errors.non_field_errors}</p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('login.registering') : t('login.register')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Google Sign-In button (renders via Google Identity Services)
// ---------------------------------------------------------------------------
function GoogleButton() {
  const buttonRef = useRef<HTMLDivElement>(null)
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle)
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return

    const initButton = () => {
      if (!window.google || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            await loginWithGoogle(credential)
            navigate('/')
          } catch {
            // stays on login page — user can try again
          }
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: '304',
        text: 'continue_with',
        shape: 'rectangular',
      })
    }

    if (window.google) {
      initButton()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = initButton
      document.head.appendChild(script)
    }
  }, [loginWithGoogle, navigate])

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground/50">{t('login.or')}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div ref={buttonRef} className="flex justify-center" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const { t } = useTranslation()

  const onSuccess = () => navigate('/')

  const handleDemo = async () => {
    setDemoLoading(true)
    setDemoError('')
    try {
      const { worker } = await import('@/demo/index')
      await worker.start({ onUnhandledRequest: 'bypass', serviceWorker: { url: '/mockServiceWorker.js' } })
      await login('demo', 'demo')
      navigate('/')
    } catch {
      setDemoError(t('login.demoError'))
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background dark:[background:radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(59,130,246,0.08)_0%,transparent_70%)]">
      <Card className="w-full max-w-sm dark:shadow-[0_24px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(59,130,246,0.1)]">
        <CardHeader className="items-center pb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.5)] mb-3">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <h1 className="font-mono text-[18px] font-bold tracking-[4px] uppercase">Fintrack</h1>
          <p className="font-mono text-[9px] tracking-[4px] uppercase text-primary">{t('login.subtitle')}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {ALLOW_REGISTRATION ? (
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-1">
                <TabsTrigger value="login" className="flex-1">{t('login.signIn')}</TabsTrigger>
                <TabsTrigger value="register" className="flex-1">{t('login.register')}</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-3">
                <LoginForm onSuccess={onSuccess} />
              </TabsContent>
              <TabsContent value="register" className="mt-3">
                <RegisterForm onSuccess={onSuccess} />
              </TabsContent>
            </Tabs>
          ) : (
            <LoginForm onSuccess={onSuccess} />
          )}

          <GoogleButton />

          {IS_DEMO_MODE && (
            <div className="border-t pt-4">
              <p className="mb-2 text-center text-xs text-muted-foreground">
                {t('login.noAccount')}
              </p>
              {demoError && <p className="mb-2 text-xs text-destructive text-center">{demoError}</p>}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={demoLoading}
                onClick={handleDemo}
              >
                {demoLoading ? t('login.demoLoading') : t('login.tryDemo')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
