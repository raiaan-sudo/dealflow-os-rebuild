"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type PolicyStatus = {
  authorizationId: string;
  status: "active" | "revoked" | "operator_required";
  approvedCurrency: "USD" | "CAD";
  currentDailyBudgetMinor: number;
  customerDailyBudgetCeilingMinor: number;
  executionEnabled: boolean;
  killSwitchActive: boolean;
  runtimeExecutionEnabled: boolean;
  customerAuthorizedAt: string;
};

type PolicyResponse = {
  authorization?: PolicyStatus | null;
  error?: string;
};

export function MetaOptimizationPolicyControl({ campaignId }: { campaignId: string }) {
  const [policy, setPolicy] = useState<PolicyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<"enable" | "disable" | null>(null);
  const [ceiling, setCeiling] = useState(50);
  const [currency, setCurrency] = useState<"USD" | "CAD">("CAD");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/optimization-policy`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as PolicyResponse | null;
      if (!response.ok) throw new Error(result?.error || "Optimization status is unavailable.");
      setPolicy(result?.authorization ?? null);
      if (result?.authorization) {
        setCeiling(result.authorization.customerDailyBudgetCeilingMinor / 100);
        setCurrency(result.authorization.approvedCurrency);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Optimization status is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enable() {
    if (submitting || !Number.isFinite(ceiling) || ceiling < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/optimization-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerDailyBudgetCeilingMinor: Math.round(ceiling * 100),
          approvedCurrency: currency,
          confirmation: "ENABLE_AUTONOMOUS_META_OPTIMIZATION",
        }),
      });
      const result = (await response.json().catch(() => null)) as PolicyResponse | null;
      if (!response.ok) throw new Error(result?.error || "Optimization authorization was rejected.");
      setConfirming(null);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Optimization authorization was rejected.");
    } finally {
      setSubmitting(false);
    }
  }

  async function disable() {
    if (submitting || !policy?.authorizationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/optimization-policy`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationId: policy.authorizationId,
          confirmation: "DISABLE_AUTONOMOUS_META_OPTIMIZATION",
        }),
      });
      const result = (await response.json().catch(() => null)) as PolicyResponse | null;
      if (!response.ok) throw new Error(result?.error || "Optimization could not be disabled.");
      setConfirming(null);
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Optimization could not be disabled.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasActiveAuthorization = policy?.status === "active";
  const customerExecutionAllowed =
    hasActiveAuthorization && policy.executionEnabled && !policy.killSwitchActive;
  const active = customerExecutionAllowed && policy.runtimeExecutionEnabled;

  return (
    <div className="mt-5 rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Autonomous Meta optimization</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {active
              ? `Enabled for the single launched campaign, capped at ${policy.approvedCurrency} $${(policy.customerDailyBudgetCeilingMinor / 100).toFixed(2)} per day.`
              : hasActiveAuthorization
                ? policy.killSwitchActive
                  ? `Your ${policy.approvedCurrency} $${(policy.customerDailyBudgetCeilingMinor / 100).toFixed(2)} daily ceiling remains authorized, but a safety switch has paused execution.`
                  : policy.executionEnabled
                    ? `Your ${policy.approvedCurrency} $${(policy.customerDailyBudgetCeilingMinor / 100).toFixed(2)} daily ceiling is authorized. System execution is safely paused until the protected runtime gate is opened.`
                    : `Your ${policy.approvedCurrency} $${(policy.customerDailyBudgetCeilingMinor / 100).toFixed(2)} daily ceiling remains authorized, but campaign execution is safely paused.`
              : "Shadow recommendations only. DealFlow cannot change Meta delivery until you explicitly enable a hard daily ceiling."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>
          {loading ? "Checking" : active ? "Running" : hasActiveAuthorization ? "Authorized · paused" : "Shadow only"}
        </span>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p> : null}

      {!loading && !hasActiveAuthorization && confirming !== "enable" ? (
        <Button className="mt-4" onClick={() => setConfirming("enable")} type="button" variant="secondary">
          Set optimization limit
        </Button>
      ) : null}

      {confirming === "enable" ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
          <p className="text-sm leading-6 text-amber-100">
            DealFlow may pause this one campaign or increase its one ad-set budget by at most 20% per 24 hours after minimum-data and cooldown checks. It can never exceed this daily ceiling.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Currency
              <select className="mt-2 block h-11 rounded-xl border border-white/10 bg-background px-3 text-sm text-foreground" value={currency} onChange={(event) => setCurrency(event.target.value as "USD" | "CAD")}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Maximum daily budget
              <input className="mt-2 block h-11 w-48 rounded-xl border border-white/10 bg-background px-3 text-sm text-foreground" min="1" step="0.01" type="number" value={ceiling} onChange={(event) => setCeiling(Number(event.target.value))} />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={submitting} onClick={() => void enable()} type="button">
              {submitting ? <><Spinner className="mr-2 size-4" />Authorizing...</> : "Confirm autonomous optimization"}
            </Button>
            <Button disabled={submitting} onClick={() => setConfirming(null)} type="button" variant="secondary">Keep shadow only</Button>
          </div>
        </div>
      ) : null}

      {hasActiveAuthorization && confirming !== "disable" ? (
        <Button className="mt-4" onClick={() => setConfirming("disable")} type="button" variant="secondary">Disable autonomous optimization</Button>
      ) : null}
      {confirming === "disable" ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4">
          <p className="text-sm text-rose-100">Disable future optimization immediately. Any action not yet armed will be cancelled; no Meta request is sent by this confirmation.</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={submitting} onClick={() => void disable()} type="button">{submitting ? <><Spinner className="mr-2 size-4" />Disabling...</> : "Confirm disable"}</Button>
            <Button disabled={submitting} onClick={() => setConfirming(null)} type="button" variant="secondary">Keep enabled</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
