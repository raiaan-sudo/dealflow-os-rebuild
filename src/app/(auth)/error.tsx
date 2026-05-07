"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reportClientError } from "@/components/telemetry/client-error-listener";

type AuthErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AuthErrorPage({ error, reset }: AuthErrorPageProps) {
  useEffect(() => {
    reportClientError({
      source: "auth_error_boundary",
      errorName: error?.name ?? "AuthError",
      message: error?.message ?? "Auth route failed to render.",
      stack: error?.stack,
      severity: "high",
      metadata: {
        digestPresent: Boolean(error?.digest),
      },
    });
  }, [error]);

  return (
    <main className="premium-grid flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="max-w-lg p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
          Authentication issue
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
          The sign-in experience hit an unexpected error.
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Retry the request. If the issue continues, verify your Supabase environment values and auth configuration.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={reset}>Retry</Button>
        </div>
      </Card>
    </main>
  );
}
