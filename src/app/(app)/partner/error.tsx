"use client";

import Link from "next/link";

export default function PartnerPortalError() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center">
      <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-6">
        <p className="df-eyebrow">Partner Portal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Partner portal is recovering</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The customer workspace is still available. Partner reporting can be retried without affecting campaign setup.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/partner"
            className="inline-flex h-11 items-center rounded-full border border-primary/20 bg-primary/10 px-5 text-sm font-semibold text-primary"
          >
            Retry partner portal
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-full border border-white/10 px-5 text-sm font-semibold text-foreground"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

