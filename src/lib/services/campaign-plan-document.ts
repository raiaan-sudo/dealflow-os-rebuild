import { z } from "zod";
import type { Json } from "@/lib/supabase/types";
import {
  getCampaignLanguageProfile,
  normalizeCampaignLanguage,
} from "@/lib/services/campaign-language";

export const CURRENT_CAMPAIGN_PLAN_VERSION = 3;

const campaignPayloadSchema = z
  .object({
    selected_ad_id: z.string().trim().min(1).nullable().optional(),
    selected_ad_ids: z.array(z.string().trim().min(1)).max(6).optional(),
    selected_ugc_video_id: z.string().trim().min(1).nullable().optional(),
    selected_ugc_video_ids: z.array(z.string().trim().min(1)).max(3).optional(),
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
    selected_ad_ids: z.array(z.string().trim().min(1)).max(6).optional(),
    selected_ugc_video_id: z.string().trim().min(1).nullable().optional(),
    selected_ugc_video_ids: z.array(z.string().trim().min(1)).max(3).optional(),
    lead_loop_verified: z.boolean().optional().default(false),
    launch_status: z.string().trim().min(1).nullable().optional(),
    public_slug: z.string().trim().min(1).nullable().optional(),
    campaign_payload: campaignPayloadSchema.nullable().optional(),
    launch_runtime: launchRuntimeSchema.nullable().optional(),
    runtime: runtimeSchema.nullable().optional(),
    first_week_success: z.record(z.string(), z.unknown()).nullable().optional(),
    onboarding_idempotency_key: z.string().trim().min(1).optional(),
    onboarding_focus: z.string().trim().min(1).optional(),
    onboarding_price_range: z.string().trim().min(1).optional(),
    onboarding_goal: z.string().trim().min(1).optional(),
    language_code: z.enum(["en", "fr", "es"]).optional().default("en"),
    campaign_language: z.record(z.string(), z.unknown()).nullable().optional(),
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

function normalizeSelectedIds(value: unknown, max: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeSelectedAdId(item))
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, max);
}

function normalizeSelectedAdIds(value: unknown) {
  return normalizeSelectedIds(value, 6);
}

function normalizeSelectedUgcVideoIds(value: unknown) {
  return normalizeSelectedIds(value, 3);
}

