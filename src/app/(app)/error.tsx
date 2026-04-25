"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AppErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppErrorPage({ error, reset }: AppErrorPageProps) {
  const rawMessage = typeof error?.message === "string" ? error.message.trim() : "";
  const normalizedMessage =
    rawMessage &&
    !/^internal server error$/i.test(rawMessage) &&
    !/^failed to fetch$/i.test(rawMessage)
      ? rawMessage
      : "This page hit an unexpected application error. Retry the page, and if it happens again, check the failing route or server logs.";

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="max-w-2xl p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/90">
          App Error
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
          This page failed to load correctly.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
          The app hit a real runtime failure. Retry the page first. If it happens again, use the message below to trace the failing route or backend step instead of assuming it is a workspace sync issue.
        </p>
        <div className="mt-6 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            Failure Message
          </p>
          <p className="mt-3 text-sm leading-7 text-white/85">
            {normalizedMessage}
          </p>
          {error?.digest ? (
            <p className="mt-3 text-xs text-white/50">
              Error digest: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-start">
          <Button onClick={reset}>Retry page</Button>
        </div>
      </Card>
    </div>
  );
}
