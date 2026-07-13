import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedLegalPage } from "@/components/legal/localized-legal-page";
import { isProductLocale } from "@/lib/i18n/config";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isProductLocale(locale)) return {};
  const copy = LEGAL_COPY[locale].terms;
  return { title: copy.title, description: copy.description };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  if (!isProductLocale(locale)) notFound();
  return <LocalizedLegalPage copy={LEGAL_COPY[locale].terms} contentId="terms-content" />;
}
