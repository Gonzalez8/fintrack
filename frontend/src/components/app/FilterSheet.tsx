import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose,
} from '@/components/ui/sheet'

interface Props {
  /** Número de filtros activos — muestra badge si > 0 */
  activeCount: number
  onReset: () => void
  children: React.ReactNode
}

/**
 * En mobile (<md): botón "Filtros" que abre un bottom Sheet.
 * En desktop (≥md): los children se renderizan inline sin Sheet.
 */
export function FilterSheet({ activeCount, onReset, children }: Props) {
  const { t } = useTranslation()

  return (
    <>
      {/* ── Mobile: botón + Sheet ── */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative h-9">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {t('common.filter')}
              {activeCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1.5 -top-1.5 h-4 w-4 p-0
                             flex items-center justify-center text-[10px] rounded-full"
                >
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>

          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="mb-4">
              <div className="flex items-center justify-between pr-6">
                <SheetTitle className="text-base">{t('common.filter')}</SheetTitle>
                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={onReset}
                  >
                    {t('common.clearFilters')} ({activeCount})
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-3 pb-2">
              {children}
            </div>

            <SheetClose asChild>
              <Button className="mt-4 w-full" size="sm">
                {t('common.applyFilters')}
              </Button>
            </SheetClose>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Desktop: inline ── */}
      <div className="hidden md:flex flex-wrap gap-2">
        {children}
      </div>
    </>
  )
}
