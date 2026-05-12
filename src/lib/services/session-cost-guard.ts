import { ApiError } from "@/lib/api/route";
import { cookies } from "next/headers";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type GenerationCreditBucket,
  consumeCreditsForGeneration,
  refundCreditsForProviderUsageEvent,
} from "@/lib/services/credit-service";

export type SessionCostBucket =
  | "image_generation"
  | "video_generation"
  | "openai_image_generation"
  | "heygen_video_generation";

const SESSION_COST_LIMITS: Record<SessionCostBucket, { cookie: string; limit: number }> = {
  image_generation: {
    cookie: "dealflow_session_image_generations",
    limit: 10,
  },
  video_generation: {
    cookie: "dealflow_session_video_generations",
    limit: 2,
  },
  openai_image_generation: {
    cookie: "dealflow_session_openai_image_generations",
    limit: 10,
  },
  heygen_video_generation: {
    cookie: "dealflow_session_heygen_video_generations",
    limit: 2,
  },
};

const DURABLE_PROVIDER_USAGE_LIMITS: Record<"image_generation" | "video_generation", { default: number; maximum: number }> = {
  image_generation: {
    default: 30,
    maximum: 120,
  },
  video_generation: {
    default: 4,
    maximum: 12,
  },
};

function normalizeSessionCostBucket(bucket: SessionCostBucket): "image_generation" | "video_generation" {
  if (bucket === "openai_image_generation") {
    return "image_generation";
  }

  if (bucket === "heygen_video_generation") {
    return "video_generation";
  }

  return bucket;
}

function getProviderForBucket(bucket: SessionCostBucket) {
  const normalizedBucket = normalizeSessionCostBucket(bucket);
  const mediaProvider = process.env.MEDIA_GENERATION_PROVIDER;
  const higgsfieldSelected = mediaProvider === "higgsfield" || mediaProvider === "higgsfield_marketing_studio";

  if (normalizedBucket === "image_generation") {
    return higgsfieldSelected ? "higgsfield" : "openai";
  }

  return higgsfieldSelected ? "higgsfield" : "heygen";
}

