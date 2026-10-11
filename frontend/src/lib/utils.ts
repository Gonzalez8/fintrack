import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isPrivacyMode } from "@/lib/privacy"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MASK = "•••••";

/**
 * Format a numeric string or number as money (European style).
 * E.g. 12345.67 → "12.345,67 €"
 * Returns masked value when privacy mode is active.
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = "EUR",
  isPublic = false,
): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  if (!isPublic && isPrivacyMode()) return MASK;

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
 * Format a quantity (shares, units) respecting up to 6 decimal places.
 * Trailing zeros are trimmed automatically by toLocaleString.
 */
export function formatQty(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return num.toLocaleString("es-ES", { maximumFractionDigits: 6 });
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

/**
 * UI locale as set on <html lang> from the language cookie.
 * Client-only; falls back to "es" during SSR.
 */
export function uiLocale(): string {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang || "es";
}

/**
 * Format a "YYYY-MM" month key as "Month YYYY" in the UI locale,
 * capitalizing only the first letter (e.g. es: "Agosto de 2026").
 */
export function formatMonthYear(month: string, locale = uiLocale()): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const label = new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}
