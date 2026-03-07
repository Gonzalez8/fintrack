import type { Locale } from "@/lib/constants";

const dictionaries: Record<Locale, () => Promise<Record<string, string>>> = {
  es: () => import("./messages/es.json").then((m) => m.default),
  en: () => import("./messages/en.json").then((m) => m.default),
  de: () => import("./messages/de.json").then((m) => m.default),
  fr: () => import("./messages/fr.json").then((m) => m.default),
  it: () => import("./messages/it.json").then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Record<string, string>> {
  const loader = dictionaries[locale] || dictionaries.es;
  return loader();
}
