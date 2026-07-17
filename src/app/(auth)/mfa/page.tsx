import type { Metadata } from "next";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const redirectedFrom = typeof resolved?.redirectedFrom === "string"
    ? resolved.redirectedFrom
    : undefined;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] items-center px-5 py-10 sm:px-6">
      <div className="w-full space-y-4">
        <div className="flex justify-end"><LocaleSwitcher compact /></div>
        <MfaChallengeForm redirectedFrom={redirectedFrom} />
      </div>
    </main>
  );
}