function normalizeSelectedIdsFromSources(max: number, ...values: unknown[]) {
  return Array.from(
    new Set(values.flatMap((value) => normalizeSelectedIds(value, max))),
  ).slice(0, max);
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
  const camelPayload = asObjectRecord(value.campaignPayload);
  const nestedPlan = asObjectRecord(value.plan);
  const nestedPayload = asObjectRecord(nestedPlan?.campaign_payload) ?? asObjectRecord(nestedPlan?.campaignPayload);
  const currentLaunchRuntime = asObjectRecord(value.launch_runtime);
  const currentRuntime = asObjectRecord(value.runtime);
  const currentFirstWeekSuccess = asObjectRecord(value.first_week_success);
  const campaignPayload = currentPayload ?? camelPayload ?? nestedPayload;
  const languageProfile = getCampaignLanguageProfile(
    value.language_code ??
      value.languageCode ??
      campaignPayload?.language_code ??
      campaignPayload?.languageCode ??
      nestedPlan?.language_code ??
      nestedPlan?.languageCode,
  );
  const hasVersion = Object.hasOwn(value, "version");
  const hasLeadLoopVerified = Object.hasOwn(value, "lead_loop_verified");
  const selectedAdId =
    normalizeSelectedAdId(value.selected_ad_id) ??
    normalizeSelectedAdId(value.selectedAdId) ??
    normalizeSelectedAdId(currentPayload?.selected_ad_id) ??
    normalizeSelectedAdId(currentPayload?.selectedAdId) ??
    normalizeSelectedAdId(camelPayload?.selected_ad_id) ??
    normalizeSelectedAdId(camelPayload?.selectedAdId) ??
    normalizeSelectedAdId(nestedPlan?.selected_ad_id) ??
    normalizeSelectedAdId(nestedPlan?.selectedAdId) ??
    normalizeSelectedAdId(nestedPayload?.selected_ad_id) ??
    normalizeSelectedAdId(nestedPayload?.selectedAdId) ??
    null;
  const selectedAdIds = normalizeSelectedIdsFromSources(
    6,
    value.selected_ad_ids,
    value.selectedAdIds,
    nestedPlan?.selected_ad_ids,
    nestedPlan?.selectedAdIds,
  );
  const payloadSelectedAdIds = normalizeSelectedIdsFromSources(
    6,
    currentPayload?.selected_ad_ids,
    currentPayload?.selectedAdIds,
    camelPayload?.selected_ad_ids,
    camelPayload?.selectedAdIds,
    nestedPayload?.selected_ad_ids,
    nestedPayload?.selectedAdIds,
  );
  const mergedSelectedAdIds = [
    ...(selectedAdIds.length > 0 ? selectedAdIds : payloadSelectedAdIds),
    ...(selectedAdId ? [selectedAdId] : []),
  ].filter((item, index, list) => list.indexOf(item) === index).slice(0, 6);
  const selectedUgcVideoId =
    normalizeSelectedAdId(value.selected_ugc_video_id) ??
    normalizeSelectedAdId(value.selectedUgcVideoId) ??
    normalizeSelectedAdId(currentPayload?.selected_ugc_video_id) ??
    normalizeSelectedAdId(currentPayload?.selectedUgcVideoId) ??
    normalizeSelectedAdId(camelPayload?.selected_ugc_video_id) ??
    normalizeSelectedAdId(camelPayload?.selectedUgcVideoId) ??
    normalizeSelectedAdId(nestedPlan?.selected_ugc_video_id) ??
    normalizeSelectedAdId(nestedPlan?.selectedUgcVideoId) ??
    normalizeSelectedAdId(nestedPayload?.selected_ugc_video_id) ??
    normalizeSelectedAdId(nestedPayload?.selectedUgcVideoId) ??
    null;
  const selectedUgcVideoIds = normalizeSelectedIdsFromSources(
    3,
    value.selected_ugc_video_ids,
    value.selectedUgcVideoIds,
    nestedPlan?.selected_ugc_video_ids,
    nestedPlan?.selectedUgcVideoIds,
  );
  const payloadSelectedUgcVideoIds = normalizeSelectedIdsFromSources(
    3,
    currentPayload?.selected_ugc_video_ids,
    currentPayload?.selectedUgcVideoIds,
    camelPayload?.selected_ugc_video_ids,
    camelPayload?.selectedUgcVideoIds,
    nestedPayload?.selected_ugc_video_ids,
    nestedPayload?.selectedUgcVideoIds,
  );
  const mergedSelectedUgcVideoIds = [
    ...(selectedUgcVideoIds.length > 0 ? selectedUgcVideoIds : payloadSelectedUgcVideoIds),
    ...(selectedUgcVideoId ? [selectedUgcVideoId] : []),
  ].filter((item, index, list) => list.indexOf(item) === index).slice(0, 3);

  return {
    ...value,
    version:
      hasVersion
        ? value.version
        : CURRENT_CAMPAIGN_PLAN_VERSION,
    selected_ad_id: selectedAdId,
    selected_ad_ids: mergedSelectedAdIds,
    selected_ugc_video_id: selectedUgcVideoId,
    selected_ugc_video_ids: mergedSelectedUgcVideoIds,
    launch_status: deriveLaunchStatusFromPlanValue(value),
    public_slug: derivePublicSlugFromPlanValue(value),
    language_code: languageProfile.code,
    campaign_language: languageProfile,
    runtime: currentRuntime ?? undefined,
    launch_runtime: currentLaunchRuntime ?? undefined,
    first_week_success: currentFirstWeekSuccess ?? undefined,
    campaign_payload: currentPayload
      ? {
          ...currentPayload,
          ...(selectedAdId ? { selected_ad_id: selectedAdId } : {}),
          ...(mergedSelectedAdIds.length > 0 ? { selected_ad_ids: mergedSelectedAdIds } : {}),
          ...(selectedUgcVideoId ? { selected_ugc_video_id: selectedUgcVideoId } : {}),
          ...(mergedSelectedUgcVideoIds.length > 0 ? { selected_ugc_video_ids: mergedSelectedUgcVideoIds } : {}),
          language_code: languageProfile.code,
          campaign_language: languageProfile,
        }
      : undefined,
    lead_loop_verified: hasLeadLoopVerified ? value.lead_loop_verified : false,
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
      language_code: "en",
      campaign_language: getCampaignLanguageProfile("en"),
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

export function getSelectedAdIdsFromPlan(value: unknown) {
  const plan = readCampaignPlanDocument(value);
  const ids = [
    ...normalizeSelectedAdIds(plan.selected_ad_ids),
    ...normalizeSelectedAdIds(plan.campaign_payload?.selected_ad_ids),
    ...(normalizeSelectedAdId(plan.selected_ad_id) ? [normalizeSelectedAdId(plan.selected_ad_id) as string] : []),
    ...(normalizeSelectedAdId(plan.campaign_payload?.selected_ad_id)
      ? [normalizeSelectedAdId(plan.campaign_payload?.selected_ad_id) as string]
      : []),
  ].filter((item, index, list) => list.indexOf(item) === index);

  return ids.slice(0, 6);
}

export function getSelectedUgcVideoIdFromPlan(value: unknown) {
  const plan = readCampaignPlanDocument(value);
  return normalizeSelectedAdId(plan.selected_ugc_video_id) ??
    normalizeSelectedAdId(plan.campaign_payload?.selected_ugc_video_id) ??
    null;
}

export function getSelectedUgcVideoIdsFromPlan(value: unknown) {
  const plan = readCampaignPlanDocument(value);
  const ids = [
    ...normalizeSelectedUgcVideoIds(plan.selected_ugc_video_ids),
    ...normalizeSelectedUgcVideoIds(plan.campaign_payload?.selected_ugc_video_ids),
    ...(normalizeSelectedAdId(plan.selected_ugc_video_id) ? [normalizeSelectedAdId(plan.selected_ugc_video_id) as string] : []),
    ...(normalizeSelectedAdId(plan.campaign_payload?.selected_ugc_video_id)
      ? [normalizeSelectedAdId(plan.campaign_payload?.selected_ugc_video_id) as string]
      : []),
  ].filter((item, index, list) => list.indexOf(item) === index);

  return ids.slice(0, 3);
}

export function getLeadLoopVerifiedFromPlan(value: unknown) {
  return readCampaignPlanDocument(value).lead_loop_verified === true;
}

export function getCampaignLanguageFromPlan(value: unknown) {
  return normalizeCampaignLanguage(readCampaignPlanDocument(value).language_code);
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
  return withSelectedAdIds(current, [selectedAdId]);
}

export function withSelectedAdIds(current: unknown, selectedAdIds: string[]) {
  const normalizedIds = normalizeSelectedAdIds(selectedAdIds);
  const primarySelectedAdId = normalizedIds[0] ?? "";

  return mergeCampaignPlanDocument(current, {
    selected_ad_ids: normalizedIds,
    selected_ad_id: primarySelectedAdId || null,
    campaign_payload: {
      ...(getCampaignPayloadFromPlan(current) ?? {}),
      selected_ad_id: primarySelectedAdId || null,
      selected_ad_ids: normalizedIds,
    },
  });
}

export function withSelectedLaunchMedia(
  current: unknown,
  selection: {
    selectedAdIds: string[];
    selectedUgcVideoIds?: string[];
  },
) {
  const normalizedAdIds = normalizeSelectedAdIds(selection.selectedAdIds);
  const primarySelectedAdId = normalizedAdIds[0] ?? "";
  const normalizedUgcVideoIds = normalizeSelectedUgcVideoIds(selection.selectedUgcVideoIds ?? []);
  const primarySelectedUgcVideoId = normalizedUgcVideoIds[0] ?? "";

  return mergeCampaignPlanDocument(current, {
    selected_ad_ids: normalizedAdIds,
    selected_ad_id: primarySelectedAdId || null,
    selected_ugc_video_ids: normalizedUgcVideoIds,
    selected_ugc_video_id: primarySelectedUgcVideoId || null,
    campaign_payload: {
      ...(getCampaignPayloadFromPlan(current) ?? {}),
      selected_ad_id: primarySelectedAdId || null,
      selected_ad_ids: normalizedAdIds,
      selected_ugc_video_id: primarySelectedUgcVideoId || null,
      selected_ugc_video_ids: normalizedUgcVideoIds,
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
  const metaPushStatus = normalizeOptionalText(runtimePatch?.metaPushStatus);
  const runtimeStatus = normalizeOptionalText(runtimePatch?.status);
  const launchStatus =
    metaPushStatus === "published"
      ? "live"
      : metaPushStatus === "failed"
        ? "failed"
        : runtimeStatus === "launching"
          ? "launching"
          : runtimeStatus;

  return mergeCampaignPlanDocument(current, {
    launch_runtime: launchRuntime,
    ...(launchStatus ? { launch_status: launchStatus } : {}),
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
