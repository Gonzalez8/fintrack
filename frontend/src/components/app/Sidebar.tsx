import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Landmark, Wallet, ArrowLeftRight,
  Coins, Percent, FileText, Settings, LogOut, Moon, Sun, TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cartera', icon: Briefcase, label: 'Cartera' },
  { to: '/activos', icon: Landmark, label: 'Activos' },
  { to: '/cuentas', icon: Wallet, label: 'Cuentas' },
  { to: '/operaciones', icon: ArrowLeftRight, label: 'Operaciones' },
  { to: '/dividendos', icon: Coins, label: 'Dividendos' },
  { to: '/intereses', icon: Percent, label: 'Intereses' },
  { to: '/fiscal', icon: FileText, label: 'Fiscal' },
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

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const { isDark, toggle } = useDarkMode()

  return (
    <aside
      className="sticky top-0 flex h-screen w-56 flex-col"
      style={{ background: 'hsl(var(--sidebar))', borderRight: '1px solid hsl(var(--sidebar-border))' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <TrendingUp className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">Fintrack</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 pt-3">
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Menú
        </p>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                />
                {label}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        ))}

        <div className="my-3 h-px bg-border/60" />

        <NavLink
          to="/configuracion"
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Settings
                className={`h-4 w-4 shrink-0 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`}
              />
              Configuración
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </>
          )}
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="p-2 space-y-1" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  )
}
