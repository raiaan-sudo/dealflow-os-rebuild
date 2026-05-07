import "server-only";

import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import { getBillingSummary } from "@/lib/services/billing-service";
import {
  evaluateCampaignEntitlements,
  type BillingLifecycleState,
} from "@/lib/services/campaign-entitlements";

export const BILLING_CANCELLATION_REASON_CODES = [
  "too_expensive",
  "not_enough_leads",
  "campaign_paused",
  "missing_features",
  "switched_provider",
  "temporary_pause",
  "other",
  "not_provided",
] as const;

export type BillingCancellationReasonCode = (typeof BILLING_CANCELLATION_REASON_CODES)[number];

// Stripe remains the payment source of truth. This service records local intent
// and operator visibility only; it never cancels, updates, or charges a subscription.

type BillingCancellationIntentRow = {
  id: string;
  organization_id: string;
  stripe_subscription_id: string | null;
  plan_tier: string | null;
  subscription_status: string | null;
  billing_state: string | null;
  reason_code: BillingCancellationReasonCode;
  reason_detail: string | null;
  source: string | null;
  created_at: string | null;
};

type BillingSubscriptionRecoveryRow = {
  organization_id: string;
  plan_tier: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type BillingRecoveryIssue = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  status: "open" | "monitoring" | "resolved";
  createdAt: string | null;
  route: string | null;
  rawReference: string;
};

const REASON_LABELS: Record<BillingCancellationReasonCode, string> = {
  too_expensive: "too expensive",
  not_enough_leads: "not enough lead volume yet",
  campaign_paused: "campaign paused or no longer needed",
  missing_features: "missing features",
  switched_provider: "switched provider",
  temporary_pause: "temporary pause",
  other: "other reason",
  not_provided: "not provided",
};

function isMissingIntentTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /relation .*billing_cancellation_intents.* does not exist/i.test(error.message ?? "");
}

function normalizeReasonCode(value: string | null | undefined): BillingCancellationReasonCode {
  return BILLING_CANCELLATION_REASON_CODES.includes(value as BillingCancellationReasonCode)
    ? (value as BillingCancellationReasonCode)
    : "not_provided";
}

function sanitizeReasonDetail(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 500);
}

