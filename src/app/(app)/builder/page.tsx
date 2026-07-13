import { redirect } from "next/navigation";
import { getRequestProductI18n } from "@/lib/i18n/server";

type BuilderSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: BuilderSearchParams;
}) {
  const { href } = await getRequestProductI18n();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectUrl = new URL("/onboarding", "https://app.local");

  if (resolvedSearchParams) {
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (typeof value === "string") {
        redirectUrl.searchParams.set(key, value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          redirectUrl.searchParams.append(key, item);
        }
      }
    }
  }

  redirect(href(`${redirectUrl.pathname}${redirectUrl.search}`));
}
