import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedDataDeletionPage } from "@/components/legal/localized-data-deletion-page";
import { isProductLocale } from "@/lib/i18n/config";
import { LEGAL_COPY } from "@/lib/i18n/legal-copy";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  if (!isProductLocale(locale)) return {};
  const copy = LEGAL_COPY[locale].deletion;
  return { title: copy.title, description: copy.description };
}

export default async function DataDeletionPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isProductLocale(locale)) notFound();
  return <LocalizedDataDeletionPage locale={locale} searchParams={searchParams} />;
}
