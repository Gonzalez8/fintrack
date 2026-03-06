import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  TrendingUp, BarChart3, Shield, PieChart, Wallet, FileText, ArrowRight,
  Check, Server, Globe, Calculator, Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

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
          prompt: () => void
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// useInView — one-shot intersection observer for scroll animations
// ---------------------------------------------------------------------------
function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold: 0.15, ...options },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return { ref, inView }
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
        <Input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('login.confirmPassword')}</label>
        <Input type="password" value={form.password_confirm} onChange={(e) => setField('password_confirm', e.target.value)} />
        {errors.password_confirm && <p className="text-xs text-destructive">{errors.password_confirm}</p>}
      </div>
      {errors.non_field_errors && <p className="text-sm text-destructive">{errors.non_field_errors}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('login.registering') : t('login.register')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Google Sign-In button
// ---------------------------------------------------------------------------
function GoogleButton() {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)
  const callbackRef = useRef<(r: { credential: string }) => void>()

  // Keep callback ref in sync so the Google SDK always calls the latest closure
  callbackRef.current = async ({ credential }) => {
    try { await loginWithGoogle(credential); navigate('/') } catch { /* stays on login */ }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const init = () => {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => callbackRef.current?.(r),
      })
      setReady(true)
    }
    if (window.google) { init() } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true; script.defer = true; script.onload = init
      document.head.appendChild(script)
    }
  }, [])

  if (!GOOGLE_CLIENT_ID) return null

  const handleClick = () => {
    if (!window.google) return
    window.google.accounts.id.prompt()
  }

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground/50">{t('login.or')}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border/50 bg-secondary/50 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary hover:border-border disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {t('login.continueWithGoogle')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppMockup — CSS-only app screenshot
// ---------------------------------------------------------------------------
function AppMockup({ className, variant = 'dashboard' }: { className?: string; variant?: 'dashboard' | 'fiscal' | 'accounts' }) {
  const { t } = useTranslation()

  return (
    <div className={cn(
      'rounded-xl border border-border/50 bg-card overflow-hidden shadow-2xl',
      'dark:border-white/10 dark:shadow-[0_25px_60px_rgba(0,0,0,0.5)]',
      className,
    )}>
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-muted/40 border-b border-border/30">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <div className="ml-4 h-5 flex-1 max-w-[220px] rounded bg-muted/60 flex items-center justify-center">
          <span className="font-mono text-[8px] text-muted-foreground/40">fintrack.local</span>
        </div>
      </div>

      {/* App content */}
      <div className="flex min-h-[200px]">
        {/* Sidebar mockup */}
        <div className="hidden sm:flex w-14 flex-col items-center gap-3 py-4 border-r border-border/30 bg-muted/20">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] flex items-center justify-center">
            <TrendingUp className="h-3 w-3 text-white" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn('h-4 w-4 rounded', i === 0 ? 'bg-primary/30' : 'bg-muted/60')} />
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-3 sm:p-4 space-y-3">
          {variant === 'dashboard' && (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t('landing.mockupPatrimony'), value: '124.350,00 €', color: '' },
                  { label: t('landing.mockupPnl'), value: '+12.840,50 €', color: 'money-positive' },
                  { label: t('landing.mockupCash'), value: '18.200,00 €', color: '' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/30 bg-background/50 p-2 sm:p-2.5">
                    <div className="font-mono text-[6px] sm:text-[7px] tracking-wider uppercase text-muted-foreground/50 truncate">{s.label}</div>
                    <div className={cn('font-mono text-[10px] sm:text-xs font-bold tabular-nums mt-0.5', s.color)}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Chart */}
              <div className="h-20 sm:h-28 rounded-lg border border-border/30 bg-background/50 p-2 overflow-hidden">
                <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="cg" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,45 Q15,43 30,40 T60,35 T90,28 T120,22 T150,18 T180,12 T200,8" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
                  <path d="M0,45 Q15,43 30,40 T60,35 T90,28 T120,22 T150,18 T180,12 T200,8 V60 H0 Z" fill="url(#cg)" />
                </svg>
              </div>
              {/* Table rows */}
              <div className="space-y-1">
                {[
                  { name: 'VWCE.L', pnl: '+8.4%', positive: true },
                  { name: 'BTCS.SG', pnl: '+24.1%', positive: true },
                  { name: 'SXR8.DE', pnl: '-2.3%', positive: false },
                  { name: 'ISPA.L', pnl: '+5.7%', positive: true },
                ].map((row) => (
                  <div key={row.name} className="flex items-center gap-2 rounded border border-border/20 bg-background/30 px-2 py-1.5">
                    <span className="font-mono text-[8px] sm:text-[9px] text-muted-foreground">{row.name}</span>
                    <div className="flex-1" />
                    <span className={cn('font-mono text-[8px] sm:text-[9px] font-medium', row.positive ? 'text-green-500' : 'text-red-500')}>{row.pnl}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {variant === 'fiscal' && (
            <>
              <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                <div className="font-mono text-[7px] tracking-wider uppercase text-muted-foreground/50 mb-2">Tax Year 2025</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-mono text-[7px] text-muted-foreground/40">Net Capital Gains</div>
                    <div className="font-mono text-sm font-bold money-positive">+3.240,50 €</div>
                  </div>
                  <div>
                    <div className="font-mono text-[7px] text-muted-foreground/40">Net Losses</div>
                    <div className="font-mono text-sm font-bold text-muted-foreground">0,00 €</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {['Industria de Diseño', 'Vanguard FTSE', 'iShares Core'].map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded border border-border/20 bg-background/30 px-2 py-1.5">
                    <span className="font-mono text-[8px] text-muted-foreground truncate">{name}</span>
                    <div className="flex-1" />
                    <div className="h-2 w-12 rounded bg-green-500/20" />
                  </div>
                ))}
              </div>
            </>
          )}

          {variant === 'accounts' && (
            <>
              {['Broker Principal', 'Cuenta Ahorro', 'Depósito'].map((name, i) => (
                <div key={name} className="rounded-lg border border-border/30 bg-background/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] font-medium">{name}</span>
                    <Badge variant="secondary" className="text-[7px] py-0 px-1.5">
                      {['Inversión', 'Ahorro', 'Depósito'][i]}
                    </Badge>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${[72, 45, 28][i]}%` }} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Showcase section — alternating layout
// ---------------------------------------------------------------------------
function ShowcaseSection({
  badge, badgeIcon: BadgeIcon, title, desc, highlights, mockupVariant, reversed,
}: {
  badge: string
  badgeIcon: typeof BarChart3
  title: string
  desc: string
  highlights: string[]
  mockupVariant: 'dashboard' | 'fiscal' | 'accounts'
  reversed?: boolean
}) {
  const { ref, inView } = useInView()

  return (
    <div
      ref={ref}
      className={cn(
        'grid lg:grid-cols-2 gap-12 lg:gap-20 items-center transition-all duration-1000',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12',
      )}
    >
      <div className={cn(reversed && 'lg:order-2')}>
        <div className="relative">
          <AppMockup variant={mockupVariant} className="w-full" />
          <div className="absolute -inset-8 bg-gradient-to-br from-primary/10 to-transparent rounded-3xl blur-3xl -z-10" />
        </div>
      </div>
      <div className={cn('space-y-6', reversed && 'lg:order-1')}>
        <Badge variant="secondary" className="border-primary/20 bg-primary/5 text-primary">
          <BadgeIcon className="h-3 w-3 mr-1.5" />
          {badge}
        </Badge>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
        <p className="text-lg text-muted-foreground leading-relaxed">{desc}</p>
        <ul className="space-y-3 pt-2">
          {highlights.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-3 w-3 text-primary" />
              </div>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Features data
// ---------------------------------------------------------------------------
const FEATURES = [
  { icon: BarChart3, titleKey: 'landing.featurePortfolioTitle', descKey: 'landing.featurePortfolioDesc' },
  { icon: PieChart, titleKey: 'landing.featureAllocationTitle', descKey: 'landing.featureAllocationDesc' },
  { icon: FileText, titleKey: 'landing.featureFiscalTitle', descKey: 'landing.featureFiscalDesc' },
  { icon: Wallet, titleKey: 'landing.featureAccountsTitle', descKey: 'landing.featureAccountsDesc' },
  { icon: Shield, titleKey: 'landing.featurePrivacyTitle', descKey: 'landing.featurePrivacyDesc' },
  { icon: TrendingUp, titleKey: 'landing.featurePricesTitle', descKey: 'landing.featurePricesDesc' },
] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const { t } = useTranslation()

  const onSuccess = () => navigate('/')
  const openLogin = () => { setAuthTab('login'); setAuthOpen(true) }
  const openRegister = () => { setAuthTab('register'); setAuthOpen(true) }

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

  // Intersection observers for scroll animations
  const stats = useInView()
  const grid = useInView()
  const cta = useInView()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/30 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[3px] uppercase">Fintrack</span>
          </div>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.navFeatures')}</a>
            <a href="#solution" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.navAbout')}</a>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {IS_DEMO_MODE && (
              <Button variant="ghost" size="sm" onClick={handleDemo} disabled={demoLoading} className="hidden sm:inline-flex">
                {demoLoading ? t('login.demoLoading') : t('login.tryDemo')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={openLogin} className="hidden sm:inline-flex">
              {t('login.signIn')}
            </Button>
            <Button
              size="sm"
              onClick={ALLOW_REGISTRATION ? openRegister : openLogin}
              className="bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            >
              {t('landing.heroCta')}
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_80%,rgba(59,130,246,0.08),transparent_60%)]" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />
          {/* Decorative rotating rings */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full border border-primary/5 animate-slow-spin" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full border border-primary/[0.03] animate-slow-spin" style={{ animationDirection: 'reverse', animationDuration: '45s' }} />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
                <span className="font-mono text-[10px] tracking-[2px] uppercase text-primary">
                  {t('landing.heroTagline')}
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]">
                <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  {t('landing.heroTitle').split('\n')[0]}
                </span>
                <br />
                <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
                  {t('landing.heroTitle').split('\n')[1]}
                </span>
              </h1>

              <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                {t('landing.heroSubtitle')}
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button
                  size="lg"
                  onClick={ALLOW_REGISTRATION ? openRegister : openLogin}
                  className="h-12 px-8 text-base bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_4px_24px_rgba(59,130,246,0.4)] hover:shadow-[0_4px_32px_rgba(59,130,246,0.6)] transition-all duration-300 gap-2"
                >
                  {t('landing.heroCta')} <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={IS_DEMO_MODE ? handleDemo : openLogin}
                  disabled={IS_DEMO_MODE && demoLoading}
                  className="h-12 px-8 text-base border-border/50 hover:border-primary/40 transition-all duration-300"
                >
                  {IS_DEMO_MODE
                    ? (demoLoading ? t('login.demoLoading') : t('landing.heroSecondaryCta'))
                    : t('login.signIn')}
                </Button>
              </div>

              {demoError && <p className="mt-4 text-sm text-destructive">{demoError}</p>}
            </div>

            {/* Right — mockup */}
            <div className="relative hidden lg:block">
              <div className="animate-float">
                <AppMockup variant="dashboard" className="w-full max-w-[540px] mx-auto" />
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent rounded-3xl blur-3xl -z-10 opacity-60 dark:opacity-40" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="relative border-y border-border/50 bg-muted/20">
        <div ref={stats.ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {[
              { icon: Server, label: t('landing.statSelfHosted'), desc: t('landing.statSelfHostedDesc') },
              { icon: Globe, label: t('landing.statLanguages'), desc: t('landing.statLanguagesDesc') },
              { icon: Calculator, label: t('landing.statMethods'), desc: t('landing.statMethodsDesc') },
              { icon: Zap, label: t('landing.statPrices'), desc: t('landing.statPricesDesc') },
            ].map((stat, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center text-center gap-3 transition-all duration-700',
                  stats.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
                )}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-sm font-bold tracking-wide">{stat.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{stat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature showcases ──────────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-24 lg:space-y-32">
          <ShowcaseSection
            badge={t('landing.featurePortfolioTitle')}
            badgeIcon={BarChart3}
            title={t('landing.showcasePortfolioTitle')}
            desc={t('landing.showcasePortfolioDesc')}
            highlights={[
              t('landing.showcasePortfolioHighlight1'),
              t('landing.showcasePortfolioHighlight2'),
              t('landing.showcasePortfolioHighlight3'),
            ]}
            mockupVariant="dashboard"
          />
          <ShowcaseSection
            badge={t('landing.featureFiscalTitle')}
            badgeIcon={FileText}
            title={t('landing.showcaseFiscalTitle')}
            desc={t('landing.showcaseFiscalDesc')}
            highlights={[
              t('landing.showcaseFiscalHighlight1'),
              t('landing.showcaseFiscalHighlight2'),
              t('landing.showcaseFiscalHighlight3'),
            ]}
            mockupVariant="fiscal"
            reversed
          />
          <ShowcaseSection
            badge={t('landing.featureAccountsTitle')}
            badgeIcon={Wallet}
            title={t('landing.showcaseAccountsTitle')}
            desc={t('landing.showcaseAccountsDesc')}
            highlights={[
              t('landing.showcaseAccountsHighlight1'),
              t('landing.showcaseAccountsHighlight2'),
              t('landing.showcaseAccountsHighlight3'),
            ]}
            mockupVariant="accounts"
          />
        </div>
      </section>

      {/* ── Feature grid ───────────────────────────────────────────────── */}
      <section id="solution" className="py-20 sm:py-28 lg:py-32 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            ref={grid.ref}
            className={cn(
              'text-center max-w-2xl mx-auto mb-16 transition-all duration-700',
              grid.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
            )}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t('landing.featureGridTitle')}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t('landing.featureGridSubtitle')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Card
                key={f.titleKey}
                className={cn(
                  'group relative p-6 transition-all duration-500 hover:border-primary/30 hover:shadow-lg dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]',
                  grid.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
                )}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {/* Gradient top border on hover */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 text-primary ring-1 ring-primary/10">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-base">{t(f.titleKey)}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(f.descKey)}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-28 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1d4ed8]/10 via-background to-[#3b82f6]/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(59,130,246,0.12),transparent_70%)]" />

        <div
          ref={cta.ref}
          className={cn(
            'relative mx-auto max-w-3xl px-4 sm:px-6 text-center transition-all duration-700',
            cta.inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
          )}
        >
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.4)] mb-6">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">{t('landing.ctaTitle')}</h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">{t('landing.ctaSubtitle')}</p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={ALLOW_REGISTRATION ? openRegister : openLogin}
              className="h-12 px-10 text-base bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] shadow-[0_4px_24px_rgba(59,130,246,0.4)] gap-2"
            >
              {t('landing.ctaButton')} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <a href="https://github.com/Gonzalez8/fintrack" target="_blank" rel="noopener noreferrer">
                {t('landing.ctaSecondary')}
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6]">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <span className="font-mono text-sm font-bold tracking-[3px] uppercase">Fintrack</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">{t('landing.footerTagline')}</p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground/60 mb-4">{t('landing.footerProduct')}</h4>
              <ul className="space-y-2.5">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.footerFeatures')}</a></li>
                <li><button onClick={IS_DEMO_MODE ? handleDemo : openLogin} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.footerDemo')}</button></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground/60 mb-4">{t('landing.footerResources')}</h4>
              <ul className="space-y-2.5">
                <li><a href="https://github.com/Gonzalez8/fintrack" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.footerDocs')}</a></li>
                <li><a href="https://github.com/Gonzalez8/fintrack" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.footerGithub')}</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground/60 mb-4">{t('landing.footerLegal')}</h4>
              <ul className="space-y-2.5">
                <li><span className="text-sm text-muted-foreground">{t('landing.footerPrivacy')}</span></li>
                <li><span className="text-sm text-muted-foreground">{t('landing.footerTerms')}</span></li>
                <li><span className="text-sm text-muted-foreground">{t('landing.footerLicense')}</span></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-border/50 text-center">
            <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted-foreground/50">
              {t('landing.footerCopyright')}
            </p>
          </div>
        </div>
      </footer>

      {/* ── Auth Dialog ────────────────────────────────────────────────── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.5)] mb-2">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="font-mono text-[18px] font-bold tracking-[4px] uppercase">
              Fintrack
            </DialogTitle>
            <p className="font-mono text-[9px] tracking-[4px] uppercase text-primary">
              {t('login.subtitle')}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {ALLOW_REGISTRATION ? (
              <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as 'login' | 'register')}>
                <TabsList className="w-full mb-1">
                  <TabsTrigger value="login" className="flex-1">{t('login.signIn')}</TabsTrigger>
                  <TabsTrigger value="register" className="flex-1">{t('login.register')}</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="mt-3"><LoginForm onSuccess={onSuccess} /></TabsContent>
                <TabsContent value="register" className="mt-3"><RegisterForm onSuccess={onSuccess} /></TabsContent>
              </Tabs>
            ) : (
              <LoginForm onSuccess={onSuccess} />
            )}

            <GoogleButton />

            {IS_DEMO_MODE && (
              <div className="border-t pt-4">
                <p className="mb-2 text-center text-xs text-muted-foreground">{t('login.noAccount')}</p>
                {demoError && <p className="mb-2 text-xs text-destructive text-center">{demoError}</p>}
                <Button type="button" variant="outline" className="w-full" disabled={demoLoading} onClick={handleDemo}>
                  {demoLoading ? t('login.demoLoading') : t('login.tryDemo')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