function formatPeriodEnd(value: string | null) {
  if (!value) {
    return "the current paid period";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "the current paid period";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function recordBillingCancellationIntent(params: {
  reasonCode?: string | null;
  reasonDetail?: string | null;
  source?: string | null;
}) {
  const [context, billing] = await Promise.all([
    getAppContext(),
    getBillingSummary(),
  ]);
  const admin = createAdminClient();

  if (!context || !admin) {
    return { recorded: false, skipped: "service_role_missing" as const };
  }

  const reasonCode = normalizeReasonCode(params.reasonCode);
  const reasonDetail = sanitizeReasonDetail(params.reasonDetail);
  const source = params.source?.trim() || "settings_portal_entry";

  const { error } = await (admin as any)
    .from("billing_cancellation_intents")
    .insert({
      organization_id: context.organization.id,
      user_id: context.user.id,
      stripe_customer_id: billing.stripeCustomerId,
      stripe_subscription_id: billing.stripeSubscriptionId,
      plan_tier: billing.planTier,
      subscription_status: billing.subscriptionStatus,
      billing_state: billing.billingState,
      reason_code: reasonCode,
      reason_detail: reasonDetail,
      source,
    });

  if (error) {
    if (isMissingIntentTable(error)) {
      return { recorded: false, skipped: "intent_table_missing" as const };
    }

    logWarn("billing_cancellation_intent_record_failed", {
      organizationId: context.organization.id,
      reasonCode,
      source,
      message: error.message,
    });
    return { recorded: false, skipped: "write_failed" as const };
  }

  return { recorded: true, skipped: null };
}

async function loadLatestCancellationIntents(
  organizationIds: string[],
): Promise<Map<string, BillingCancellationIntentRow>> {
  const admin = createAdminClient();
  const latestByOrganization = new Map<string, BillingCancellationIntentRow>();

  if (!admin || organizationIds.length === 0) {
    return latestByOrganization;
  }

  const { data, error } = await (admin as any)
    .from("billing_cancellation_intents")
    .select("id,organization_id,stripe_subscription_id,plan_tier,subscription_status,billing_state,reason_code,reason_detail,source,created_at")
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(organizationIds.length * 3, 50));

  if (error) {
    if (!isMissingIntentTable(error)) {
      logWarn("billing_cancellation_intent_issue_lookup_failed", {
        message: error.message,
      });
    }
    return latestByOrganization;
  }

  for (const row of (data ?? []) as BillingCancellationIntentRow[]) {
    if (!latestByOrganization.has(row.organization_id)) {
      latestByOrganization.set(row.organization_id, row);
    }
  }

  return latestByOrganization;
}

function buildReasonDetail(intent: BillingCancellationIntentRow | null) {
  if (!intent) {
    return "No local cancellation reason has been captured yet.";
  }

  const reasonCode = normalizeReasonCode(intent.reason_code);
  const detail = sanitizeReasonDetail(intent.reason_detail);

  return detail
    ? `Latest local cancellation reason: ${REASON_LABELS[reasonCode]} - ${detail}`
    : `Latest local cancellation reason: ${REASON_LABELS[reasonCode]}.`;
}

function buildRecoveryIssue(params: {
  row: BillingSubscriptionRecoveryRow;
  billingState: BillingLifecycleState;
  requiresSuspension: boolean;
  reason: string | null;
}): BillingRecoveryIssue | null {
  const { row, billingState, requiresSuspension, reason } = params;
  const reference = row.organization_id;
  const status = row.status ?? "inactive";
  const periodEnd = formatPeriodEnd(row.current_period_end);
  const route = "/admin/command-center";

  if (billingState === "payment_issue") {
    return {
      id: `billing_recovery:payment_issue:${reference}`,
      severity: "high" as const,
      title: "Payment issue needs recovery",
      detail: `Stripe reports ${status}. New launches are blocked while existing funnel/alert operations remain in warning mode. Send the customer to the Stripe Portal and monitor recovery before ${periodEnd}. ${reason ?? ""}`.trim(),
      status: "open" as const,
      createdAt: row.updated_at ?? row.created_at,
      route,
      rawReference: reference,
    };
  }

  if (row.cancel_at_period_end && billingState === "grace_period") {
    return {
      id: `billing_recovery:cancel_at_period_end:${reference}`,
      severity: "medium" as const,
      title: "Subscription scheduled to cancel",
      detail: `Access remains active until ${periodEnd}. Capture the reason, confirm expectations, and try to save the account without blocking Stripe Portal cancellation. ${reason ?? ""}`.trim(),
      status: "monitoring" as const,
      createdAt: row.updated_at ?? row.created_at,
      route,
      rawReference: reference,
    };
  }

  if (requiresSuspension) {
    return {
      id: `billing_recovery:suspended:${reference}`,
      severity: "high" as const,
      title: "Subscription ended; infrastructure suspended",
      detail: `Stripe reports ${status}. DealFlow-managed launch, funnel capture, alerts, and autonomy should remain suspended until billing is reactivated. ${reason ?? ""}`.trim(),
      status: "open" as const,
      createdAt: row.updated_at ?? row.created_at,
      route,
      rawReference: reference,
    };
  }

  return null;
}

export async function loadBillingRecoveryIssues(limit = 80): Promise<BillingRecoveryIssue[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("organization_id,plan_tier,status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,updated_at,created_at")
    .or("status.in.(past_due,incomplete,unpaid,canceled,cancelled,incomplete_expired,paused),cancel_at_period_end.eq.true")
    .order("updated_at", { ascending: false })
    .limit(limit * 2);

  if (error) {
    logWarn("billing_recovery_issue_lookup_failed", {
      message: error.message,
    });
    return [];
  }

  const rows = ((data ?? []) as BillingSubscriptionRecoveryRow[]).filter((row) => row.organization_id);
  const latestIntents = await loadLatestCancellationIntents(rows.map((row) => row.organization_id));

  return rows
    .map((row) => {
      const entitlements = evaluateCampaignEntitlements({
        row: {
          plan_tier: row.plan_tier,
          status: row.status ?? "inactive",
          current_period_end: row.current_period_end,
          cancel_at_period_end: row.cancel_at_period_end ?? false,
        },
      });
      const intent = latestIntents.get(row.organization_id) ?? null;

      return buildRecoveryIssue({
        row,
        billingState: entitlements.billingState,
        requiresSuspension: entitlements.requiresSuspension,
        reason: buildReasonDetail(intent),
      });
    })
    .filter((issue): issue is BillingRecoveryIssue => Boolean(issue))
    .slice(0, limit);
}
