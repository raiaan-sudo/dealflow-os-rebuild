"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type CancellationResponse = {
  status?: string;
  providerMutationPerformed?: boolean;
  error?: string;
};

export function MetaActivationCancelButton({
  campaignId,
  authorizationId,
}: {
  campaignId: string;
  authorizationId: string;
}) {
  const router = useRouter();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [state, setState] = useState<"idle" | "submitting" | "cancelled" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function cancelActivation() {
    if (state === "submitting") return;

    setState("submitting");
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/meta-activation`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authorizationId,
            confirmation: "CANCEL_META_CAMPAIGN_ACTIVATION",
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as CancellationResponse | null;

      if (
        !response.ok ||
        result?.status !== "cancelled" ||
        result.providerMutationPerformed !== false
      ) {
        throw new Error(result?.error || "The activation authorization could not be cancelled.");
      }

      setState("cancelled");
      setConfirmationOpen(false);
      router.refresh();
    } catch (caughtError) {
      setState("error");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The activation authorization could not be cancelled.",
      );
    }
  }

  if (state === "cancelled") {
    return (
      <p className="text-sm text-emerald-300" role="status">
        Activation authorization cancelled. No Meta request was sent.
      </p>
    );
  }

  if (!confirmationOpen) {
    return (
      <Button
        className="border-rose-400/25 text-rose-200 hover:border-rose-300/40 hover:bg-rose-400/10 hover:text-rose-100"
        onClick={() => {
          setConfirmationOpen(true);
          setError(null);
          setState("idle");
        }}
        type="button"
        variant="secondary"
      >
        Cancel activation authorization
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4">
      <p className="text-sm leading-6 text-rose-100">
        Confirm cancellation to prevent this scheduled authorization from activating the approved
        Meta campaign. This action does not contact Meta.
      </p>
      {error ? (
        <p aria-live="assertive" className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={state === "submitting"}
          onClick={() => void cancelActivation()}
          type="button"
          className="bg-rose-500 text-white shadow-none hover:bg-rose-400 hover:brightness-100 hover:shadow-none"
        >
          {state === "submitting" ? (
            <>
              <Spinner className="mr-2 size-4" />
              Cancelling...
            </>
          ) : (
            "Confirm cancellation"
          )}
        </Button>
        <Button
          disabled={state === "submitting"}
          onClick={() => {
            setConfirmationOpen(false);
            setError(null);
            setState("idle");
          }}
          type="button"
          variant="secondary"
        >
          Keep authorization
        </Button>
      </div>
    </div>
  );
}
