import { redirect } from "next/navigation";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const target = new URLSearchParams({ mode: "sign-up" });
  const redirectedFrom =
    typeof params.redirectedFrom === "string" && params.redirectedFrom.startsWith("/")
      ? params.redirectedFrom
      : null;

  if (redirectedFrom) {
    target.set("redirectedFrom", redirectedFrom);
  }

  redirect(`/login?${target.toString()}`);
}
