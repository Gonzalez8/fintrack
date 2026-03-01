import type { MonthlySavingsPoint } from '@/types'

export type Range = '3M' | '6M' | '1A' | '2A' | 'MAX'

export const RANGES: { key: Range; label: string }[] = [
  { key: '3M',  label: '3M' },
  { key: '6M',  label: '6M' },
  { key: '1A',  label: '1A' },
  { key: '2A',  label: '2A' },
  { key: 'MAX', label: 'MAX' },
]

export const RANGE_LABELS: Record<Range, string> = {
  '3M':  'últimos 3 meses',
  '6M':  'últimos 6 meses',
  '1A':  'último año',
  '2A':  'últimos 2 años',
  'MAX': 'historial completo',
}

export function filterByRange(months: MonthlySavingsPoint[], range: Range): MonthlySavingsPoint[] {
  if (range === 'MAX' || !months.length) return months
  const now = new Date()
  const cutoff = new Date(now)
  if      (range === '3M') cutoff.setMonth(now.getMonth() - 3)
  else if (range === '6M') cutoff.setMonth(now.getMonth() - 6)
  else if (range === '1A') cutoff.setFullYear(now.getFullYear() - 1)
  else if (range === '2A') cutoff.setFullYear(now.getFullYear() - 2)
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
  return months.filter(m => m.month >= cutoffKey)
}
