import { ApiError } from "@/lib/api/route";
import {
  isBillingAdminOverrideEmail,
  isBillingAdminOverrideEnabled,
} from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import type { Json } from "@/lib/supabase/types";

export type GenerationCreditBucket =
  | "image_generation"
  | "video_generation"
  | "openai_image_generation"
  | "heygen_video_generation";

export const CREDIT_TOP_UP_MINIMUM_CENTS = 2_000;

const DEFAULT_GENERATION_CREDIT_COSTS_CENTS: Record<GenerationCreditBucket, number> = {
  image_generation: 100,
  video_generation: 500,
  openai_image_generation: 100,
  heygen_video_generation: 500,
};

function normalizeGenerationCreditBucket(bucket: GenerationCreditBucket) {
  if (bucket === "openai_image_generation") {
    return "image_generation";
  }

  if (bucket === "heygen_video_generation") {
    return "video_generation";
  }

  return bucket;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getGenerationCreditCostCents(bucket: GenerationCreditBucket) {
  const normalizedBucket = normalizeGenerationCreditBucket(bucket);
  const envName =
    normalizedBucket === "image_generation"
      ? "IMAGE_GENERATION_CREDIT_COST_CENTS"
      : "VIDEO_GENERATION_CREDIT_COST_CENTS";

  return parsePositiveInt(process.env[envName], DEFAULT_GENERATION_CREDIT_COSTS_CENTS[normalizedBucket]);
}

export function formatCreditCurrency(cents: number) {
  const amount = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${(amount / 100).toFixed(2)}`;
}

function getCreditReason(bucket: GenerationCreditBucket) {
  return normalizeGenerationCreditBucket(bucket);
}

async function getBillingOverrideEmailForUser(userId: string) {
  if (!isBillingAdminOverrideEnabled()) {
    return null;
  }

  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { email?: unknown } | null;
  const email = typeof row?.email === "string" ? row.email : null;

  return isBillingAdminOverrideEmail(email) ? email : null;
}

export async function getCreditSummaryForCurrentUser() {
  const context = await getAppContext();

  if (!context) {
    throw new ApiError(401, "Authentication is required for credit access.", "unauthorized");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: creditRowRaw, error } = await admin
    .from("user_credits")
    .select("balance, updated_at")
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "credit_balance_fetch_failed");
  }

  const creditRow = creditRowRaw as { balance?: unknown; updated_at?: unknown } | null;
  const balance = typeof creditRow?.balance === "number" ? creditRow.balance : 0;
  const balanceDueCents = Math.max(0, -balance);
  const billingOverrideEmail = await getBillingOverrideEmailForUser(context.user.id);

  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    balance,
    formattedBalance: formatCreditCurrency(balance),
    balanceDueCents,
    formattedBalanceDue: formatCreditCurrency(balanceDueCents),
    creditOverride: Boolean(billingOverrideEmail),
    minimumTopUpCents: CREDIT_TOP_UP_MINIMUM_CENTS,
    formattedMinimumTopUp: formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS),
    imageGenerationCostCents: getGenerationCreditCostCents("image_generation"),
    videoGenerationCostCents: getGenerationCreditCostCents("video_generation"),
    updatedAt: typeof creditRow?.updated_at === "string" ? creditRow.updated_at : null,
  };
}

export async function consumeCreditsForGeneration(params: {
  bucket: GenerationCreditBucket;
  userId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  referenceId: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const amount = getGenerationCreditCostCents(params.bucket);
  const normalizedBucket = normalizeGenerationCreditBucket(params.bucket);

  if (amount <= 0) {
    return {
      amount,
      balance: null as number | null,
      ledgerId: null as string | null,
      reusedExisting: false,
    };
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const billingOverrideEmail = await getBillingOverrideEmailForUser(params.userId);
  if (billingOverrideEmail) {
    return {
      amount: 0,
      balance: null as number | null,
      ledgerId: null as string | null,
      reusedExisting: false,
      bypassedByBillingOverride: true,
    };
  }

  const { data: rows, error } = await (admin as any).rpc("consume_user_credits", {
    p_user_id: params.userId,
    p_organization_id: params.organizationId ?? null,
    p_amount: amount,
    p_reason: getCreditReason(params.bucket),
    p_reference_type: "provider_usage_event",
    p_reference_id: params.referenceId,
    p_idempotency_key:
      params.idempotencyKey?.trim() ||
      `generation_credit:${params.bucket}:${params.referenceId}`,
    p_metadata: {
      bucket: normalizedBucket,
      legacyBucket: params.bucket === normalizedBucket ? null : params.bucket,
      campaignId: params.campaignId ?? null,
      ...(params.metadata ?? {}),
    } satisfies Json,
  });

  if (error) {
    throw new ApiError(500, error.message, "credit_consume_failed");
  }

  const row = Array.isArray(rows) ? rows[0] : rows;

  if (!row) {
    throw new ApiError(500, "Credit deduction returned no result.", "credit_consume_failed");
  }

  if (row.allowed !== true) {
    throw new ApiError(
      402,
      `Generation credits could not be reserved. Add at least ${formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS)} before trying again.`,
      "credits_insufficient",
    );
  }

  return {
    amount,
    balance: typeof row.balance === "number" ? row.balance : null,
    ledgerId: typeof row.ledger_id === "string" ? row.ledger_id : null,
    reusedExisting: row.reused_existing === true,
  };
}

export async function grantUserCredits(params: {
  userId: string;
  organizationId?: string | null;
  amount: number;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new ApiError(400, "Credit amount must be positive.", "credit_amount_invalid");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: rows, error } = await (admin as any).rpc("grant_user_credits", {
    p_user_id: params.userId,
    p_organization_id: params.organizationId ?? null,
    p_amount: Math.floor(params.amount),
    p_reason: params.reason,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_metadata: (params.metadata ?? {}) as Json,
  });

  if (error) {
    throw new ApiError(500, error.message, "credit_grant_failed");
  }

  const row = Array.isArray(rows) ? rows[0] : rows;

  if (!row) {
    throw new ApiError(500, "Credit grant returned no result.", "credit_grant_failed");
  }

  return {
    balance: typeof row.balance === "number" ? row.balance : null,
    ledgerId: typeof row.ledger_id === "string" ? row.ledger_id : null,
    reusedExisting: row.reused_existing === true,
  };
}

export async function refundCreditsForProviderUsageEvent(params: {
  providerUsageEventId: string;
  status: "released" | "failed";
}) {
  const admin = createAdminClient();

  if (!admin) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
    }
    return null;
  }

  const { data, error } = await admin
    .from("user_credit_ledger")
    .select("id, user_id, organization_id, delta, reason")
    .eq("reference_type", "provider_usage_event")
    .eq("reference_id", params.providerUsageEventId)
    .lt("delta", 0)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "credit_refund_lookup_failed");
  }

  const ledger = data as
    | {
        id: string;
        user_id: string;
        organization_id: string | null;
        delta: number;
        reason: string;
      }
    | null;

  if (!ledger) {
    return null;
  }

  return grantUserCredits({
    userId: ledger.user_id,
    organizationId: ledger.organization_id,
    amount: Math.abs(ledger.delta),
    reason: `${ledger.reason}_refund`,
    referenceType: "provider_usage_event",
    referenceId: params.providerUsageEventId,
    idempotencyKey: `generation_credit_refund:${params.providerUsageEventId}:${params.status}`,
    metadata: {
      refundStatus: params.status,
      originalLedgerId: ledger.id,
    },
  });
}
