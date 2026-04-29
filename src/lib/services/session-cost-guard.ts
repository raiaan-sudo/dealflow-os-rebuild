import { ApiError } from "@/lib/api/route";
import { cookies } from "next/headers";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";

type SessionCostBucket = "openai_image_generation" | "heygen_video_generation";

const SESSION_COST_LIMITS: Record<SessionCostBucket, { cookie: string; limit: number }> = {
  openai_image_generation: {
    cookie: "dealflow_session_openai_image_generations",
    limit: 10,
  },
  heygen_video_generation: {
    cookie: "dealflow_session_heygen_video_generations",
    limit: 2,
  },
};

function getProviderUsageLimit(bucket: SessionCostBucket) {
  const envName =
    bucket === "openai_image_generation"
      ? "OPENAI_IMAGE_DAILY_LIMIT"
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
  organizationId?: string | null;
  campaignId?: string | null;
  idempotencyKey?: string | null;
  estimatedCost?: number | null;
}) {
  const config = SESSION_COST_LIMITS[params.bucket];
  const limit = getProviderUsageLimit(params.bucket);
  const admin = createAdminClient();

  if (admin) {
    const provider = params.bucket === "openai_image_generation" ? "openai" : "heygen";
    const operation = params.bucket;
    const { data: reservationRaw, error: reservationError } = await (admin as any).rpc(
      "reserve_provider_usage",
      {
        p_organization_id: params.organizationId ?? null,
        p_user_id: params.userId,
        p_campaign_id: params.campaignId ?? null,
        p_provider: provider,
        p_operation: operation,
        p_limit_count: limit,
        p_idempotency_key: params.idempotencyKey ?? null,
        p_estimated_cost: params.estimatedCost ?? null,
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

    if (reservation.allowed !== true) {
      logWarn("Provider usage guard blocked generation request", {
        bucket: params.bucket,
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        campaignId: params.campaignId ?? null,
        limit,
        currentCount: Number(reservation.current_count ?? 0),
      });
      throw new ApiError(
        429,
        params.bucket === "openai_image_generation"
          ? `This workspace already used the maximum ${limit} OpenAI image generation${limit === 1 ? "" : "s"} for this campaign today.`
          : `This workspace already used the maximum ${limit} HeyGen video generation${limit === 1 ? "" : "s"} for this campaign today.`,
        "provider_usage_limit_reached",
      );
    }

    const reusedExisting = reservation.reused_existing === true;
    const eventStatus =
      typeof reservation.event_status === "string" ? reservation.event_status : null;

    if (reusedExisting && eventStatus === "consumed") {
      logWarn("Provider usage guard blocked duplicate consumed request", {
        bucket: params.bucket,
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        campaignId: params.campaignId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
      });
      throw new ApiError(
        409,
        "This paid generation request was already completed for the same idempotency key.",
        "provider_usage_idempotency_consumed",
      );
    }

    if (reusedExisting && eventStatus === "reserved") {
      logWarn("Provider usage guard blocked duplicate in-progress request", {
        bucket: params.bucket,
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        campaignId: params.campaignId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
      });
      throw new ApiError(
        409,
        "This paid generation request is already reserved or in progress.",
        "provider_usage_idempotency_in_progress",
      );
    }

    return {
      currentCount: Number(reservation.current_count ?? 0),
      nextCount: Number(reservation.next_count ?? 1),
      limit,
      eventId:
        typeof reservation.event_id === "string" && reservation.event_id.trim().length > 0
          ? reservation.event_id
          : null,
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
        : `This session already used the maximum ${limit} HeyGen video generation${limit === 1 ? "" : "s"}.`,
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
  };
}

export async function markSessionCostBudgetEvent(params: {
  eventId: string | null | undefined;
  status: "consumed" | "released" | "failed";
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

  const { error } = await admin
    .from("provider_usage_events")
    .update({
      status: params.status,
      metadata: params.metadata ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", params.eventId);

  if (error) {
    throw new ApiError(500, error.message, "provider_usage_event_update_failed");
  }
}
