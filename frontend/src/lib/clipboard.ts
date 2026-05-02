import { toast } from "sonner";

/**
 * Format a numeric string for Spanish Renta Web input fields:
 *   "1234.56" → "1234,56"
 * No thousand separators, no currency symbol — Renta Web parses raw decimals.
 */
export function formatForRenta(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2).replace(".", ",");
}

/**
 * Copy a single Renta Web field value to the clipboard.
 * `label` is shown in the success toast (e.g. "Ingresos íntegros").
 */
export async function copyRentaValue(
  value: string | number,
  label: string,
  copiedTemplate: string,
): Promise<void> {
  const text = formatForRenta(value);
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copiedTemplate.replace("{label}", label).replace("{value}", text));
  } catch {
    toast.error(copiedTemplate.replace("{label}", label).replace("{value}", text));
  }
}

/**
 * Copy a multi-line block (e.g. the final summary).
 * `text` is the already-formatted clipboard payload.
 */
export async function copyRentaBlock(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(successMessage);
  }
}

/**
 * Copy a single declarable sale row in tab-separated format:
 *   "Entity\tTransmission\tAcquisition"
 * Tab separator is friendly for spreadsheet paste and for HTML form Tab navigation.
 */
export async function copyRentaSaleRow(
  entity: string,
  transmission: string | number,
  acquisition: string | number,
  copiedTemplate: string,
): Promise<void> {
  const text = `${entity}\t${formatForRenta(transmission)}\t${formatForRenta(acquisition)}`;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copiedTemplate.replace("{entity}", entity));
  } catch {
    toast.error(copiedTemplate.replace("{entity}", entity));
  }
}
