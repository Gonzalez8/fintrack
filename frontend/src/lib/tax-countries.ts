/**
 * Tax-country helpers.
 *
 * - SUPPORTED_TAX_COUNTRIES mirrors the backend constant in
 *   `apps/reports/services.py`. Add an ISO 3166-1 alpha-2 code here only when
 *   a tax-declaration adapter is implemented for that country.
 * - TAX_COUNTRY_OPTIONS is the curated list shown in the Settings dropdown.
 *   Localized country names come from `Intl.DisplayNames` at render time.
 */

export const SUPPORTED_TAX_COUNTRIES: readonly string[] = ["ES"];

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

export function isSupportedTaxCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return SUPPORTED_TAX_COUNTRIES.includes(code.toUpperCase());
}

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
