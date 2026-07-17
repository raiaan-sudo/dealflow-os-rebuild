import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import type { Json } from "@/lib/supabase/types";
import { INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS } from "@/lib/commercial-activation-policy";

export { INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS } from "@/lib/commercial-activation-policy";

type GenerationCreditBucket =
  | "openai_image_generation"
  | "heygen_video_generation"
  | "higgsfield_video_generation";

export const CREDIT_TOP_UP_MINIMUM_CENTS = 2_500;
export const CREDIT_TOP_UP_MAXIMUM_CENTS = 100_000;
export const CREDIT_ACTIVITY_LIMIT = 20;
const CREDIT_RESERVATION_SCAN_LIMIT = 500;

const DEFAULT_GENERATION_CREDIT_COSTS_CENTS: Record<GenerationCreditBucket, number> = {
  openai_image_generation: 100,
  heygen_video_generation: 500,
  higgsfield_video_generation: 500,
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getGenerationCreditCostCents(bucket: GenerationCreditBucket) {
  const envName =
    bucket === "openai_image_generation"
      ? "IMAGE_GENERATION_CREDIT_COST_CENTS"
      : "VIDEO_GENERATION_CREDIT_COST_CENTS";

  return parsePositiveInt(process.env[envName], DEFAULT_GENERATION_CREDIT_COSTS_CENTS[bucket]);
}

export function formatCreditCurrency(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function getCreditReason(bucket: GenerationCreditBucket) {
  return bucket === "openai_image_generation" ? "image_generation" : "video_generation";
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

  const [creditResult, activityResult, reservationResult] = await Promise.all([
    admin
      .from("organization_user_credits")
      .select("balance, updated_at")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .maybeSingle(),
    admin
      .from("user_credit_ledger")
      .select("id, delta, balance_after, reason, reference_type, created_at")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(CREDIT_ACTIVITY_LIMIT),
    admin
      .from("provider_usage_events")
      .select("credit_ledger_id")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .eq("status", "reserved")
      .not("credit_ledger_id", "is", null)
      .limit(CREDIT_RESERVATION_SCAN_LIMIT + 1),
  ]);

  if (creditResult.error) {
    throw new ApiError(500, creditResult.error.message, "credit_balance_fetch_failed");
  }
  if (activityResult.error) {
    throw new ApiError(500, activityResult.error.message, "credit_activity_fetch_failed");
  }
  if (reservationResult.error) {
    throw new ApiError(500, reservationResult.error.message, "credit_reservation_fetch_failed");
  }

  const creditRowRaw = creditResult.data;
  const creditRow = creditRowRaw as { balance?: unknown; updated_at?: unknown } | null;
  const balance = typeof creditRow?.balance === "number" ? creditRow.balance : 0;
  const rawActivity = (activityResult.data ?? []) as Array<Record<string, unknown>>;
  const activity = rawActivity.flatMap((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.delta !== "number" ||
      typeof row.balance_after !== "number" ||
      typeof row.reason !== "string" ||
      typeof row.created_at !== "string"
    ) {
      return [];
    }

    return [{
      id: row.id,
      deltaCents: row.delta,
      balanceAfterCents: row.balance_after,
      reason: row.reason,
      referenceType: typeof row.reference_type === "string" ? row.reference_type : null,
      createdAt: row.created_at,
    }];
  });

  const reservationRows = (reservationResult.data ?? []) as Array<{
    credit_ledger_id?: unknown;
  }>;
  const reservationScanComplete = reservationRows.length <= CREDIT_RESERVATION_SCAN_LIMIT;
  const reservationLedgerIds = reservationRows
    .slice(0, CREDIT_RESERVATION_SCAN_LIMIT)
    .flatMap((row) => (typeof row.credit_ledger_id === "string" ? [row.credit_ledger_id] : []));

  let reservedBalanceCents: number | null = 0;
  if (!reservationScanComplete) {
    reservedBalanceCents = null;
  } else if (reservationLedgerIds.length > 0) {
    const reservedLedgerRows: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < reservationLedgerIds.length; offset += 100) {
      const { data, error } = await admin
        .from("user_credit_ledger")
        .select("id, delta")
        .eq("organization_id", context.organization.id)
        .eq("user_id", context.user.id)
        .in("id", reservationLedgerIds.slice(offset, offset + 100));

      if (error) {
        throw new ApiError(500, error.message, "credit_reservation_ledger_fetch_failed");
      }
      reservedLedgerRows.push(...((data ?? []) as Array<Record<string, unknown>>));
    }

    const matchedLedgerIds = new Set(
      reservedLedgerRows.flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
    );
    if (matchedLedgerIds.size !== new Set(reservationLedgerIds).size) {
      reservedBalanceCents = null;
    } else {
      reservedBalanceCents = reservedLedgerRows.reduce(
        (total, row) => total + (typeof row.delta === "number" && row.delta < 0 ? -row.delta : 0),
        0,
      );
    }
  }

  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    balance,
    formattedBalance: formatCreditCurrency(balance),
    availableBalanceCents: balance,
    reservedBalanceCents,
    reservationStatus: reservedBalanceCents === null ? "incomplete" as const : "complete" as const,
    activity,
    minimumTopUpCents: CREDIT_TOP_UP_MINIMUM_CENTS,
    maximumTopUpCents: CREDIT_TOP_UP_MAXIMUM_CENTS,
    formattedMinimumTopUp: formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS),
    imageGenerationCostCents: getGenerationCreditCostCents("openai_image_generation"),
    videoGenerationCostCents: getGenerationCreditCostCents("higgsfield_video_generation"),
    updatedAt: typeof creditRow?.updated_at === "string" ? creditRow.updated_at : null,
  };
}

