import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { settingsApi, assetsApi } from '@/api/assets'
import { pollTask } from '@/api/tasks'
import { Sidebar } from '@/components/app/Sidebar'
import { MobileNav } from '@/components/app/MobileNav'
import { TopBar } from '@/components/app/TopBar'
import { DemoBanner } from '@/components/app/DemoBanner'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { DividendsPage } from '@/pages/DividendsPage'
import { InterestPage } from '@/pages/InterestPage'
import { FiscalPage } from '@/pages/FiscalPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { AssetsPage } from '@/pages/AssetsPage'
import { AssetDetailPage } from '@/pages/AssetDetailPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { MonthlySavingsPage } from '@/pages/MonthlySavingsPage'
import { ProfilePage } from '@/pages/ProfilePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function useAutoUpdatePrices() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then((r) => r.data),
    enabled: !!user,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const minutes = settings?.price_update_interval ?? 0

  const invalidateAfterPriceUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    queryClient.invalidateQueries({ queryKey: ['assets-all'] })
    queryClient.invalidateQueries({ queryKey: ['patrimonio-evolution'] })
  }

  const triggerPriceUpdate = () =>
    assetsApi.updatePrices()
      .then((r) => pollTask(r.data.task_id))
      .then(invalidateAfterPriceUpdate)
      .catch(() => {}) // silent — background update, non-critical

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (minutes > 0) {
      intervalRef.current = setInterval(triggerPriceUpdate, minutes * 60 * 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [minutes, queryClient])
}

function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  useAutoUpdatePrices()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <DemoBanner />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-safe-mobile md:pb-0">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  // Guard against React StrictMode double-invoking the effect: both concurrent
  // calls share the same refresh cookie; the first rotates it (ROTATE_REFRESH_TOKENS),
  // the second gets a 401 on the now-blacklisted token and forces a logout.
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    fetchMe()
  }, [fetchMe])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/cartera" element={<PortfolioPage />} />
            <Route path="/activos" element={<AssetsPage />} />
            <Route path="/activos/:id" element={<AssetDetailPage />} />
            <Route path="/cuentas" element={<AccountsPage />} />
            <Route path="/operaciones" element={<TransactionsPage />} />
            <Route path="/dividendos" element={<DividendsPage />} />
            <Route path="/intereses" element={<InterestPage />} />
            <Route path="/fiscal" element={<FiscalPage />} />
            <Route path="/ahorro" element={<MonthlySavingsPage />} />
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
