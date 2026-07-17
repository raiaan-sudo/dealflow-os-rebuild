"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "@/lib/account-deletion/account-deletion-contract";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ACCOUNT_DELETION_COPY,
  getLocalizedAccountDeletionStatus,
} from "@/lib/i18n/account-deletion-copy";

type PublicRequest = {
  confirmationCode: string;
  state: string;
  requestedAt: string;
  scheduledDeletionAt: string | null;
  display: { label: string; detail: string; terminal: boolean };
};

export function AccountDeletionCard() {
  const { href, locale } = useProductI18n();
  const copy = ACCOUNT_DELETION_COPY[locale];
  const [email, setEmail] = useState("");
  const [phrase, setPhrase] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [executionAvailable, setExecutionAvailable] = useState<boolean | null>(null);
  const [supportEmail, setSupportEmail] = useState("support@agentdealflow.io");
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/account-deletion", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (active) setExecutionAvailable(false);
          return;
        }
        const payload = (await response.json()) as {
          request?: PublicRequest | null;
          executionAvailable?: boolean;
          supportEmail?: string;
        };
        if (active && payload.request) setRequest(payload.request);
        if (active) {
          setExecutionAvailable(payload.executionAvailable === true);
          if (payload.supportEmail) setSupportEmail(payload.supportEmail);
        }
      })
      .catch(() => {
        if (active) setExecutionAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      idempotencyKeyRef.current ??= `account-deletion:${crypto.randomUUID()}`;
      const response = await fetch("/api/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          confirmationPhrase: phrase,
          identityMethod: "aal2",
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      const payload = (await response.json()) as {
        request?: PublicRequest;
        error?: string;
      };
      if (!response.ok || !payload.request) {
        throw new Error(copy.scheduleError);
      }
      setRequest(payload.request);
      idempotencyKeyRef.current = null;
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message === copy.scheduleError
          ? copy.scheduleError
          : copy.requestError,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (request) {
    const status = getLocalizedAccountDeletionStatus(locale, request.state);
    return (
      <Card className="border-destructive/30 p-5 sm:p-7">
        <p className="text-xs uppercase tracking-[0.18em] text-destructive">{copy.accountDeletion}</p>
        <h2 className="mt-2 text-xl font-semibold">{status.label}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {status.detail}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {copy.confirmationCode}: <span className="font-mono text-foreground">{request.confirmationCode}</span>
        </p>
        <a
          className="mt-4 inline-flex text-sm font-medium text-primary underline underline-offset-4"
          href={href(`/data-deletion?code=${encodeURIComponent(request.confirmationCode)}`)}
        >
          {copy.openStatus}
        </a>
      </Card>
    );
  }

  if (executionAvailable === false) {
    return (
      <Card className="border-destructive/30 p-5 sm:p-7">
        <p className="text-xs uppercase tracking-[0.18em] text-destructive">{copy.accountDeletion}</p>
        <h2 className="mt-2 text-xl font-semibold">{copy.unavailableTitle}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.unavailableBodyBefore}{" "}
          <a className="text-primary underline underline-offset-4" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>{" "}
          {copy.unavailableBodyAfter}
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/30 p-5 sm:p-7">
      <p className="text-xs uppercase tracking-[0.18em] text-destructive">{copy.dangerZone}</p>
      <h2 className="mt-2 text-xl font-semibold">{copy.deleteTitle}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {copy.deleteBody}
      </p>

      <div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">
          {copy.email}
          <input
            className="h-11 rounded-xl border border-border bg-background px-3 text-foreground"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <p className="rounded-xl border border-border bg-background/50 p-3 text-sm leading-6 text-muted-foreground">
          {copy.recentAal2}
        </p>
        <label className="grid gap-2 text-sm font-medium">
          {copy.typePhrase} <span className="font-mono text-xs">{ACCOUNT_DELETION_CONFIRMATION_PHRASE}</span>
          <input
            className="h-11 rounded-xl border border-border bg-background px-3 text-foreground"
            autoComplete="off"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          {copy.acknowledgement}
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          className="bg-destructive text-destructive-foreground hover:brightness-110"
          disabled={
            submitting ||
            executionAvailable !== true ||
            !accepted ||
            phrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE ||
            !email.includes("@")
          }
          onClick={() => void submit()}
        >
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </Card>
  );
}
