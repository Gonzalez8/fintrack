/**
 * Tax-adapter UI registry.
 *
 * Each country with a tax-declaration assistant ships its own component file
 * (`adapters/{iso2}-*.tsx`) and registers it here. Adding a new country is:
 *
 *   1. Build the component (e.g. `de-steuer-tab.tsx`).
 *   2. Add the entry below.
 *   3. Add the matching `country_code` to the backend registry under
 *      `apps/reports/tax_adapters/__init__.py`.
 *
 * `SUPPORTED_TAX_COUNTRIES` is derived from this map so the Settings UI and
 * the tax page stay in sync automatically.
 */

import type { ComponentType } from "react";

import { EsRentaTab } from "./es-renta-tab";

export interface TaxAdapterTabProps {
  year: string;
}

export const TAX_ADAPTERS: Record<string, ComponentType<TaxAdapterTabProps>> = {
  ES: EsRentaTab,
};

export const SUPPORTED_TAX_COUNTRIES: readonly string[] = Object.keys(TAX_ADAPTERS);

export function getTaxAdapter(
  code: string | null | undefined,
): ComponentType<TaxAdapterTabProps> | null {
  if (!code) return null;
  return TAX_ADAPTERS[code.toUpperCase()] ?? null;
}

export function isSupportedTaxCountry(code: string | null | undefined): boolean {
  return getTaxAdapter(code) !== null;
}
