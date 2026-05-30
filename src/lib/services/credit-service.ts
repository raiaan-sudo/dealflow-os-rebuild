import { ApiError } from "@/lib/api/route";
import {
  getQaGenerationCreditOverrideCampaignIds,
  getQaGenerationCreditOverrideEmails,
  getQaGenerationCreditOverrideMaxCents,
  getQaGenerationCreditOverrideOrgIds,
  getQaGenerationCreditOverrideUserIds,
  isBillingAdminOverrideEmail,
  isBillingAdminOverrideEnabled,
  isQaGenerationCreditOverrideEnabled,
} from "@/lib/env";
import { logOperationalEvent } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import type { Json } from "@/lib/supabase/types";

export type GenerationCreditBucket =
  | "image_generation"
  | "video_generation"
  | "openai_image_generation"
  | "heygen_video_generation";

export const CREDIT_TOP_UP_MINIMUM_CENTS = 1_000;
const DEFAULT_GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS = 0;

const DEFAULT_GENERATION_CREDIT_COSTS_CENTS: Record<GenerationCreditBucket, number> = {
  image_generation: 100,
  video_generation: 500,
  openai_image_generation: 100,
  heygen_video_generation: 500,
};

export type QaGenerationCreditOverrideMatch = {
  matchedBy: "email" | "user_id" | "organization_id" | "campaign_id";
  maxCents: number | null;
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

export function getGenerationCreditOverdraftLimitCents() {
  return parsePositiveInt(
    process.env.GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS,
    DEFAULT_GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS,
  );
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

function normalizeList(values?: string[] | null, options: { lowercase?: boolean } = {}) {
  return new Set(
    (values ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (options.lowercase ? value.toLowerCase() : value)),
  );
}

export function evaluateQaGenerationCreditOverride(params: {
  enabled: boolean;
  amountCents: number;
  email?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  campaignId?: string | null;
  emails?: string[] | null;
  userIds?: string[] | null;
  organizationIds?: string[] | null;
  campaignIds?: string[] | null;
  maxCents?: number | null;
}): QaGenerationCreditOverrideMatch | null {
  if (!params.enabled) {
    return null;
  }

  const maxCents =
    typeof params.maxCents === "number" && Number.isFinite(params.maxCents) && params.maxCents > 0
      ? Math.floor(params.maxCents)
      : null;

  if (maxCents !== null && params.amountCents > maxCents) {
    return null;
  }

  const emails = normalizeList(params.emails, { lowercase: true });
  const userIds = normalizeList(params.userIds);
  const organizationIds = normalizeList(params.organizationIds);
  const campaignIds = normalizeList(params.campaignIds);
  const email = params.email?.trim().toLowerCase() ?? "";
  const userId = params.userId?.trim() ?? "";
  const organizationId = params.organizationId?.trim() ?? "";
  const campaignId = params.campaignId?.trim() ?? "";

  if (email && emails.has(email)) {
    return { matchedBy: "email", maxCents };
  }

  if (userId && userIds.has(userId)) {
    return { matchedBy: "user_id", maxCents };
  }

  if (organizationId && organizationIds.has(organizationId)) {
    return { matchedBy: "organization_id", maxCents };
  }

  if (campaignId && campaignIds.has(campaignId)) {
    return { matchedBy: "campaign_id", maxCents };
  }

  return null;
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

async function getQaGenerationCreditOverrideForUser(params: {
  userId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  amountCents: number;
}) {
  if (!isQaGenerationCreditOverrideEnabled()) {
    return null;
  }

  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("users")
    .select("email")
    .eq("id", params.userId)
    .maybeSingle();
  const row = data as { email?: unknown } | null;
  const email = typeof row?.email === "string" ? row.email : null;

  return evaluateQaGenerationCreditOverride({
    enabled: true,
    amountCents: params.amountCents,
    email,
    userId: params.userId,
    organizationId: params.organizationId ?? null,
    campaignId: params.campaignId ?? null,
    emails: getQaGenerationCreditOverrideEmails(),
    userIds: getQaGenerationCreditOverrideUserIds(),
    organizationIds: getQaGenerationCreditOverrideOrgIds(),
    campaignIds: getQaGenerationCreditOverrideCampaignIds(),
    maxCents: getQaGenerationCreditOverrideMaxCents(),
  });
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
  const qaGenerationCreditOverride = await getQaGenerationCreditOverrideForUser({
    userId: context.user.id,
    organizationId: context.organization.id,
    campaignId: null,
    amountCents: getGenerationCreditCostCents("video_generation"),
  });

  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    balance,
    formattedBalance: formatCreditCurrency(balance),
    balanceDueCents,
    formattedBalanceDue: formatCreditCurrency(balanceDueCents),
    creditOverride: Boolean(billingOverrideEmail),
    qaGenerationCreditOverride: Boolean(qaGenerationCreditOverride),
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

  const qaGenerationCreditOverride = await getQaGenerationCreditOverrideForUser({
    userId: params.userId,
    organizationId: params.organizationId ?? null,
    campaignId: params.campaignId ?? null,
    amountCents: amount,
  });
  if (qaGenerationCreditOverride) {
    logOperationalEvent("qa_generation_credit_override_granted", {
      userId: params.userId,
      organizationId: params.organizationId ?? null,
      campaignId: params.campaignId ?? null,
      bucket: normalizedBucket,
      referenceId: params.referenceId,
      amountCents: amount,
      matchedBy: qaGenerationCreditOverride.matchedBy,
      maxCents: qaGenerationCreditOverride.maxCents,
    });

    return {
      amount: 0,
      balance: null as number | null,
      ledgerId: null as string | null,
      reusedExisting: false,
      bypassedByQaGenerationCreditOverride: true,
      creditOverrideMatchedBy: qaGenerationCreditOverride.matchedBy,
    };
  }

  const overdraftLimitCents = getGenerationCreditOverdraftLimitCents();
  const { data: creditRowRaw, error: creditFetchError } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (creditFetchError) {
    throw new ApiError(500, creditFetchError.message, "credit_balance_fetch_failed");
  }

  const creditRow = creditRowRaw as { balance?: unknown } | null;
  const currentBalance = typeof creditRow?.balance === "number" ? creditRow.balance : 0;
  const nextBalance = currentBalance - amount;

  if (nextBalance < -overdraftLimitCents) {
    throw new ApiError(
      402,
      `Generation credits could not be reserved. Add at least ${formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS)} before trying again.`,
      "credits_insufficient",
    );
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
      overdraftLimitCents,
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

export async function assertGenerationCreditsAvailableForUser(params: {
  bucket: GenerationCreditBucket;
  userId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  quantity?: number | null;
}) {
  const unitAmount = getGenerationCreditCostCents(params.bucket);
  const quantity =
    typeof params.quantity === "number" && Number.isFinite(params.quantity) && params.quantity > 0
      ? Math.floor(params.quantity)
      : 1;
  const amount = unitAmount * quantity;

  if (amount <= 0) {
    return;
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const billingOverrideEmail = await getBillingOverrideEmailForUser(params.userId);
  if (billingOverrideEmail) {
    return;
  }

  const qaGenerationCreditOverride = await getQaGenerationCreditOverrideForUser({
    userId: params.userId,
    organizationId: params.organizationId ?? null,
    campaignId: params.campaignId ?? null,
    amountCents: unitAmount,
  });
  if (qaGenerationCreditOverride) {
    return;
  }

  const overdraftLimitCents = getGenerationCreditOverdraftLimitCents();
  const { data: creditRowRaw, error: creditFetchError } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (creditFetchError) {
    throw new ApiError(500, creditFetchError.message, "credit_balance_fetch_failed");
  }

  const creditRow = creditRowRaw as { balance?: unknown } | null;
  const currentBalance = typeof creditRow?.balance === "number" ? creditRow.balance : 0;

  if (currentBalance - amount < -overdraftLimitCents) {
    throw new ApiError(
      402,
      `Add ${formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS)} in generation credits before rendering paid creatives.`,
      "credits_insufficient",
    );
  }
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