export async function consumeCreditsForGeneration(params: {
  bucket: GenerationCreditBucket;
  userId: string;
  organizationId: string;
  campaignId?: string | null;
  referenceId: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const amount = getGenerationCreditCostCents(params.bucket);

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

  const { data: rows, error } = await (admin as any).rpc("consume_user_credits", {
    p_user_id: params.userId,
    p_organization_id: params.organizationId,
    p_amount: amount,
    p_reason: getCreditReason(params.bucket),
    p_reference_type: "provider_usage_event",
    p_reference_id: params.referenceId,
    p_idempotency_key:
      params.idempotencyKey?.trim() ||
      `generation_credit:${params.bucket}:${params.referenceId}`,
    p_metadata: {
      bucket: params.bucket,
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
      `Insufficient credits. Add at least ${formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS)} before running paid generation.`,
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
  organizationId: string;
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
    p_organization_id: params.organizationId,
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

export async function recordCommercialActivationWithInitialCredit(params: {
  organizationId: string;
  userId: string;
  sourceEventId: string;
  sourceEventType:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
    | "invoice.payment_succeeded";
  sourceEventCreated: number;
  sourcePaymentId?: string | null;
  sourceSubscriptionId?: string | null;
  amountPaidCents: number;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isInteger(params.amountPaidCents) || params.amountPaidCents <= 0) {
    throw new ApiError(400, "A positive applied payment is required for activation.", "activation_payment_invalid");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: rows, error } = await (admin as any).rpc(
    "record_commercial_activation_with_initial_credit",
    {
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_source_event_id: params.sourceEventId,
      p_source_event_type: params.sourceEventType,
      p_source_event_created: params.sourceEventCreated,
      p_source_payment_id: params.sourcePaymentId ?? null,
      p_source_subscription_id: params.sourceSubscriptionId ?? null,
      p_amount_paid_cents: params.amountPaidCents,
      p_currency: params.currency ?? null,
      p_metadata: (params.metadata ?? {}) as Json,
    },
  );

  if (error) {
    throw new ApiError(500, "Commercial activation could not be recorded.", "commercial_activation_failed");
  }

  const row = (Array.isArray(rows) ? rows[0] : rows) as
    | {
        activation_id?: unknown;
        activation_created?: unknown;
        initial_credit_granted?: unknown;
        balance?: unknown;
        ledger_id?: unknown;
        reused_existing?: unknown;
      }
    | null;

  if (!row || typeof row.activation_id !== "string" || typeof row.ledger_id !== "string") {
    throw new ApiError(500, "Commercial activation returned no durable result.", "commercial_activation_failed");
  }

  if (row.activation_created === true && row.initial_credit_granted !== true) {
    throw new ApiError(
      500,
      "Commercial activation did not atomically create its initial credit.",
      "commercial_activation_credit_missing",
    );
  }

  return {
    activationId: row.activation_id,
    activationCreated: row.activation_created === true,
    initialCreditGranted: row.initial_credit_granted === true,
    initialCreditAmountCents:
      row.initial_credit_granted === true ? INITIAL_COMMERCIAL_ACTIVATION_CREDIT_CENTS : 0,
    balance: typeof row.balance === "number" ? row.balance : null,
    ledgerId: row.ledger_id,
    reusedExisting: row.reused_existing === true,
  };
}

export async function getCommercialActivationSummaryForCurrentUser() {
  const context = await getAppContext();

  if (!context) {
    throw new ApiError(401, "Authentication is required for activation status.", "unauthorized");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await (admin as any)
    .from("commercial_activations")
    .select("id,activated_at,source_event_type")
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Commercial activation status could not be loaded.", "commercial_activation_fetch_failed");
  }

  const row = data as
    | { id?: unknown; activated_at?: unknown; source_event_type?: unknown }
    | null;

  return {
    activated: typeof row?.id === "string",
    activationId: typeof row?.id === "string" ? row.id : null,
    activatedAt: typeof row?.activated_at === "string" ? row.activated_at : null,
    sourceEventType: typeof row?.source_event_type === "string" ? row.source_event_type : null,
  };
}
