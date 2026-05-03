/**
 * Country-related helpers for the fiscal-residence dropdown.
 *
 * Pure utilities — no React, no adapter knowledge. The list of *supported*
 * countries (ones that have a tax-declaration adapter) lives next to the
 * adapter registry at
 * ``app/(dashboard)/tax/adapters/index.ts``.
 */

/**
 * Curated list of countries shown in the Settings dropdown. Localized names
 * come from ``Intl.DisplayNames`` at render time, so we don't have to ship
 * one i18n key per country per locale.
 */
export const TAX_COUNTRY_OPTIONS: readonly string[] = [
  "ES",
  "AD",
  "AR",
  "AT",
  "BE",
  "BR",
  "CA",
  "CH",
  "CL",
  "CO",
  "DE",
  "DK",
  "FI",
  "FR",
  "GB",
  "IE",
  "IT",
  "LU",
  "MX",
  "NL",
  "NO",
  "PE",
  "PL",
  "PT",
  "SE",
  "US",
];

/**
 * Resolve a localized country name. Falls back to the ISO code if the locale
 * or runtime does not support `Intl.DisplayNames`.
 */
export function localizedCountryName(code: string, locale: string): string {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}
