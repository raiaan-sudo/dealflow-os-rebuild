"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_PRODUCT_LOCALE,
  normalizeProductLocale,
  type ProductLocale,
} from "@/lib/i18n/config";
import {
  translateProductMessage,
  type ProductMessageKey,
  type ProductMessageValues,
} from "@/lib/i18n/messages";
import { localizeProductHref } from "@/lib/i18n/routing";
import {
  formatLocalizedCurrency,
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  formatLocalizedPercent,
} from "@/lib/i18n/format";

const ProductLocaleContext = createContext<ProductLocale>(DEFAULT_PRODUCT_LOCALE);

export function ProductLocaleProvider({
  locale,
  children,
}: {
  locale: unknown;
  children: ReactNode;
}) {
  const normalizedLocale = normalizeProductLocale(locale);
  return (
    <ProductLocaleContext.Provider value={normalizedLocale}>
      {children}
    </ProductLocaleContext.Provider>
  );
}

export function useProductLocale() {
  return useContext(ProductLocaleContext);
}

export function useProductI18n() {
  const locale = useProductLocale();

  return useMemo(
    () => ({
      locale,
      t: (key: ProductMessageKey, values?: ProductMessageValues) =>
        translateProductMessage(locale, key, values),
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
    }),
    [locale],
  );
}
