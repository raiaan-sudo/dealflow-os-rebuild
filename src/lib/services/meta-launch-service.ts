import { ApiError } from "@/lib/api/route";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { getMetaDailyBudgetCapCents } from "@/lib/integrations/meta/budget-cap";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import type {
  BuiltMetaAdPayload,
  BuiltMetaAdSetPayload,
  BuiltMetaCampaignPayload,
} from "@/lib/types/campaign-execution";
import { applyMetaCreativeOptOut } from "@/lib/integrations/meta/launch-payload-guardrails";

function getSelectedPageId(connection: MetaConnectionRecord) {
  const metadata = connection.connection_metadata;
  const pageId =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.selected_page_id
      : null;

  return typeof pageId === "string" && pageId.trim().length > 0 ? pageId : null;
}

function getSelectedAdAccountId(connection: MetaConnectionRecord) {
  const metadata = connection.connection_metadata;
  const accountId =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.selected_external_account_id
      : null;

  if (typeof accountId !== "string" || accountId.trim().length === 0) {
    return null;
  }

  return connection.external_account_id === accountId ? accountId : null;
}

function getSelectedPixelId(connection: MetaConnectionRecord) {
  const metadata = connection.connection_metadata;
  const pixelId =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.pixel_id
      : null;

  return typeof pixelId === "string" && pixelId.trim().length > 0 ? pixelId : null;
}

type MetaCreateResult<T> = {
  id: string;
  payload: T;
};

async function postToMeta<T>(path: string, accessToken: string, payload: Record<string, unknown>) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`);
  url.searchParams.set("access_token", accessToken);

  const { response, data } = await fetchMetaJson<
    ({ id?: string; success?: boolean; error?: { message?: string } } & T) | null
  >(url.toString(), {
    purpose: "launch_create",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta request failed.",
      "meta_request_failed",
    );
  }

  return data;
}

async function lookupMetaObjectByName(params: {
  accountId: string;
  accessToken: string;
  edge: "campaigns" | "adsets" | "adcreatives" | "ads";
  name: string;
  fields: string;
  parentField?: "account_id" | "campaign_id" | "adset_id";
  parentId?: string | null;
}) {
  const url = new URL(
    `https://graph.facebook.com/v19.0/act_${params.accountId.replace(/^act_/, "")}/${params.edge}`,
  );
  url.searchParams.set("fields", params.fields);
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<
    { data?: Array<Record<string, unknown>>; error?: { message?: string } } | null
  >(url.toString(), {
    purpose: "launch_lookup",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? `Meta ${params.edge} lookup failed.`,
      "meta_lookup_failed",
    );
  }

  const match =
    data?.data?.find((item) => {
      if (typeof item.name !== "string" || item.name.trim() !== params.name.trim()) {
        return false;
      }

      if (!params.parentField || !params.parentId) {
        return true;
      }

      const actualParent = String(item[params.parentField] ?? "").trim().replace(/^act_/, "");
      const expectedParent = params.parentId.trim().replace(/^act_/, "");
      return actualParent === expectedParent;
    }) ?? null;

  return typeof match?.id === "string" ? match.id : null;
}

