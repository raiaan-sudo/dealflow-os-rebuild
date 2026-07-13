import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDocumentLocale } from "@/components/i18n/product-document-locale";
import { ProductLocaleProvider } from "@/components/i18n/product-locale-provider";
import {
  getProductOpenGraphLocale,
  isProductLocale,
  PRODUCT_LOCALES,
} from "@/lib/i18n/config";
import { translateProductMessage } from "@/lib/i18n/messages";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return PRODUCT_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isProductLocale(locale)) return {};

  return {
    title: {
      default: translateProductMessage(locale, "metadata.title"),
      template: `%s | DealFlow OS`,
    },
    description: translateProductMessage(locale, "metadata.description"),
    alternates: {
      languages: {
        en: "/en",
        fr: "/fr",
        es: "/es",
      },
    },
    openGraph: {
      locale: getProductOpenGraphLocale(locale),
      alternateLocale: PRODUCT_LOCALES
        .filter((item) => item !== locale)
        .map((item) => getProductOpenGraphLocale(item)),
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isProductLocale(locale)) notFound();

  return (
    <ProductLocaleProvider locale={locale}>
      <ProductDocumentLocale locale={locale} />
      {children}
    </ProductLocaleProvider>
  );
}
