import { redirect } from "next/navigation";
import { isProductLocale } from "@/lib/i18n/config";

export default async function LocalizedHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(isProductLocale(locale) ? `/${locale}/onboarding` : "/onboarding");
}
