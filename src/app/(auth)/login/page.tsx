import { redirect } from "next/navigation";

const appLoginUrl = "https://dealflow-os-rebuild.vercel.app/login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = new URLSearchParams();

  if (resolvedSearchParams) {
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (typeof value === "string") {
        query.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
      }
    }
  }

  redirect(query.size > 0 ? `${appLoginUrl}?${query.toString()}` : appLoginUrl);
}