async function lookupMetaObjectById(params: {
  objectId: string;
  accessToken: string;
  fields: string;
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.objectId}`);
  url.searchParams.set("fields", params.fields);
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<
    (Record<string, unknown> & { error?: { message?: string } }) | null
  >(url.toString(), {
    purpose: "launch_lookup",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta object lookup failed.",
      "meta_lookup_failed",
    );
  }

  return data;
}

function isPausedMetaStatus(value: unknown) {
  return typeof value === "string" && value.toUpperCase().includes("PAUSED");
}

async function ensureMetaObjectPaused(params: {
  objectId: string;
  accessToken: string;
  edge: "campaigns" | "adsets" | "adcreatives" | "ads";
}) {
  if (params.edge === "adcreatives") {
    return;
  }

  const current = await lookupMetaObjectById({
    objectId: params.objectId,
    accessToken: params.accessToken,
    fields: "id,status,effective_status",
  });

  if (isPausedMetaStatus(current?.status)) {
    return;
  }

  await updateMetaStatus(params.objectId, params.accessToken, "PAUSED");

  const updated = await lookupMetaObjectById({
    objectId: params.objectId,
    accessToken: params.accessToken,
    fields: "id,status,effective_status",
  });

  if (!isPausedMetaStatus(updated?.status) && !isPausedMetaStatus(updated?.effective_status)) {
    throw new ApiError(
      502,
      `Meta object ${params.objectId} could not be verified PAUSED after creation/recovery.`,
      "meta_paused_verification_failed",
    );
  }
}

async function createOrRecoverMetaObject<T>(params: {
  accountId: string;
  accessToken: string;
  edge: "campaigns" | "adsets" | "adcreatives" | "ads";
  path: string;
  payload: Record<string, unknown>;
  name: string;
  fields: string;
  parentField?: "account_id" | "campaign_id" | "adset_id";
  parentId?: string | null;
  missingIdMessage: string;
  missingIdCode: string;
}) {
  const recoveredId = await lookupMetaObjectByName({
    accountId: params.accountId,
    accessToken: params.accessToken,
    edge: params.edge,
    name: params.name,
    fields: params.fields,
    parentField: params.parentField,
    parentId: params.parentId,
  });

  if (recoveredId) {
    await ensureMetaObjectPaused({
      objectId: recoveredId,
      accessToken: params.accessToken,
      edge: params.edge,
    });

    return { id: recoveredId, recovered: true };
  }

  const data = await postToMeta<{ id?: string } & T>(
    params.path,
    params.accessToken,
    params.payload,
  );

  if (!data?.id) {
    throw new ApiError(502, params.missingIdMessage, params.missingIdCode);
  }

  await ensureMetaObjectPaused({
    objectId: data.id,
    accessToken: params.accessToken,
    edge: params.edge,
  });

  return { id: data.id, recovered: false };
}

function forcePausedPayload<T extends Record<string, unknown>>(payload: T): T & { status: "PAUSED" } {
  if (payload.status && payload.status !== "PAUSED") {
    throw new ApiError(
      400,
      "Meta launch safety requires all created objects to be PAUSED.",
      "meta_active_status_blocked",
    );
  }

  return {
    ...payload,
    status: "PAUSED",
  };
}

function assertBudgetSafety(payload: BuiltMetaAdSetPayload) {
  const dailyBudget = Number(payload.daily_budget ?? 0);
  const lifetimeBudget = Number(payload.lifetime_budget ?? 0);

  if (dailyBudget <= 0 && lifetimeBudget <= 0) {
    throw new ApiError(
      400,
      "Meta launch requires a positive daily or lifetime budget.",
      "meta_budget_missing",
    );
  }

  getMetaDailyBudgetCapCents();
}

async function updateMetaStatus(
  objectId: string,
  accessToken: string,
  status: "PAUSED",
) {
  const data = await postToMeta<{ success?: boolean }>(objectId, accessToken, { status });

  if (!data?.success) {
    throw new ApiError(
      502,
      `Meta object ${objectId} could not be set to ${status}.`,
      "meta_status_update_failed",
    );
  }

  return data;
}

export async function createMetaCampaign(params: {
  connection: MetaConnectionRecord;
  payload: BuiltMetaCampaignPayload;
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = getSelectedAdAccountId(params.connection);

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const payload = forcePausedPayload(params.payload as unknown as Record<string, unknown>);
  const data = await createOrRecoverMetaObject({
    accountId,
    accessToken,
    edge: "campaigns",
    path: `act_${accountId}/campaigns`,
    payload,
    name: String(payload.name),
    fields: "id,name",
    missingIdMessage: "Meta campaign creation failed.",
    missingIdCode: "meta_campaign_create_failed",
  });

  return {
    id: data.id,
    payload: payload as unknown as BuiltMetaCampaignPayload,
  } satisfies MetaCreateResult<BuiltMetaCampaignPayload>;
}

export async function createMetaAdSet(params: {
  connection: MetaConnectionRecord;
  campaignId: string;
  payload: BuiltMetaAdSetPayload;
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = getSelectedAdAccountId(params.connection);

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  if (!getSelectedPixelId(params.connection)) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  assertBudgetSafety(params.payload);
  const payload = forcePausedPayload({
    ...params.payload,
    campaign_id: params.campaignId,
  } as unknown as Record<string, unknown>);
  const data = await createOrRecoverMetaObject({
    accountId,
    accessToken,
    edge: "adsets",
    path: `act_${accountId}/adsets`,
    payload,
    name: String(payload.name),
    fields: "id,name,campaign_id",
    parentField: "campaign_id",
    parentId: params.campaignId,
    missingIdMessage: "Meta ad set creation failed.",
    missingIdCode: "meta_adset_create_failed",
  });

  return {
    id: data.id,
    payload: payload as unknown as BuiltMetaAdSetPayload,
  } satisfies MetaCreateResult<BuiltMetaAdSetPayload>;
}

export async function createMetaCreative(params: {
  connection: MetaConnectionRecord;
  payload: BuiltMetaAdPayload["creativePayload"];
}) {
  const accountId = getSelectedAdAccountId(params.connection);

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const accessToken = getMetaAccessToken(params.connection);
  const objectStorySpec =
    params.payload.object_story_spec &&
    typeof params.payload.object_story_spec === "object" &&
    !Array.isArray(params.payload.object_story_spec)
      ? (params.payload.object_story_spec as Record<string, unknown>)
      : null;
  const pageId =
    typeof objectStorySpec?.page_id === "string" &&
    objectStorySpec.page_id.trim().length > 0
      ? objectStorySpec.page_id
      : getSelectedPageId(params.connection);

  if (!pageId) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  const payload = applyMetaCreativeOptOut({
    ...(params.payload as Record<string, unknown>),
    object_story_spec: {
      ...(objectStorySpec ?? {}),
      page_id: pageId,
    },
  }) as BuiltMetaAdPayload["creativePayload"];
  const data = await createOrRecoverMetaObject({
    accountId,
    accessToken,
    edge: "adcreatives",
    path: `act_${accountId}/adcreatives`,
    payload: payload as unknown as Record<string, unknown>,
    name: String(payload.name ?? ""),
    fields: "id,name",
    missingIdMessage: "Meta creative creation failed.",
    missingIdCode: "meta_creative_create_failed",
  });

  return {
    id: data.id,
    payload,
  };
}

export async function createMetaAd(params: {
  connection: MetaConnectionRecord;
  adSetId: string;
  creativeId: string;
  payload: BuiltMetaAdPayload["adPayload"];
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = getSelectedAdAccountId(params.connection);

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const payload = forcePausedPayload({
    ...params.payload,
    adset_id: params.adSetId,
    creative: {
      creative_id: params.creativeId,
    },
  } as unknown as Record<string, unknown>);
  const data = await createOrRecoverMetaObject({
    accountId,
    accessToken,
    edge: "ads",
    path: `act_${accountId}/ads`,
    payload,
    name: String(payload.name),
    fields: "id,name,adset_id",
    parentField: "adset_id",
    parentId: params.adSetId,
    missingIdMessage: "Meta ad creation failed.",
    missingIdCode: "meta_ad_create_failed",
  });

  return {
    id: data.id,
    payload: payload as unknown as BuiltMetaAdPayload["adPayload"],
  };
}

export async function publishMetaCampaignIfNeeded(params: {
  connection: MetaConnectionRecord;
  startImmediately: boolean;
  campaignId: string;
  adSetIds: string[];
  adIds: string[];
}) {
  return {
    published: false,
    status: "paused" as const,
  };
}
