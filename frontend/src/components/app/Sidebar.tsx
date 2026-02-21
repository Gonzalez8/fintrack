import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Landmark, Wallet, ArrowLeftRight, Coins,
  Percent, FileText, Settings, LogOut
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
  { to: '/configuracion', icon: Settings, label: 'Configuracion' },
]

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="text-lg font-bold">Fintrack</h1>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-2">
        <Button variant="ghost" className="w-full justify-start gap-3" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </Button>
      </div>
    </aside>
  )
}
