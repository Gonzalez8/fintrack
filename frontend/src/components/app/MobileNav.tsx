import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Settings,
  Menu, Coins, Landmark, Wallet, Percent, FileText,
  LogOut, Moon, Sun,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

// ─── Navigation map ──────────────────────────────────────────────────────────

const PRIMARY_TABS = [
  { to: '/',            icon: LayoutDashboard, label: 'Inicio',      end: true },
  { to: '/cartera',     icon: Briefcase,        label: 'Cartera',     end: false },
  { to: '/operaciones', icon: ArrowLeftRight,   label: 'Operaciones', end: false },
]

const SECONDARY_ITEMS = [
  { to: '/dividendos',   icon: Coins,    label: 'Dividendos' },
  { to: '/intereses',    icon: Percent,  label: 'Intereses' },
  { to: '/activos',      icon: Landmark, label: 'Activos' },
  { to: '/cuentas',      icon: Wallet,   label: 'Cuentas' },
  { to: '/fiscal',       icon: FileText, label: 'Fiscal' },
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
  const { isDark, toggle } = useDarkMode()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const closeSheet = () => setSheetOpen(false)

  const handleSecondaryNav = (to: string) => {
    closeSheet()
    navigate(to)
  }

  return (
    <nav
      aria-label="Navegación principal"
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
                {/* Active indicator — top */}
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
              aria-label="Más secciones"
              aria-expanded={sheetOpen}
              className="flex flex-1 flex-col items-center justify-center gap-0.5
                         text-[11px] font-medium text-muted-foreground
                         transition-colors select-none"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>Más</span>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="pb-safe-mobile">
            <SheetHeader className="px-4 pt-2 pb-4">
              <SheetTitle className="text-base">Más secciones</SheetTitle>
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
              <button
                onClick={toggle}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg
                           bg-muted py-3 text-sm font-medium
                           active:scale-95 transition-transform"
                aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
              >
                {isDark
                  ? <Sun className="h-4 w-4" aria-hidden="true" />
                  : <Moon className="h-4 w-4" aria-hidden="true" />
                }
                {isDark ? 'Modo claro' : 'Modo oscuro'}
              </button>

              <button
                onClick={() => { closeSheet(); logout() }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg
                           bg-destructive/10 py-3 text-sm font-medium text-destructive
                           active:scale-95 transition-transform"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Config tab (direct) ── */}
        <NavLink
          to="/configuracion"
          aria-label="Configuración"
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
              <span className={isActive ? 'font-mono' : ''}>Config</span>
            </>
          )}
        </NavLink>

      </div>
    </nav>
  )
}
