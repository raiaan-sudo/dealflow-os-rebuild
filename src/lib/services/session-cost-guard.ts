import { ApiError } from "@/lib/api/route";
import { cookies } from "next/headers";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CREDIT_TOP_UP_MINIMUM_CENTS,
  formatCreditCurrency,
  getGenerationCreditCostCents,
} from "@/lib/services/credit-service";

type SessionCostBucket =
  | "openai_image_generation"
  | "heygen_video_generation"
  | "higgsfield_video_generation";

const SESSION_COST_LIMITS: Record<SessionCostBucket, { cookie: string; limit: number }> = {
  openai_image_generation: {
    cookie: "dealflow_session_openai_image_generations",
    limit: 10,
  },
  heygen_video_generation: {
    cookie: "dealflow_session_heygen_video_generations",
    limit: 2,
  },
  higgsfield_video_generation: {
    cookie: "dealflow_session_higgsfield_video_generations",
    limit: 2,
  },
};

function getProviderUsageLimit(bucket: SessionCostBucket) {
  const envName =
    bucket === "openai_image_generation"
      ? "OPENAI_IMAGE_DAILY_LIMIT"
      : bucket === "higgsfield_video_generation"
        ? "HIGGSFIELD_VIDEO_DAILY_LIMIT"
        : "HEYGEN_VIDEO_DAILY_LIMIT";
  const configured = Number.parseInt(process.env[envName] ?? "", 10);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, SESSION_COST_LIMITS[bucket].limit);
  }

  return SESSION_COST_LIMITS[bucket].limit;
}

