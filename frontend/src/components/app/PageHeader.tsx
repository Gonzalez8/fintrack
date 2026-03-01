interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground font-mono tracking-wide">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
