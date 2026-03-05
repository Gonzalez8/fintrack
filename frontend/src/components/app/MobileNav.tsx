import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Settings,
  Menu, Coins, Landmark, Wallet, Percent, FileText,
  LogOut, Moon, Sun, PiggyBank, UserCircle, Globe,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
]

// ─── Dark mode hook ───────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function MobileNav() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [langSheetOpen, setLangSheetOpen] = useState(false)
  const { isDark, toggle } = useDarkMode()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const PRIMARY_TABS = [
    { to: '/',            icon: LayoutDashboard, label: t('nav.home'),       end: true },
    { to: '/cartera',     icon: Briefcase,        label: t('nav.portfolio'),  end: false },
    { to: '/operaciones', icon: ArrowLeftRight,   label: t('nav.operations'), end: false },
  ]

  const SECONDARY_ITEMS = [
    { to: '/dividendos',   icon: Coins,     label: t('nav.dividends') },
    { to: '/intereses',    icon: Percent,   label: t('nav.interests') },
    { to: '/activos',      icon: Landmark,  label: t('nav.assets') },
    { to: '/cuentas',      icon: Wallet,    label: t('nav.accounts') },
    { to: '/fiscal',       icon: FileText,  label: t('nav.fiscal') },
    { to: '/ahorro',       icon: PiggyBank, label: t('nav.savingsShort') },
    { to: '/perfil',       icon: UserCircle, label: t('nav.profileShort') },
  ]

  const closeSheet = () => setSheetOpen(false)

  const handleSecondaryNav = (to: string) => {
    closeSheet()
    navigate(to)
  }

  return (
    <nav
      aria-label={t('nav.mainNav')}
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-sidebar md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-stretch">

        {/* ── Primary tabs ── */}
        {PRIMARY_TABS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium
               transition-colors select-none relative
               ${isActive ? 'text-primary' : 'text-muted-foreground'}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
                )}
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className={isActive ? 'font-mono' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* ── "Más" Sheet trigger ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              aria-label={t('nav.moreSections')}
              aria-expanded={sheetOpen}
              className="flex flex-1 flex-col items-center justify-center gap-0.5
                         text-[11px] font-medium text-muted-foreground
                         transition-colors select-none"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>{t('nav.more')}</span>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="pb-safe-mobile">
            <SheetHeader className="px-4 pt-2 pb-4">
              <SheetTitle className="text-base">{t('nav.moreSections')}</SheetTitle>
            </SheetHeader>

            {/* Secondary nav grid */}
            <div className="grid grid-cols-3 gap-2 px-4">
              {SECONDARY_ITEMS.map(({ to, icon: Icon, label }) => (
                <button
                  key={to}
                  onClick={() => handleSecondaryNav(to)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-lg
                             bg-muted py-4 text-xs font-medium
                             active:scale-95 transition-transform"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {/* Divider + utility actions */}
            <div className="mt-4 border-t px-4 pt-3 pb-2 flex gap-2">
              {/* Language picker */}
              <Sheet open={langSheetOpen} onOpenChange={setLangSheetOpen}>
                <SheetTrigger asChild>
                  <button
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg
                               bg-muted py-3 text-sm font-medium
                               active:scale-95 transition-transform"
                    aria-label={t('nav.language')}
                  >
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    {LANGUAGES.find((l) => l.code === i18n.language)?.label ?? t('nav.language')}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom">
                  <SheetHeader className="px-4 pt-2 pb-4">
                    <SheetTitle className="text-base">{t('nav.language')}</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setLangSheetOpen(false) }}
                        className={`flex items-center justify-center rounded-lg py-3 text-sm font-medium
                                    active:scale-95 transition-transform
                                    ${i18n.language === lang.code ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>

              <button
                onClick={toggle}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg
                           bg-muted py-3 text-sm font-medium
                           active:scale-95 transition-transform"
                aria-label={isDark ? t('nav.lightMode') : t('nav.darkMode')}
              >
                {isDark
                  ? <Sun className="h-4 w-4" aria-hidden="true" />
                  : <Moon className="h-4 w-4" aria-hidden="true" />
                }
                {isDark ? t('nav.lightMode') : t('nav.darkMode')}
              </button>

              <button
                onClick={() => { closeSheet(); logout() }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg
                           bg-destructive/10 py-3 text-sm font-medium text-destructive
                           active:scale-95 transition-transform"
                aria-label={t('nav.logout')}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t('nav.logout')}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Config tab (direct) ── */}
        <NavLink
          to="/configuracion"
          aria-label={t('nav.settings')}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium
             transition-colors select-none relative
             ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <Settings className="h-5 w-5" aria-hidden="true" />
              <span className={isActive ? 'font-mono' : ''}>{t('nav.config')}</span>
            </>
          )}
        </NavLink>

      </div>
    </nav>
  )
}
