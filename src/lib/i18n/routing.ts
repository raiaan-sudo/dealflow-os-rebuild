import {
  DEFAULT_PRODUCT_LOCALE,
  isProductLocale,
  type ProductLocale,
} from "@/lib/i18n/config";

const NON_LOCALIZED_PREFIXES = [
  "/api",
  "/f/",
  "/ghl/",
  "/_next/",
] as const;

export type ProductLocalePath = {
  locale: ProductLocale;
  pathname: string;
  hadLocalePrefix: boolean;
};

export function parseProductLocalePathname(pathname: string): ProductLocalePath {
  const safePathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const [, candidate, ...remaining] = safePathname.split("/");

  if (!isProductLocale(candidate)) {
    return {
      locale: DEFAULT_PRODUCT_LOCALE,
      pathname: safePathname,
      hadLocalePrefix: false,
    };
  }

  return {
    locale: candidate,
    pathname: remaining.length > 0 ? `/${remaining.join("/")}` : "/",
    hadLocalePrefix: true,
  };
}

export function localizeProductHref(href: string, locale: ProductLocale) {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    NON_LOCALIZED_PREFIXES.some((prefix) => href === prefix || href.startsWith(prefix))
  ) {
    return href;
  }

  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const suffixIndex = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const pathname = suffixIndex === undefined ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === undefined ? "" : href.slice(suffixIndex);
  const parsed = parseProductLocalePathname(pathname);
  const normalizedPathname = parsed.pathname === "/" ? "" : parsed.pathname;

  return `/${locale}${normalizedPathname}${suffix}`;
}

export function replaceProductLocaleInPathname(
  pathname: string,
  locale: ProductLocale,
) {
  const parsed = parseProductLocalePathname(pathname);
  return localizeProductHref(parsed.pathname, locale);
}
