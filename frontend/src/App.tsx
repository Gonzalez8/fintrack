import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { settingsApi, assetsApi } from '@/api/assets'
import { Sidebar } from '@/components/app/Sidebar'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CarteraPage } from '@/pages/CarteraPage'
import { OperacionesPage } from '@/pages/OperacionesPage'
import { DividendosPage } from '@/pages/DividendosPage'
import { InteresesPage } from '@/pages/InteresesPage'
import { ImportarPage } from '@/pages/ImportarPage'
import { FiscalPage } from '@/pages/FiscalPage'
import { CuentasPage } from '@/pages/CuentasPage'
import { ActivosPage } from '@/pages/ActivosPage'
import { ActivoDetailPage } from '@/pages/ActivoDetailPage'
import { ConfiguracionPage } from '@/pages/ConfiguracionPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function useAutoUpdatePrices() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then((r) => r.data),
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const minutes = settings?.price_update_interval ?? 0

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (minutes > 0) {
      intervalRef.current = setInterval(() => {
        assetsApi.updatePrices().then(() => {
          queryClient.invalidateQueries({ queryKey: ['portfolio'] })
          queryClient.invalidateQueries({ queryKey: ['assets-all'] })
        })
      }, minutes * 60 * 1000)
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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/cartera" element={<CarteraPage />} />
            <Route path="/activos" element={<ActivosPage />} />
            <Route path="/activos/:id" element={<ActivoDetailPage />} />
            <Route path="/cuentas" element={<CuentasPage />} />
            <Route path="/operaciones" element={<OperacionesPage />} />
            <Route path="/dividendos" element={<DividendosPage />} />
            <Route path="/intereses" element={<InteresesPage />} />
            <Route path="/fiscal" element={<FiscalPage />} />
            <Route path="/importar" element={<ImportarPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
