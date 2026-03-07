import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric string or number as money (European style).
 * E.g. 12345.67 → "12.345,67 €"
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = "EUR",
): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format percentage.
 */
export function formatPct(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

/**
 * Return CSS class for positive/negative money values.
 */
export function moneyColor(value: string | number | null | undefined): string {
  if (value == null) return "text-muted-foreground";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num > 0) return "text-green-500";
  if (num < 0) return "text-red-500";
  return "text-muted-foreground";
}
