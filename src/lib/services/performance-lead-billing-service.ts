import { ApiError } from "@/lib/api/route";
import {
  PERFORMANCE_LEAD_BILLING_MODEL,
  PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS,
} from "@/lib/billing/plans";
import { getStripeBillingProvider } from "@/lib/integrations/stripe/provider";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const PERFORMANCE_LEAD_BILLING_JOB_KIND = "performance_lead_billing" as const;

type BillingRow = {
  plan_tier?: string | null;
  status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type LeadRow = {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  source?: string | null;
  consent_source?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PerformanceLeadBillingJobPayload = {
  source: "public_lead_capture" | "lead_capture_retry" | string;
  requestId: string;
  leadId: string;
  organizationId: string;
  campaignId: string;
  loadTest?: boolean;
};

function getLedgerIdempotencyKey(params: {
  organizationId: string;
  campaignId: string;
  leadId: string;
}) {
  return `performance_lead_charge:${params.organizationId}:${params.campaignId}:${params.leadId}`;
}

function getBillingMetadata(row: BillingRow | null) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
}

function getDefaultPaymentMethodId(row: BillingRow | null) {
  const metadata = getBillingMetadata(row);
  const paymentMethodId = metadata.stripe_default_payment_method_id;

  return typeof paymentMethodId === "string" && paymentMethodId.trim() ? paymentMethodId.trim() : null;
}

function getNonBillableReason(params: {
  lead: LeadRow | null;
  billing: BillingRow | null;
  payload: PerformanceLeadBillingJobPayload;
}) {
  if (!params.lead) {
    return "lead_missing";
  }

  if (!params.lead.organization_id || params.lead.organization_id !== params.payload.organizationId) {
    return "lead_organization_mismatch";
  }

  if (!params.lead.campaign_id || params.lead.campaign_id !== params.payload.campaignId) {
    return "lead_campaign_mismatch";
  }

  const source = params.lead.source ?? "";
  if (params.payload.loadTest || /load_test|test|internal|admin|import/i.test(source)) {
    return "non_billable_source";
  }

  if (params.lead.consent_source && params.lead.consent_source !== "public_lead_capture_form") {
    return "consent_source_not_billable";
  }

  if (!params.billing) {
    return "billing_missing";
  }

  if (params.billing.plan_tier !== "performance") {
    return "non_performance_plan";
  }

  if (!["active", "trialing"].includes(params.billing.status ?? "")) {
    return "billing_inactive";
  }

  const metadata = getBillingMetadata(params.billing);
  if (
    !params.billing.stripe_customer_id ||
    !params.billing.stripe_subscription_id
  ) {
    return "performance_subscription_metadata_missing";
  }

  if (!getDefaultPaymentMethodId(params.billing)) {
    return "default_payment_method_missing";
  }

  return null;
}

async function upsertSkippedLedger(params: {
  lead: LeadRow | null;
  payload: PerformanceLeadBillingJobPayload;
  reason: string;
  idempotencyKey: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await admin
    .from("lead_billing_events")
    .upsert(
      {
        organization_id: params.payload.organizationId,
        campaign_id: params.payload.campaignId,
        lead_id: params.payload.leadId,
        amount_cents: PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS,
        currency: "usd",
        status: "skipped",
        skip_reason: params.reason,
        idempotency_key: params.idempotencyKey,
        metadata: {
          source: params.payload.source,
          requestId: params.payload.requestId,
          leadSource: params.lead?.source ?? null,
          consentSource: params.lead?.consent_source ?? null,
          billingModel: PERFORMANCE_LEAD_BILLING_MODEL,
        } satisfies Json,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "idempotency_key" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError(500, error?.message ?? "Lead billing event could not be skipped.", "lead_billing_skip_failed");
  }

  return data as Record<string, unknown>;
}

export async function getPerformanceLeadUsageSummary(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: billingRow } = await admin
    .from("billing_subscriptions")
    .select("plan_tier,status,current_period_start,current_period_end,metadata")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const usageBillingRow = billingRow as (BillingRow & { current_period_start?: string | null }) | null;

  if (usageBillingRow?.plan_tier !== "performance") {
    return null;
  }

  const periodStart =
    typeof usageBillingRow.current_period_start === "string"
      ? usageBillingRow.current_period_start
      : null;
  const query = admin
    .from("lead_billing_events")
    .select("status,amount_cents,reported_at,charged_at,created_at")
    .eq("organization_id", organizationId);
  const { data, error } = periodStart ? await query.gte("created_at", periodStart) : await query;

  if (error) {
    logWarn("performance_lead_usage_summary_failed", {
      organizationId,
      message: error.message,
    });
    return null;
  }

  const rows = Array.isArray(data) ? data as Array<{
    status?: string | null;
    amount_cents?: number | null;
    reported_at?: string | null;
    charged_at?: string | null;
  }> : [];
  const billableRows = rows.filter((row) =>
    ["charged", "reported", "pending", "charging", "failed"].includes(row.status ?? ""),
  );
  const chargedRows = rows.filter((row) => row.status === "charged");
  const reportedRows = rows.filter((row) => row.status === "reported");
  const pendingRows = rows.filter((row) => row.status === "pending" || row.status === "charging");
  const failedRows = rows.filter((row) => row.status === "failed");
  const latestReportedAt = reportedRows
    .map((row) => row.reported_at ?? row.charged_at)
    .concat(chargedRows.map((row) => row.charged_at))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    billableLeadCount: billableRows.length,
    reportedLeadCount: reportedRows.length + chargedRows.length,
    chargedLeadCount: chargedRows.length,
    pendingLeadCount: pendingRows.length,
    failedLeadCount: failedRows.length,
    estimatedLeadChargesCents: billableRows.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0),
    collectedLeadChargesCents: chargedRows.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0),
    baseSubscriptionCents: 9700,
    latestReportedAt,
  };
}