function parseCount(value: string | undefined) {
  const numeric = Number.parseInt(value ?? "", 10);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export async function consumeSessionCostBudget(params: {
  bucket: SessionCostBucket;
  userId: string;
  organizationId: string;
  campaignId?: string | null;
  idempotencyKey: string;
  attemptKey: string;
  estimatedCost?: number | null;
}) {
  const config = SESSION_COST_LIMITS[params.bucket];
  const limit = getProviderUsageLimit(params.bucket);
  const admin = createAdminClient();

  if (admin) {
    const provider =
      params.bucket === "openai_image_generation"
        ? "openai"
        : params.bucket === "higgsfield_video_generation"
          ? "higgsfield"
          : "heygen";
    const operation = params.bucket;
    const settlementToken = crypto.randomUUID();
    const creditAmount = getGenerationCreditCostCents(params.bucket);
    const { data: reservationRaw, error: reservationError } = await (admin as any).rpc(
      "reserve_provider_usage_attempt_v2",
      {
        p_organization_id: params.organizationId,
        p_user_id: params.userId,
        p_campaign_id: params.campaignId ?? null,
        p_provider: provider,
        p_operation: operation,
        p_limit_count: limit,
        p_idempotency_key: params.idempotencyKey,
        p_attempt_key: params.attemptKey,
        p_settlement_token: settlementToken,
        p_estimated_cost: params.estimatedCost ?? null,
        p_credit_amount: creditAmount,
        p_credit_reason:
          params.bucket === "openai_image_generation"
            ? "image_generation"
            : "video_generation",
      },
    );

    if (reservationError) {
      throw new ApiError(
        500,
        reservationError.message ?? "Provider usage budget could not be reserved.",
        "provider_usage_reserve_failed",
      );
    }

    const reservation = Array.isArray(reservationRaw) ? reservationRaw[0] : reservationRaw;

    if (!reservation) {
      throw new ApiError(
        500,
        "Provider usage budget returned no reservation.",
        "provider_usage_reserve_failed",
      );
    }

    const blockReason =
      typeof reservation.block_reason === "string" ? reservation.block_reason : null;
    const eventStatus =
      typeof reservation.event_status === "string" ? reservation.event_status : null;

    if (reservation.allowed !== true) {
      logWarn("Provider usage guard blocked generation request", {
        bucket: params.bucket,
        userId: params.userId,
        organizationId: params.organizationId,
        campaignId: params.campaignId ?? null,
        limit,
        currentCount: Number(reservation.current_count ?? 0),
        blockReason,
        eventStatus,
      });

      if (blockReason === "credit_insufficient") {
        throw new ApiError(
          402,
          `Insufficient credits. Add at least ${formatCreditCurrency(CREDIT_TOP_UP_MINIMUM_CENTS)} before running paid generation.`,
          "credits_insufficient",
        );
      }

      if (blockReason === "attempt_consumed") {
        throw new ApiError(
          409,
          "This paid generation attempt was already consumed and cannot be replayed.",
          "provider_usage_idempotency_consumed",
        );
      }

      if (blockReason === "attempt_in_progress") {
        throw new ApiError(
          409,
          "This paid generation attempt is already reserved or in progress.",
          "provider_usage_idempotency_in_progress",
        );
      }

      if (blockReason === "operator_action_required") {
        throw new ApiError(
          409,
          "The provider outcome for this attempt is ambiguous and requires operator reconciliation before any retry.",
          "provider_usage_operator_action_required",
        );
      }

      if (blockReason === "attempt_terminal") {
        throw new ApiError(
          409,
          "This provider attempt is terminal. A safe retry must use a fresh job-attempt identity.",
          "provider_usage_terminal_attempt",
        );
      }

      throw new ApiError(
        429,
        params.bucket === "openai_image_generation"
          ? `This workspace already used the maximum ${limit} OpenAI image generation${limit === 1 ? "" : "s"} for this campaign today.`
          : `This workspace already used the maximum ${limit} video generation${limit === 1 ? "" : "s"} for this campaign today.`,
        "provider_usage_limit_reached",
      );
    }

    const eventId =
      typeof reservation.event_id === "string" && reservation.event_id.trim().length > 0
        ? reservation.event_id
        : null;

    const returnedSettlementToken =
      typeof reservation.settlement_token === "string"
        ? reservation.settlement_token
        : null;
    const settlementGeneration =
      typeof reservation.settlement_generation === "number"
        ? reservation.settlement_generation
        : null;

    if (
      !eventId ||
      returnedSettlementToken !== settlementToken ||
      !settlementGeneration ||
      settlementGeneration < 1
    ) {
      throw new ApiError(
        500,
        "Provider usage reservation returned an incomplete settlement fence.",
        "provider_usage_reserve_failed",
      );
    }

    return {
      currentCount: Number(reservation.current_count ?? 0),
      nextCount: Number(reservation.next_count ?? 1),
      limit,
      eventId,
      organizationId: params.organizationId,
      userId: params.userId,
      settlementToken,
      settlementGeneration,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "Durable provider usage guard is unavailable.",
      "provider_usage_guard_unavailable",
    );
  }

  const cookieStore = await cookies();
  const currentCount = parseCount(cookieStore.get(config.cookie)?.value);

  if (currentCount >= limit) {
    logWarn("Session cost guard blocked generation request", {
      bucket: params.bucket,
      userId: params.userId,
      campaignId: params.campaignId ?? null,
      limit,
      currentCount,
    });
    throw new ApiError(
      429,
      params.bucket === "openai_image_generation"
        ? `This session already used the maximum ${limit} OpenAI image generation${limit === 1 ? "" : "s"}.`
        : `This session already used the maximum ${limit} video generation${limit === 1 ? "" : "s"}.`,
      "session_cost_limit_reached",
    );
  }

  const nextCount = currentCount + 1;
  cookieStore.set(config.cookie, String(nextCount), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });

  return {
    currentCount,
    nextCount,
    limit,
    eventId: null,
    organizationId: params.organizationId,
    userId: params.userId,
    settlementToken: null,
    settlementGeneration: null,
  };
}

export async function markSessionCostBudgetEvent(params: {
  eventId: string | null | undefined;
  organizationId: string;
  userId: string;
  settlementToken: string | null | undefined;
  settlementGeneration: number | null | undefined;
  status: "consumed" | "released" | "rejected" | "operator_action_required";
  metadata?: Record<string, unknown>;
}) {
  if (!params.eventId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(
        503,
        "Durable provider usage ledger is unavailable.",
        "provider_usage_guard_unavailable",
      );
    }
    return;
  }

  if (!params.settlementToken || !params.settlementGeneration) {
    throw new ApiError(
      409,
      "Provider usage settlement ownership is missing.",
      "provider_usage_settlement_fence_missing",
    );
  }

  const { data: rows, error } = await (admin as any).rpc(
    "settle_provider_usage_attempt_v2",
    {
      p_event_id: params.eventId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_settlement_token: params.settlementToken,
      p_settlement_generation: params.settlementGeneration,
      p_outcome: params.status,
      p_metadata: params.metadata ?? {},
    },
  );

  if (error) {
    throw new ApiError(500, error.message, "provider_usage_event_update_failed");
  }

  const result = Array.isArray(rows) ? rows[0] : rows;

  if (result?.settled === true) {
    return result;
  }

  if (result?.reused_terminal === true && result?.event_status === params.status) {
    return result;
  }

  throw new ApiError(
    409,
    "Provider usage settlement ownership was lost or the attempt is already terminal.",
    "provider_usage_settlement_fence_lost",
  );
}
