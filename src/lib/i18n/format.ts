import { getProductIntlLocale, type ProductLocale } from "@/lib/i18n/config";

export function formatLocalizedNumber(
  value: number,
  locale: ProductLocale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getProductIntlLocale(locale), options).format(value);
}

export function formatLocalizedCurrency(
  value: number,
  locale: ProductLocale,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">,
) {
  return new Intl.NumberFormat(getProductIntlLocale(locale), {
    style: "currency",
    currency,
    ...options,
  }).format(value);
}

export function formatLocalizedPercent(
  value: number,
  locale: ProductLocale,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(getProductIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
    ...options,
  }).format(value / 100);
}

export function formatLocalizedDate(
  value: string | Date,
  locale: ProductLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getProductIntlLocale(locale), {
    dateStyle: "medium",
    ...options,
  }).format(new Date(value));
}

export function formatLocalizedDateTime(
  value: string | Date,
  locale: ProductLocale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getProductIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}
