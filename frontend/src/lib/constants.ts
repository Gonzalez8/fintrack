export const DJANGO_INTERNAL_URL =
  process.env.DJANGO_INTERNAL_URL || "http://backend:8000";

export const NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const COOKIE_ACCESS = "access_token";
export const COOKIE_REFRESH = "refresh_token";
export const COOKIE_LANG = "fintrack_lang";

export const DEFAULT_LOCALE = "es";
export const SUPPORTED_LOCALES = ["es", "en", "de", "fr", "it"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const ASSET_TYPE_BADGE_COLORS: Record<string, string> = {
  STOCK: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  ETF: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FUND: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  CRYPTO: "bg-orange-500/10 text-orange-500 dark:text-orange-400",
};

export const ACCOUNT_TYPE_BADGE_COLORS: Record<string, string> = {
  OPERATIVA: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  AHORRO: "bg-green-500/10 text-green-600 dark:text-green-400",
  INVERSION: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  DEPOSITOS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ALTERNATIVOS: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  STOCK: "Acciones",
  ETF: "ETFs",
  FUND: "Fondos",
  CRYPTO: "Cripto",
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  OPERATIVA: "Operativa",
  AHORRO: "Ahorro",
  INVERSION: "Inversion",
  DEPOSITOS: "Depositos",
  ALTERNATIVOS: "Alternativos",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  BUY: "Compra",
  SELL: "Venta",
  GIFT: "Regalo",
};
