"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    const supabase = createClient();

    if (!supabase) {
      router.replace("/login");
      router.refresh();
      return;
    }

    setIsPending(true);

    try {
      await supabase.auth.signOut();
    } finally {
      window.localStorage.removeItem("dealflow-onboarding-progress-v2");
      router.replace("/login");
      router.refresh();
      setIsPending(false);
    }
  }

  return (
    <Button disabled={isPending} onClick={handleClick} size="sm" variant="secondary">
      <LogOut className="size-4" />
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
