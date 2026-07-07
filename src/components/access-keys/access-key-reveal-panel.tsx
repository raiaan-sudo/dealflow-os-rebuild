"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound } from "lucide-react";

export function AccessKeyRevealPanel({
  accessKey,
}: {
  accessKey: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(accessKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-df-panel border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
          Access key
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 rounded-df-control border border-white/10 bg-black/30 px-4 py-3 text-sm text-cyan-50 [overflow-wrap:anywhere]">
            {accessKey}
          </code>
          <button
            type="button"
            onClick={copyKey}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-df-control border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:border-cyan-300/35"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <Link
        href="/signup"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-df-control bg-df-primary px-5 text-base font-semibold text-slate-950 shadow-df-button transition hover:-translate-y-0.5"
      >
        <KeyRound className="h-4 w-4" />
        Create account with this key
      </Link>
    </div>
  );
}
