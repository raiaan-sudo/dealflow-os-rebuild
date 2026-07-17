"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { href, t } = useProductI18n();

  async function handleClick() {
    const supabase = createClient();

    if (!supabase) {
      router.replace(href("/login"));
      router.refresh();
      return;
    }

    setIsPending(true);

    try {
      await fetch("/api/workspaces/active", {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => null);
      await supabase.auth.signOut();
    } finally {
      window.localStorage.removeItem("dealflow-onboarding-progress-v2");
      router.replace(href("/login"));
      router.refresh();
      setIsPending(false);
    }
  }

  return (
    <Button disabled={isPending} onClick={handleClick} size="sm" variant="secondary">
      <LogOut className="size-4" />
      {isPending ? t("common.pleaseWait") : t("auth.signOut")}
    </Button>
  );
}
