"use client";

import { useState, useTransition } from "react";

type RetryResult = {
  success?: boolean;
  result?: {
    crmSyncResult?: unknown;
    contactWritesEnabled?: boolean;
    opportunityWritesEnabled?: boolean;
    provisioning?: boolean;
    workflowEnrollment?: boolean;
  };
  error?: string;
  code?: string;
};

export function CrmRetryButton({
  leadId,
  requiresDeadLetterConfirmation,
}: {
  leadId: string;
  requiresDeadLetterConfirmation: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="inline-flex min-h-9 items-center rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/16 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        type="button"
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            try {
              const response = await fetch("/api/admin/fulfillment-monitor/crm-retry", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  leadId,
                  confirmation: "RETRY_CRM_SYNC",
                  allowDeadLetter: requiresDeadLetterConfirmation,
                }),
              });
              const payload = (await response.json()) as RetryResult;
              const crmResult = payload.result?.crmSyncResult as Record<string, unknown> | undefined;
              const reason = typeof crmResult?.reason === "string" ? crmResult.reason : payload.code ?? "unknown";
              setResult(response.ok ? `CRM retry returned ${reason}` : `Retry blocked: ${payload.code ?? payload.error ?? response.status}`);
            } catch (error) {
              setResult(error instanceof Error ? error.message : "Retry failed");
            }
          });
        }}
      >
        {isPending ? "Retrying CRM..." : requiresDeadLetterConfirmation ? "Retry dead-letter CRM" : "Retry CRM"}
      </button>
      {result ? <p className="max-w-[260px] text-xs text-cyan-100/70">{result}</p> : null}
    </div>
  );
}
