"use client";

import { createContext, useContext } from "react";

type Dictionary = Record<string, string>;

export const DictionaryContext = createContext<Dictionary>({});

/**
 * Client-side translation hook.
 * Returns a `t(key)` function that looks up keys in the dictionary.
 */
export function useTranslations() {
  const dict = useContext(DictionaryContext);
  return function t(
    key: string,
    params?: string | Record<string, string | number>,
  ): string {
    let value = dict[key] ?? (typeof params === "string" ? params : key);
    if (typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  };
}
