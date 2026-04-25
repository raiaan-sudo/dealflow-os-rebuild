import { ApiError } from "@/lib/api/route";
import { fetchWithRetryServer } from "@/lib/http/fetch-with-retry-server";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import type {
  BuiltMetaAdPayload,
  BuiltMetaAdSetPayload,
  BuiltMetaCampaignPayload,
} from "@/lib/types/campaign-execution";

type MetaCreateResult<T> = {
  id: string;
  payload: T;
};

async function parseMetaResponse<T>(response: Response, fallbackCode: string, fallbackMessage: string) {
  const data = (await response.json().catch(() => null)) as
    | ({ id?: string; success?: boolean; error?: { message?: string } } & T)
    | null;

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? fallbackMessage,
      fallbackCode,
    );
  }

  return data;
}

async function postToMeta<T>(path: string, accessToken: string, payload: Record<string, unknown>) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`);
  url.searchParams.set("access_token", accessToken);

  const response = await fetchWithRetryServer(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseMetaResponse<T>(response, "meta_request_failed", "Meta request failed.");
}

async function updateMetaStatus(
  objectId: string,
  accessToken: string,
  status: "ACTIVE" | "PAUSED",
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

async function getMetaPageId(accessToken: string) {
  const url = new URL("https://graph.facebook.com/v19.0/me/accounts");
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", accessToken);

  const response = await fetchWithRetryServer(url.toString());
  const data = await parseMetaResponse<{ data?: Array<{ id: string; name: string }> }>(
    response,
    "meta_page_lookup_failed",
    "Meta page lookup failed.",
  );
  const pageId = data?.data?.[0]?.id;

  if (!pageId) {
    throw new ApiError(
      400,
      "Meta connection does not have an accessible Facebook Page for ad publishing.",
      "meta_page_missing",
    );
  }

  return pageId;
}

export async function createMetaCampaign(params: {
  connection: MetaConnectionRecord;
  payload: BuiltMetaCampaignPayload;
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = params.connection.external_account_id;

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const data = await postToMeta<{ id?: string }>(
    `act_${accountId}/campaigns`,
    accessToken,
    params.payload,
  );

  if (!data?.id) {
    throw new ApiError(502, "Meta campaign creation failed.", "meta_campaign_create_failed");
  }

  return {
    id: data.id,
    payload: params.payload,
  } satisfies MetaCreateResult<BuiltMetaCampaignPayload>;
}

export async function createMetaAdSet(params: {
  connection: MetaConnectionRecord;
  campaignId: string;
  payload: BuiltMetaAdSetPayload;
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = params.connection.external_account_id;

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const data = await postToMeta<{ id?: string }>(
    `act_${accountId}/adsets`,
    accessToken,
    {
      ...params.payload,
      campaign_id: params.campaignId,
    },
  );

  if (!data?.id) {
    throw new ApiError(502, "Meta ad set creation failed.", "meta_adset_create_failed");
  }

  return {
    id: data.id,
    payload: params.payload,
  } satisfies MetaCreateResult<BuiltMetaAdSetPayload>;
}

export async function createMetaCreative(params: {
  connection: MetaConnectionRecord;
  payload: BuiltMetaAdPayload["creativePayload"];
}) {
  const accessToken = getMetaAccessToken(params.connection);
  const accountId = params.connection.external_account_id;

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const pageId = await getMetaPageId(accessToken);
  const payload = {
    ...params.payload,
    object_story_spec: {
      ...params.payload.object_story_spec,
      page_id: pageId,
    },
  };
  const data = await postToMeta<{ id?: string }>(
    `act_${accountId}/adcreatives`,
    accessToken,
    payload,
  );

  if (!data?.id) {
    throw new ApiError(502, "Meta creative creation failed.", "meta_creative_create_failed");
  }

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
  const accountId = params.connection.external_account_id;

  if (!accountId) {
    throw new ApiError(
      400,
      "Meta account is missing an external ad account ID.",
      "meta_account_missing",
    );
  }

  const data = await postToMeta<{ id?: string }>(
    `act_${accountId}/ads`,
    accessToken,
    {
      ...params.payload,
      adset_id: params.adSetId,
      creative: {
        creative_id: params.creativeId,
      },
    },
  );

  if (!data?.id) {
    throw new ApiError(502, "Meta ad creation failed.", "meta_ad_create_failed");
  }

  return {
    id: data.id,
    payload: params.payload,
  };
}

export async function publishMetaCampaignIfNeeded(params: {
  connection: MetaConnectionRecord;
  startImmediately: boolean;
  campaignId: string;
  adSetIds: string[];
  adIds: string[];
}) {
  if (!params.startImmediately) {
    return {
      published: false,
      status: "paused" as const,
    };
  }

  const accessToken = getMetaAccessToken(params.connection);

  for (const adSetId of params.adSetIds) {
    await updateMetaStatus(adSetId, accessToken, "ACTIVE");
  }

  for (const adId of params.adIds) {
    await updateMetaStatus(adId, accessToken, "ACTIVE");
  }

  await updateMetaStatus(params.campaignId, accessToken, "ACTIVE");

  return {
    published: true,
    status: "active" as const,
  };
}
