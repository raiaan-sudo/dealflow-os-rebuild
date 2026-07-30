"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { requestConfirmedServerSignOut } from "@/lib/auth/client-sign-out";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { href, t } = useProductI18n();

  async function handleClick() {
    setIsPending(true);
    setError(null);

    await fetch("/api/workspaces/active", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => null);

    const signOutConfirmed = await requestConfirmedServerSignOut();
    if (!signOutConfirmed) {
      setError(t("auth.signOutFailed"));
      setIsPending(false);
      return;
    }

    window.localStorage.removeItem("dealflow-onboarding-progress-v2");
    router.replace(href("/login"));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button disabled={isPending} onClick={handleClick} size="sm" variant="secondary">
        <LogOut className="size-4" />
        {isPending ? t("common.pleaseWait") : t("auth.signOut")}
      </Button>
      {error ? (
        <p
          aria-live="assertive"
          className="max-w-64 text-right text-xs text-rose-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
