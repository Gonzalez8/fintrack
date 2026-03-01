import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MonthlySavingsComment } from '@/types'

// ─── Month label ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function fmtMonth(m: string): string {
  const [year, month] = m.split('-')
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Mobile detection (SSR-safe) ─────────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// ─── Comment list ─────────────────────────────────────────────────────────────

function CommentList({ comments }: { comments: MonthlySavingsComment[] }) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No hay comentarios para este mes.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {comments.map((c, i) => (
        <div
          key={i}
          className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-1"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {c.account_name}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
              {fmtDate(c.date)}
            </span>
          </div>
          <p className="text-sm text-foreground leading-snug">{c.note}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string | null         // YYYY-MM
  comments: MonthlySavingsComment[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommentsDrawer({ open, onOpenChange, month, comments }: Props) {
  const isMobile = useIsMobile()
  const title = month ? fmtMonth(month) : ''
  const subtitle = `${comments.length} ${comments.length === 1 ? 'comentario' : 'comentarios'}`

  const body = (
    <div className="mt-1">
      <p className="font-mono text-[10px] text-muted-foreground mb-4">{subtitle}</p>
      <CommentList comments={comments} />
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto px-4 pb-8 pt-4">
          <SheetHeader className="mb-2">
            <SheetTitle className="font-mono text-base text-left">{title}</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
