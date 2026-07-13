import "server-only";

import { headers } from "next/headers";
import { translateProductMessage } from "@/lib/i18n/messages";
import { localizeProductHref, parseProductLocalePathname } from "@/lib/i18n/routing";
import { formatLocalizedCurrency, formatLocalizedDate, formatLocalizedDateTime, formatLocalizedNumber, formatLocalizedPercent } from "@/lib/i18n/format";

export async function getRequestProductI18n() {
  const requestHeaders = await headers();
  const locale = parseProductLocalePathname(
    requestHeaders.get("x-pathname") ?? "/",
  ).locale;

  return {
    locale,
    t: (
      key: Parameters<typeof translateProductMessage>[1],
      values?: Parameters<typeof translateProductMessage>[2],
    ) => translateProductMessage(locale, key, values),
    href: (value: string) => localizeProductHref(value, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      formatLocalizedNumber(value, locale, options),
    currency: (
      value: number,
      currency: string,
      options?: Omit<Intl.NumberFormatOptions, "style" | "currency">,
    ) => formatLocalizedCurrency(value, locale, currency, options),
    percent: (value: number, options?: Intl.NumberFormatOptions) =>
      formatLocalizedPercent(value, locale, options),
    date: (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
      formatLocalizedDate(value, locale, options),
    dateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
      formatLocalizedDateTime(value, locale, options),
  };
}
