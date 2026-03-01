import { formatMoney } from '@/lib/utils'

interface MoneyCellProps {
  value: string | null | undefined
  colored?: boolean
}

export function MoneyCell({ value, colored }: MoneyCellProps) {
  if (value == null || value === '') return <span className="text-muted-foreground">-</span>
  const num = parseFloat(value)
  const color = colored
    ? num > 0 ? 'money-positive' : num < 0 ? 'money-negative' : ''
    : ''
  return <span className={color}>{formatMoney(value)}</span>
}
