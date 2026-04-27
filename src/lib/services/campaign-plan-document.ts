import { z } from "zod";
import type { Json } from "@/lib/supabase/types";

export const CURRENT_CAMPAIGN_PLAN_VERSION = 3;

const campaignPayloadSchema = z
  .object({
    selected_ad_id: z.string().trim().min(1).nullable().optional(),
    destination_url: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

const launchRuntimeSchema = z
  .object({
    campaign_id: z.string().trim().min(1).nullable().optional(),
    adset_id: z.string().trim().min(1).nullable().optional(),
    creative_id: z.string().trim().min(1).nullable().optional(),
    ad_id: z.string().trim().min(1).nullable().optional(),
    current_stage: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    step_status: z.string().trim().min(1).nullable().optional(),
    error: z.string().trim().min(1).nullable().optional(),
    updated_at: z.string().trim().min(1).optional(),
  })
  .passthrough();

const runtimeSchema = z
  .object({
    status: z.string().trim().min(1).optional(),
    safetyState: z.string().trim().min(1).optional(),
    launchMode: z.string().trim().min(1).optional(),
    lastAction: z.string().trim().min(1).nullable().optional(),
    statusUpdatedAt: z.string().trim().min(1).nullable().optional(),
    launchedAt: z.string().trim().min(1).nullable().optional(),
    campaignId: z.string().trim().min(1).nullable().optional(),
    adSetId: z.string().trim().min(1).nullable().optional(),
    adId: z.string().trim().min(1).nullable().optional(),
    metaPushStatus: z.string().trim().min(1).optional(),
    metaLastMessage: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

const campaignPlanDocumentSchema = z
  .object({
    version: z.coerce.number().int().min(1).default(CURRENT_CAMPAIGN_PLAN_VERSION),
    selected_ad_id: z.string().trim().min(1).nullable().optional(),
    lead_loop_verified: z.boolean().optional().default(false),
    launch_status: z.string().trim().min(1).nullable().optional(),
    public_slug: z.string().trim().min(1).nullable().optional(),
    campaign_payload: campaignPayloadSchema.optional(),
    launch_runtime: launchRuntimeSchema.optional(),
    runtime: runtimeSchema.optional(),
    first_week_success: z.record(z.string(), z.unknown()).optional(),
    onboarding_idempotency_key: z.string().trim().min(1).optional(),
    onboarding_focus: z.string().trim().min(1).optional(),
    onboarding_price_range: z.string().trim().min(1).optional(),
    onboarding_goal: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type CampaignPlanDocument = z.infer<typeof campaignPlanDocumentSchema> &
  Record<string, unknown>;

function asObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSelectedAdId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function deriveLaunchStatusFromPlanValue(value: Record<string, unknown>) {
  const runtime = asObjectRecord(value.runtime);
  const explicitLaunchStatus = normalizeOptionalText(value.launch_status);
  const metaPushStatus = normalizeOptionalText(runtime?.metaPushStatus);
  const runtimeStatus = normalizeOptionalText(runtime?.status);

  if (explicitLaunchStatus) {
    return explicitLaunchStatus;
  }

  if (metaPushStatus === "published") {
    return "live";
  }

  if (metaPushStatus === "failed") {
    return "failed";
  }

  if (metaPushStatus === "partial") {
    return "partial";
  }

  return runtimeStatus;
}

function derivePublicSlugFromPlanValue(value: Record<string, unknown>) {
  const explicitPublicSlug = normalizeOptionalText(value.public_slug);

  if (explicitPublicSlug) {
    return explicitPublicSlug;
  }

  const campaignPayload = asObjectRecord(value.campaign_payload);
  const destinationUrl = normalizeOptionalText(campaignPayload?.destination_url);

  if (!destinationUrl) {
    return null;
  }

  const match = destinationUrl.match(/\/f\/([^/?#]+)/i);
  return match?.[1]?.trim() || null;
}

function migrateCampaignPlanDocument(value: Record<string, unknown>) {
  const currentPayload = asObjectRecord(value.campaign_payload);
  const selectedAdId =
    normalizeSelectedAdId(value.selected_ad_id) ??
    normalizeSelectedAdId(currentPayload?.selected_ad_id) ??
    null;

  return {
    ...value,
    version:
      typeof value.version === "number" && Number.isFinite(value.version)
        ? value.version
        : CURRENT_CAMPAIGN_PLAN_VERSION,
    selected_ad_id: selectedAdId,
    launch_status: deriveLaunchStatusFromPlanValue(value),
    public_slug: derivePublicSlugFromPlanValue(value),
    campaign_payload: currentPayload
      ? {
          ...currentPayload,
          ...(selectedAdId ? { selected_ad_id: selectedAdId } : {}),
        }
      : currentPayload,
    lead_loop_verified: value.lead_loop_verified === true,
  };
}

export function safeParseCampaignPlanDocument(value: unknown) {
  if (!asObjectRecord(value)) {
    return campaignPlanDocumentSchema.safeParse({
      version: CURRENT_CAMPAIGN_PLAN_VERSION,
      lead_loop_verified: false,
    });
  }

  return campaignPlanDocumentSchema.safeParse(migrateCampaignPlanDocument(value as Record<string, unknown>));
}

export function readCampaignPlanDocument(value: unknown): CampaignPlanDocument {
  const parsed = safeParseCampaignPlanDocument(value);

  if (!parsed.success) {
    return {
      version: CURRENT_CAMPAIGN_PLAN_VERSION,
      lead_loop_verified: false,
    };
  }

  return parsed.data as CampaignPlanDocument;
}

export function assertCampaignPlanDocument(value: unknown): CampaignPlanDocument {
  const parsed = safeParseCampaignPlanDocument(value);

  if (!parsed.success) {
    throw new Error(`campaign_plans.plan is invalid: ${parsed.error.issues[0]?.message ?? "unknown shape"}`);
  }

  return parsed.data as CampaignPlanDocument;
}

export function getCampaignPayloadFromPlan(value: unknown) {
  return readCampaignPlanDocument(value).campaign_payload ?? null;
}

export function getSelectedAdIdFromPlan(value: unknown) {
  const plan = readCampaignPlanDocument(value);
  return normalizeSelectedAdId(plan.selected_ad_id) ??
    normalizeSelectedAdId(plan.campaign_payload?.selected_ad_id) ??
    null;
}

export function getLeadLoopVerifiedFromPlan(value: unknown) {
  return readCampaignPlanDocument(value).lead_loop_verified === true;
}

export function getLaunchStatusFromPlan(value: unknown) {
  return readCampaignPlanDocument(value).launch_status ?? null;
}

export function getPublicSlugFromPlan(value: unknown) {
  return readCampaignPlanDocument(value).public_slug ?? null;
}

export function getLaunchRuntimeFromPlan(value: unknown) {
  const plan = readCampaignPlanDocument(value);
  return plan.launch_runtime ?? null;
}

export function mergeCampaignPlanDocument(
  current: unknown,
  patch: Partial<CampaignPlanDocument>,
): CampaignPlanDocument {
  const base = readCampaignPlanDocument(current);
  const next = {
    ...base,
    ...patch,
    version: CURRENT_CAMPAIGN_PLAN_VERSION,
    runtime:
      patch.runtime === undefined
        ? base.runtime
        : {
            ...(base.runtime ?? {}),
            ...(patch.runtime ?? {}),
          },
    launch_runtime:
      patch.launch_runtime === undefined
        ? base.launch_runtime
        : {
            ...(base.launch_runtime ?? {}),
            ...(patch.launch_runtime ?? {}),
          },
    campaign_payload:
      patch.campaign_payload === undefined
        ? base.campaign_payload
        : {
            ...(base.campaign_payload ?? {}),
            ...(patch.campaign_payload ?? {}),
          },
    first_week_success:
      patch.first_week_success === undefined
        ? base.first_week_success
        : {
            ...(base.first_week_success ?? {}),
            ...(patch.first_week_success ?? {}),
          },
  };

  return assertCampaignPlanDocument({
    ...next,
    launch_status: deriveLaunchStatusFromPlanValue(next),
    public_slug: derivePublicSlugFromPlanValue(next),
  });
}

export function withSelectedAdId(current: unknown, selectedAdId: string) {
  return mergeCampaignPlanDocument(current, {
    selected_ad_id: selectedAdId,
    campaign_payload: {
      ...(getCampaignPayloadFromPlan(current) ?? {}),
      selected_ad_id: selectedAdId,
    },
  });
}

export function withLeadLoopVerified(current: unknown) {
  return mergeCampaignPlanDocument(current, {
    lead_loop_verified: true,
  });
}

export function withCampaignPayload(
  current: unknown,
  payload: Record<string, unknown>,
) {
  return mergeCampaignPlanDocument(current, {
    campaign_payload: payload,
  });
}

export function withLaunchRuntime(
  current: unknown,
  launchRuntime: Record<string, unknown>,
  runtimePatch?: Record<string, unknown>,
) {
  return mergeCampaignPlanDocument(current, {
    launch_runtime: launchRuntime,
    ...(runtimePatch ? { runtime: runtimePatch } : {}),
  });
}

export function withFirstWeekSuccess(
  current: unknown,
  firstWeekSuccess: Record<string, unknown>,
) {
  return mergeCampaignPlanDocument(current, {
    first_week_success: firstWeekSuccess,
  });
}

export function toCampaignPlanJson(document: CampaignPlanDocument) {
  return document as unknown as Json;
}

export function buildCampaignPlanCriticalFieldPatch(document: unknown) {
  const normalized = readCampaignPlanDocument(document);

  return {
    plan: toCampaignPlanJson(normalized),
    launch_status: getLaunchStatusFromPlan(normalized),
    public_slug: getPublicSlugFromPlan(normalized),
    lead_loop_verified: getLeadLoopVerifiedFromPlan(normalized),
  } as const;
}
