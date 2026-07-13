export const PRODUCT_LOCALES = ["en", "fr", "es"] as const;

export type ProductLocale = (typeof PRODUCT_LOCALES)[number];

export const DEFAULT_PRODUCT_LOCALE: ProductLocale = "en";

export const PRODUCT_LOCALE_DETAILS: Record<
  ProductLocale,
  { label: string; nativeLabel: string; intlLocale: string; openGraphLocale: string }
> = {
  en: {
    label: "English",
    nativeLabel: "English",
    intlLocale: "en-CA",
    openGraphLocale: "en_CA",
  },
  fr: {
    label: "French",
    nativeLabel: "Français",
    intlLocale: "fr-CA",
    openGraphLocale: "fr_CA",
  },
  es: {
    label: "Spanish",
    nativeLabel: "Español",
    intlLocale: "es-ES",
    openGraphLocale: "es_ES",
  },
};

export function isProductLocale(value: unknown): value is ProductLocale {
  return (
    typeof value === "string" &&
    PRODUCT_LOCALES.includes(value.toLowerCase() as ProductLocale)
  );
}

export function normalizeProductLocale(value: unknown): ProductLocale {
  if (!isProductLocale(value)) return DEFAULT_PRODUCT_LOCALE;
  return value.toLowerCase() as ProductLocale;
}

export function getProductIntlLocale(locale: unknown) {
  return PRODUCT_LOCALE_DETAILS[normalizeProductLocale(locale)].intlLocale;
}

export function getProductOpenGraphLocale(locale: unknown) {
  return PRODUCT_LOCALE_DETAILS[normalizeProductLocale(locale)].openGraphLocale;
}
