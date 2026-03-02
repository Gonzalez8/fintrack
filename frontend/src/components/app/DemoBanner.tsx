export function DemoBanner() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null

  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      <span className="font-mono font-semibold uppercase tracking-wider">Modo Demo</span>
      <span className="text-amber-500/50">·</span>
      <span>Datos de ejemplo. Los cambios no se guardan al recargar la página.</span>
    </div>
  )
}
