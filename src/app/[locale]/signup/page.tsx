import { isProductLocale } from "@/lib/i18n/config";
import { notFound, redirect } from "next/navigation";

type LocalizedLegacySignupPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizedLegacySignupPage({
  params,
}: LocalizedLegacySignupPageProps) {
  const { locale } = await params;

  if (!isProductLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}/login?mode=sign-up`);
}
