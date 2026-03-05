import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Landmark, Wallet, ArrowLeftRight,
  Coins, Percent, FileText, Settings, LogOut, Moon, Sun, TrendingUp, PiggyBank, UserCircle, Globe,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
]

function useDarkMode() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark'),
  )

  const toggle = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  return { isDark, toggle }
}

function SidebarLink({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all duration-150 border-l-2 ${
          isActive
            ? 'border-primary bg-primary/[0.08] text-[#60a5fa]'
            : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-4 w-4 shrink-0 transition-colors ${
              isActive ? 'text-[#60a5fa]' : 'text-muted-foreground'
            }`}
          />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const { isDark, toggle } = useDarkMode()
  const { t, i18n } = useTranslation()

  const sections = [
    {
      label: t('nav.summary'),
      links: [
        { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
        { to: '/cartera', icon: Briefcase, label: t('nav.portfolio') },
      ],
    },
    {
      label: t('nav.operations'),
      links: [
        { to: '/activos', icon: Landmark, label: t('nav.assets') },
        { to: '/cuentas', icon: Wallet, label: t('nav.accounts') },
        { to: '/operaciones', icon: ArrowLeftRight, label: t('nav.operations') },
        { to: '/dividendos', icon: Coins, label: t('nav.dividends') },
        { to: '/intereses', icon: Percent, label: t('nav.interests') },
      ],
    },
    {
      label: t('nav.analysis'),
      links: [
        { to: '/ahorro', icon: PiggyBank, label: t('nav.savings') },
      ],
    },
  ]

  const bottomLinks = [
    { to: '/fiscal', icon: FileText, label: t('nav.fiscal') },
    { to: '/configuracion', icon: Settings, label: t('nav.settings') },
    { to: '/perfil', icon: UserCircle, label: t('nav.profile') },
  ]

  return (
    <aside
      className="sticky top-0 hidden md:flex h-screen w-56 flex-col"
      style={{ background: 'hsl(var(--sidebar))', borderRight: '1px solid hsl(var(--sidebar-border))' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.4)]">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <span className="font-mono text-[15px] font-bold tracking-[3px] uppercase">Fintrack</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="mb-1 px-4 font-mono text-[9px] tracking-[3px] uppercase text-muted-foreground/50">
              {section.label}
            </p>
            {section.links.map((link) => (
              <SidebarLink key={link.to} {...link} />
            ))}
          </div>
        ))}

        <div className="my-3 h-px bg-border/60 mx-4" />

        {bottomLinks.map((link) => (
          <SidebarLink key={link.to} {...link} />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 space-y-1" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all border-l-2 border-transparent hover:bg-secondary hover:text-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              {LANGUAGES.find((l) => l.code === i18n.language)?.label ?? t('nav.language')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={i18n.language === lang.code ? 'font-semibold text-primary' : ''}
              >
                {lang.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all border-l-2 border-transparent hover:bg-secondary hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {isDark ? t('nav.lightMode') : t('nav.darkMode')}
        </button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground px-4 rounded-none border-l-2 border-transparent hover:border-transparent"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {t('nav.logout')}
        </Button>
      </div>
    </aside>
  )
}