export async function runPerformanceLeadBillingJob(payload: PerformanceLeadBillingJobPayload) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const idempotencyKey = getLedgerIdempotencyKey({
    organizationId: payload.organizationId,
    campaignId: payload.campaignId,
    leadId: payload.leadId,
  });

  const [{ data: leadData, error: leadError }, { data: billingData, error: billingError }] = await Promise.all([
    admin
      .from("leads")
      .select("id,organization_id,campaign_id,source,consent_source,created_at,metadata")
      .eq("id", payload.leadId)
      .maybeSingle(),
    admin
      .from("billing_subscriptions")
      .select("plan_tier,status,stripe_customer_id,stripe_subscription_id,metadata")
      .eq("organization_id", payload.organizationId)
      .maybeSingle(),
  ]);

  if (leadError) {
    throw new ApiError(500, leadError.message, "lead_billing_lead_fetch_failed");
  }
  if (billingError) {
    throw new ApiError(500, billingError.message, "lead_billing_subscription_fetch_failed");
  }

  const lead = (leadData as LeadRow | null) ?? null;
  const billing = (billingData as BillingRow | null) ?? null;
  const skipReason = getNonBillableReason({ lead, billing, payload });

  if (skipReason) {
    if (!lead) {
      logOperationalEvent("performance_lead_billing.skipped", {
        requestId: payload.requestId,
        leadId: payload.leadId,
        organizationId: payload.organizationId,
        reason: skipReason,
      });
      return {
        status: "skipped",
        reason: skipReason,
        ledgerId: null,
      };
    }

    const ledger = await upsertSkippedLedger({ lead, payload, reason: skipReason, idempotencyKey });
    logOperationalEvent("performance_lead_billing.skipped", {
      requestId: payload.requestId,
      leadId: payload.leadId,
      organizationId: payload.organizationId,
      reason: skipReason,
    });
    return {
      status: "skipped",
      reason: skipReason,
      ledgerId: typeof ledger.id === "string" ? ledger.id : null,
    };
  }

  const metadata = getBillingMetadata(billing);
  const stripeCustomerId = billing?.stripe_customer_id as string;
  const stripeSubscriptionId = billing?.stripe_subscription_id as string;
  const defaultPaymentMethodId = getDefaultPaymentMethodId(billing);

  const { data: existingLedgerData, error: existingLedgerError } = await admin
    .from("lead_billing_events")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingLedgerError) {
    throw new ApiError(500, existingLedgerError.message, "lead_billing_ledger_lookup_failed");
  }

  const existingLedger = existingLedgerData as {
    id: string;
    status?: string | null;
    stripe_meter_event_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_charge_id?: string | null;
    skip_reason?: string | null;
  } | null;

  if (existingLedger?.status === "reported" && existingLedger.stripe_meter_event_id) {
    return {
      status: "charged",
      legacyMetered: true,
      reusedExisting: true,
      ledgerId: existingLedger.id,
      stripeMeterEventId: existingLedger.stripe_meter_event_id,
    };
  }

  if (existingLedger?.status === "charged" && existingLedger.stripe_payment_intent_id) {
    return {
      status: "charged",
      reusedExisting: true,
      ledgerId: existingLedger.id,
      stripePaymentIntentId: existingLedger.stripe_payment_intent_id,
      stripeChargeId: existingLedger.stripe_charge_id ?? null,
    };
  }

  if (existingLedger?.status === "skipped") {
    return {
      status: "skipped",
      reusedExisting: true,
      reason: existingLedger.skip_reason ?? "previously_skipped",
      ledgerId: existingLedger.id,
    };
  }

  const { data: ledgerData, error: ledgerError } = await admin
    .from("lead_billing_events")
    .upsert(
      {
        organization_id: payload.organizationId,
        campaign_id: payload.campaignId,
        lead_id: payload.leadId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        amount_cents: PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS,
        currency: "usd",
        status: "pending",
        idempotency_key: idempotencyKey,
        metadata: {
          source: payload.source,
          requestId: payload.requestId,
          billingModel: PERFORMANCE_LEAD_BILLING_MODEL,
          stripeDefaultPaymentMethodId: defaultPaymentMethodId,
        } satisfies Json,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "idempotency_key" },
    )
    .select("*")
    .single();

  if (ledgerError || !ledgerData) {
    throw new ApiError(500, ledgerError?.message ?? "Lead billing ledger could not be created.", "lead_billing_ledger_failed");
  }

  const ledger = ledgerData as {
    id: string;
    status?: string | null;
    stripe_meter_event_id?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_charge_id?: string | null;
  };
  if (ledger.status === "reported" && ledger.stripe_meter_event_id) {
    return {
      status: "charged",
      legacyMetered: true,
      reusedExisting: true,
      ledgerId: ledger.id,
      stripeMeterEventId: ledger.stripe_meter_event_id,
    };
  }

  if (ledger.status === "charged" && ledger.stripe_payment_intent_id) {
    return {
      status: "charged",
      reusedExisting: true,
      ledgerId: ledger.id,
      stripePaymentIntentId: ledger.stripe_payment_intent_id,
      stripeChargeId: ledger.stripe_charge_id ?? null,
    };
  }

  try {
    await admin
      .from("lead_billing_events")
      .update({
        status: "charging",
        attempt_count: Number((ledger as { attempt_count?: number | null }).attempt_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", ledger.id);

    const result = await getStripeBillingProvider().execute({
      action: "create_payment_intent",
      idempotencyKey,
      params: {
        amount: PERFORMANCE_LEAD_UNIT_AMOUNT_CENTS,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: defaultPaymentMethodId ?? undefined,
        off_session: true,
        confirm: true,
        description: "DealFlow qualified lead",
        metadata: {
          lead_id: payload.leadId,
          campaign_id: payload.campaignId,
          organization_id: payload.organizationId,
          billing_model: PERFORMANCE_LEAD_BILLING_MODEL,
        },
      },
    }) as {
      id?: string;
      latest_charge?: string | { id?: string | null } | null;
      status?: string;
    };
    const stripePaymentIntentId = typeof result.id === "string" ? result.id : idempotencyKey;
    const stripeChargeId =
      typeof result.latest_charge === "string"
        ? result.latest_charge
        : result.latest_charge?.id ?? null;

    await admin
      .from("lead_billing_events")
      .update({
        status: "charged",
        stripe_payment_intent_id: stripePaymentIntentId,
        stripe_charge_id: stripeChargeId,
        charged_at: new Date().toISOString(),
        reported_at: new Date().toISOString(),
        failure_code: null,
        failure_message: null,
        skip_reason: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", ledger.id);

    logOperationalEvent("performance_lead_billing.charged", {
      requestId: payload.requestId,
      leadId: payload.leadId,
      organizationId: payload.organizationId,
      ledgerId: ledger.id,
    });

    return {
      status: "charged",
      reusedExisting: false,
      ledgerId: ledger.id,
      stripePaymentIntentId,
      stripeChargeId,
    };
  } catch (error) {
    const stripeLikeError = error as {
      code?: string;
      decline_code?: string;
      message?: string;
      raw?: { code?: string; decline_code?: string; message?: string };
    };
    const failureCode =
      stripeLikeError.code ??
      stripeLikeError.decline_code ??
      stripeLikeError.raw?.code ??
      stripeLikeError.raw?.decline_code ??
      "stripe_payment_intent_failed";
    const failureMessage =
      stripeLikeError.message ??
      stripeLikeError.raw?.message ??
      (error instanceof Error ? error.message : "Unknown Stripe lead charge failure");

    await admin
      .from("lead_billing_events")
      .update({
        status: "failed",
        failure_code: failureCode,
        failure_message: failureMessage,
        next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        metadata: {
          source: payload.source,
          requestId: payload.requestId,
          billingModel: PERFORMANCE_LEAD_BILLING_MODEL,
          failure: failureMessage,
        } satisfies Json,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", ledger.id);

    logError("performance_lead_billing.failed", {
      requestId: payload.requestId,
      leadId: payload.leadId,
      organizationId: payload.organizationId,
      code: failureCode,
      message: failureMessage,
    });

    throw error;
  }
}

export async function markPerformanceLeadBillingCredited(params: {
  leadId: string;
  reason: string;
  operatorId?: string | null;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { error } = await admin
    .from("lead_billing_events")
    .update({
      status: "credited",
      skip_reason: params.reason,
      metadata: {
        creditedReason: params.reason,
        creditedBy: params.operatorId ?? null,
        creditedAt: new Date().toISOString(),
      } satisfies Json,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("lead_id", params.leadId);

  if (error) {
    throw new ApiError(500, error.message, "lead_billing_credit_failed");
  }
}
