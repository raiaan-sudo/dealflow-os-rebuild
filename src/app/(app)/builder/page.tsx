import { redirect } from "next/navigation";

type BuilderSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: BuilderSearchParams;
}) {
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

  redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
}