function getProviderUsageLimit(bucket: SessionCostBucket, options: { durableGuard?: boolean } = {}) {
  const normalizedBucket = normalizeSessionCostBucket(bucket);
  const mediaProvider = process.env.MEDIA_GENERATION_PROVIDER;
  const higgsfieldSelected = mediaProvider === "higgsfield" || mediaProvider === "higgsfield_marketing_studio";
  const envName =
    normalizedBucket === "image_generation"
      ? higgsfieldSelected
        ? "HIGGSFIELD_IMAGE_DAILY_LIMIT"
        : "OPENAI_IMAGE_DAILY_LIMIT"
      : higgsfieldSelected
        ? "HIGGSFIELD_VIDEO_DAILY_LIMIT"
        : "HEYGEN_VIDEO_DAILY_LIMIT";
  const configured = Number.parseInt(process.env[envName] ?? "", 10);
  const durableLimit = DURABLE_PROVIDER_USAGE_LIMITS[normalizedBucket];

  if (Number.isFinite(configured) && configured > 0) {
    return options.durableGuard
      ? Math.min(configured, durableLimit.maximum)
      : Math.min(configured, SESSION_COST_LIMITS[bucket].limit);
  }

  return options.durableGuard
    ? durableLimit.default
    : SESSION_COST_LIMITS[bucket].limit;
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
  const normalizedBucket = normalizeSessionCostBucket(params.bucket);
  const admin = createAdminClient();
  const limit = getProviderUsageLimit(params.bucket, { durableGuard: Boolean(admin) });

  if (admin) {
    const provider = getProviderForBucket(params.bucket);
    const operation = normalizedBucket;
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
        normalizedBucket === "image_generation"
          ? `This workspace already used the maximum ${limit} AI image generation${limit === 1 ? "" : "s"} for this campaign today.`
          : `This workspace already used the maximum ${limit} AI video generation${limit === 1 ? "" : "s"} for this campaign today.`,
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
        bucket: normalizedBucket as GenerationCreditBucket,
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

    const eventId =
      typeof reservation.event_id === "string" && reservation.event_id.trim().length > 0
        ? reservation.event_id
        : null;

    try {
      await consumeCreditsForGeneration({
        bucket: params.bucket,
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        campaignId: params.campaignId ?? null,
        referenceId: eventId ?? params.idempotencyKey ?? crypto.randomUUID(),
        idempotencyKey: eventId
          ? `generation_credit:${normalizedBucket}:${eventId}`
          : params.idempotencyKey
            ? `generation_credit:${normalizedBucket}:${params.idempotencyKey}`
            : null,
        metadata: {
          provider,
          operation,
          legacyOperation: params.bucket === normalizedBucket ? null : params.bucket,
          estimatedCost: params.estimatedCost ?? null,
        },
      });
    } catch (error) {
      if (eventId) {
        await admin
          .from("provider_usage_events")
          .update({
            status: "released",
            metadata: {
              creditReservation: "failed",
              reason: error instanceof Error ? error.message : "Credit reservation failed.",
            },
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", eventId);
      }

      throw error;
    }

    return {
      currentCount: Number(reservation.current_count ?? 0),
      nextCount: Number(reservation.next_count ?? 1),
      limit,
      eventId,
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
      normalizedBucket === "image_generation"
        ? `This session already used the maximum ${limit} AI image generation${limit === 1 ? "" : "s"}.`
        : `This session already used the maximum ${limit} AI video generation${limit === 1 ? "" : "s"}.`,
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

  const { data: existingEventRaw, error: existingEventError } = await admin
    .from("provider_usage_events")
    .select("id,organization_id,user_id,campaign_id,provider,operation,usage_date,status")
    .eq("id", params.eventId)
    .maybeSingle();

  if (existingEventError) {
    throw new ApiError(500, existingEventError.message, "provider_usage_event_fetch_failed");
  }

  const existingEvent =
    existingEventRaw as {
      organization_id: string | null;
      user_id: string | null;
      campaign_id: string | null;
      provider: string | null;
      operation: string | null;
      usage_date: string | null;
      status: string | null;
    } | null;
  const shouldReleaseUsageCount =
    params.status === "released" &&
    existingEvent?.status === "reserved" &&
    Boolean(existingEvent.user_id) &&
    Boolean(existingEvent.provider) &&
    Boolean(existingEvent.operation) &&
    Boolean(existingEvent.usage_date);

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

  if (shouldReleaseUsageCount && existingEvent) {
    const userId = existingEvent.user_id;
    const provider = existingEvent.provider;
    const operation = existingEvent.operation;
    const usageDate = existingEvent.usage_date;

    if (userId && provider && operation && usageDate) {
      let usageLimitQuery = (admin as any)
        .from("provider_usage_limits")
        .select("id,usage_count")
        .eq("user_id", userId)
        .eq("provider", provider)
        .eq("operation", operation)
        .eq("usage_date", usageDate);

      usageLimitQuery = existingEvent.campaign_id
        ? usageLimitQuery.eq("campaign_id", existingEvent.campaign_id)
        : usageLimitQuery.is("campaign_id", null);

      const { data: usageLimitRows, error: usageLimitReadError } = await usageLimitQuery.limit(1);

      if (usageLimitReadError) {
        throw new ApiError(500, usageLimitReadError.message, "provider_usage_limit_fetch_failed");
      }

      const usageLimit = Array.isArray(usageLimitRows)
        ? usageLimitRows[0] as { id?: string | null; usage_count?: number | null } | null
        : null;
      if (usageLimit?.id) {
        const { error: usageLimitUpdateError } = await admin
          .from("provider_usage_limits")
          .update({
            usage_count: Math.max(Number(usageLimit.usage_count ?? 0) - 1, 0),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", usageLimit.id);

        if (usageLimitUpdateError) {
          throw new ApiError(500, usageLimitUpdateError.message, "provider_usage_limit_release_failed");
        }
      }
    }
  }

  if (params.status === "released" || params.status === "failed") {
    await refundCreditsForProviderUsageEvent({
      providerUsageEventId: params.eventId,
      status: params.status,
    });
  }
}
