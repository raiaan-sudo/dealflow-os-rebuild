import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { getMetaEnvOrThrow, getPublicAppUrl } from "@/lib/env";
import {
  buildMetaGraphUrl,
  isMetaLiveWriteAllowed,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import { resolveMetaInstantFormQualificationQuestions } from "@/lib/meta-instant-form-qualification";

type ProvisioningClaim = {
  provisioning_id: string;
  acquired: boolean;
  provisioning_status: string;
  provider_form_id: string | null;
  processing_generation: number;
  provider_mutation_state: string;
  subscription_state: string;
  processing_locked_until: string | null;
};

type MetaFormQuestion = {
  type: "FULL_NAME" | "EMAIL" | "PHONE" | "CUSTOM";
  key: string;
  label?: string;
};

type MetaInstantFormListResponse = {
  data?: Array<{ id?: string; name?: string; status?: string }>;
  paging?: { cursors?: { after?: unknown } };
  error?: { message?: string };
};

function selectedPageId(connection: MetaConnectionRecord | undefined, explicitPageId?: string) {
  const value = explicitPageId ?? connection?.connection_metadata?.selected_page_id;
  return typeof value === "string" && /^\d{5,40}$/.test(value.trim())
    ? value.trim()
    : null;
}

function safeCustomQuestions(campaign: FullCampaignRecord) {
  const questions = Array.isArray(campaign.funnel?.customLeadFormQuestions)
    ? campaign.funnel.customLeadFormQuestions
    : [];
  const effectiveQuestions = resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: campaign.plan.lead_capture_mode,
    language: campaign.plan.language,
    customQuestions: questions,
  });
  return Array.from(
    new Set(
      effectiveQuestions
        .map((question) => question.trim().replace(/\s+/g, " ")),
    ),
  );
}

export function buildMetaInstantFormDefinition(campaign: FullCampaignRecord) {
  const questions: MetaFormQuestion[] = [
    { type: "FULL_NAME", key: "full_name" },
    { type: "EMAIL", key: "email" },
    { type: "PHONE", key: "phone" },
    ...safeCustomQuestions(campaign).map((label, index) => ({
      type: "CUSTOM" as const,
      key: `dealflow_custom_${index + 1}`,
      label,
    })),
  ];
  const privacyPolicyUrl = `${getPublicAppUrl()}/privacy`;
  const followUpActionUrl = campaign.publish.slug
    ? `${getPublicAppUrl()}/f/${campaign.publish.slug}/thank-you`
    : getPublicAppUrl();
  const stable = JSON.stringify({
    questions,
    quality: true,
    privacyPolicyUrl,
    followUpActionUrl,
  });
  const digest = createHash("sha256").update(stable).digest("hex");
  const baseName = (campaign.campaign.name || "DealFlow realtor lead form")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 140);

  return {
    digest,
    formName: `${baseName} | DealFlow ${campaign.campaign.id.slice(0, 8)} ${digest.slice(0, 8)}`,
    questions,
    privacyPolicyUrl,
    followUpActionUrl,
  };
}

async function resolvePageAccessToken(params: {
  pageId: string;
  userAccessToken: string;
}) {
  const { response, data } = await fetchMetaJson<{
    id?: string;
    access_token?: string;
    error?: { message?: string };
  }>(buildMetaGraphUrl(params.pageId, { fields: "id,access_token" }), {
    purpose: "discovery",
    ...withMetaBearerToken(params.userAccessToken),
  });

  if (!response.ok || data?.id !== params.pageId || !data.access_token?.trim()) {
    throw new ApiError(
      409,
      data?.error?.message ??
        "The selected Meta Page did not return a Page access token required for Instant Forms.",
      "meta_page_access_token_unavailable",
    );
  }
  return data.access_token.trim();
}

async function findExactForm(params: {
  pageId: string;
  pageAccessToken: string;
  formName: string;
}) {
  const matches = new Map<string, { id: string; status: string }>();
  const seenCursors = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const result = await fetchMetaJson<MetaInstantFormListResponse>(
      buildMetaGraphUrl(`${params.pageId}/leadgen_forms`, {
        fields: "id,name,status",
        limit: 100,
        ...(after ? { after } : {}),
      }),
      {
        purpose: "launch_lookup",
        ...withMetaBearerToken(params.pageAccessToken),
      },
    );
    const response = result.response;
    const data: MetaInstantFormListResponse | null = result.data;
    if (!response.ok) {
      throw new ApiError(
        502,
        data?.error?.message ?? "Meta Instant Forms could not be listed.",
        "meta_instant_form_lookup_failed",
      );
    }
    for (const form of data?.data ?? []) {
      const id = form.id?.trim() ?? "";
      if (form.name === params.formName && /^\d{5,40}$/.test(id)) {
        matches.set(id, { id, status: form.status?.trim().toUpperCase() ?? "" });
      }
    }
    if (matches.size > 1) {
      throw new ApiError(
        409,
        "More than one Meta Instant Form matches the deterministic DealFlow identity.",
        "meta_instant_form_ambiguous",
      );
    }

    const nextAfter: unknown = data?.paging?.cursors?.after;
    if (typeof nextAfter !== "string" || !/^[\x21-\x7e]{1,500}$/.test(nextAfter)) {
      const match = Array.from(matches.values())[0] ?? null;
      if (match && match.status !== "ACTIVE") {
        throw new ApiError(
          409,
          "The exact Meta Instant Form is no longer active and cannot receive leads.",
          "meta_instant_form_not_active",
        );
      }
      return match?.id ?? null;
    }
    if (seenCursors.has(nextAfter)) {
      throw new ApiError(
        502,
        "Meta Instant Form pagination returned a repeated cursor.",
        "meta_instant_form_pagination_invalid",
      );
    }
    seenCursors.add(nextAfter);
    after = nextAfter;
  }

  throw new ApiError(
    502,
    "Meta Instant Form lookup exceeded the bounded pagination window.",
    "meta_instant_form_pagination_limit",
  );
}

async function readPageLeadgenSubscription(params: {
  pageId: string;
  pageAccessToken: string;
  appId: string;
}) {
  const observedAppIds = new Set<string>();
  const seenCursors = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const result = await fetchMetaJson<{
      data?: Array<{ id?: string }>;
      paging?: { cursors?: { after?: unknown } };
      error?: { message?: string };
    }>(buildMetaGraphUrl(`${params.pageId}/subscribed_apps`, {
      fields: "id",
      limit: 100,
      ...(after ? { after } : {}),
    }), {
      purpose: "launch_lookup",
      ...withMetaBearerToken(params.pageAccessToken),
    });
    const response = result.response;
    const data: {
      data?: Array<{ id?: string }>;
      paging?: { cursors?: { after?: unknown } };
      error?: { message?: string };
    } | null = result.data;
    if (!response.ok) {
      throw new ApiError(
        response.status >= 500 || response.status === 429 ? 503 : 502,
        data?.error?.message ?? "Meta Page subscription state could not be verified.",
        response.status >= 500 || response.status === 429
          ? "meta_instant_form_subscription_lookup_ambiguous"
          : "meta_instant_form_subscription_lookup_rejected",
      );
    }
    for (const item of data?.data ?? []) {
      const id = item.id?.trim() ?? "";
      if (/^\d{5,40}$/.test(id)) observedAppIds.add(id);
    }
    const nextAfter: unknown = data?.paging?.cursors?.after;
    if (typeof nextAfter !== "string" || !/^[\x21-\x7e]{1,500}$/.test(nextAfter)) break;
    if (seenCursors.has(nextAfter)) {
      throw new ApiError(
        502,
        "Meta Page subscription pagination returned a repeated cursor.",
        "meta_instant_form_subscription_pagination_invalid",
      );
    }
    seenCursors.add(nextAfter);
    after = nextAfter;
    if (page === 19) {
      throw new ApiError(
        502,
        "Meta Page subscription lookup exceeded the bounded pagination window.",
        "meta_instant_form_subscription_pagination_limit",
      );
    }
  }
  const sortedObservedAppIds = Array.from(observedAppIds).sort();
  const subscribed = sortedObservedAppIds.includes(params.appId);
  return {
    subscribed,
    evidenceDigest: createHash("sha256").update(JSON.stringify({
      pageId: params.pageId,
      appId: params.appId,
      subscribed,
      observedAppIds: sortedObservedAppIds,
    })).digest("hex"),
  };
}

async function subscribePageLeadgen(params: {
  pageId: string;
  pageAccessToken: string;
  appId: string;
  claim: ProvisioningClaim;
  token: string;
}) {
  const before = await readPageLeadgenSubscription(params);
  if (before.subscribed) {
    await recordSubscriptionReceipt({
      claim: params.claim,
      token: params.token,
      evidenceDigest: before.evidenceDigest,
      source: "reconciled",
    });
    return;
  }
  if (params.claim.subscription_state === "armed") {
    throw new ApiError(
      503,
      "A prior Page subscription write has an ambiguous outcome and requires reconciliation.",
      "meta_instant_form_subscription_ambiguous",
    );
  }
  await armSubscriptionMutation(params.claim, params.token);
  const { response, data } = await fetchMetaJson<{
    success?: boolean;
    error?: { message?: string };
  }>(buildMetaGraphUrl(`${params.pageId}/subscribed_apps`), {
    purpose: "launch_create",
    method: "POST",
    ...withMetaBearerToken(params.pageAccessToken, {
      headers: { "Content-Type": "application/json" },
    }),
    body: JSON.stringify({ subscribed_fields: ["leadgen"] }),
  });
  if (!response.ok || data?.success !== true) {
    throw new ApiError(
      response.status >= 500 || response.status === 429 ? 503 : 502,
      data?.error?.message ?? "Meta Page leadgen webhook subscription failed.",
      response.status >= 500 || response.status === 429
        ? "meta_instant_form_subscription_ambiguous"
        : "meta_instant_form_subscription_rejected",
    );
  }
  const after = await readPageLeadgenSubscription(params);
  if (!after.subscribed) {
    throw new ApiError(
      503,
      "Meta accepted the Page subscription request but readback did not confirm the DealFlow app.",
      "meta_instant_form_subscription_ambiguous",
    );
  }
  await recordSubscriptionReceipt({
    claim: params.claim,
    token: params.token,
    evidenceDigest: after.evidenceDigest,
    source: "provider_response",
  });
}

async function assertClaimRpc(params: {
  claim: ProvisioningClaim;
  token: string;
  rpc:
    | "renew_meta_instant_form_provisioning"
    | "arm_meta_instant_form_provider_mutation"
    | "record_meta_instant_form_provider_receipt"
    | "arm_meta_instant_form_subscription_mutation"
    | "record_meta_instant_form_subscription_receipt";
  extra?: Record<string, unknown>;
  errorCode: string;
  errorMessage: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Instant Form storage is unavailable.", "service_role_missing");
  }
  const { data, error } = await (admin as any).rpc(params.rpc, {
    p_provisioning_id: params.claim.provisioning_id,
    p_processing_token: params.token,
    p_processing_generation: params.claim.processing_generation,
    ...params.extra,
  });
  if (error || data !== true) {
    throw new ApiError(409, error?.message ?? params.errorMessage, params.errorCode);
  }
}

async function renewClaim(claim: ProvisioningClaim, token: string) {
  await assertClaimRpc({
    claim,
    token,
    rpc: "renew_meta_instant_form_provisioning",
    extra: { p_lease_seconds: 300 },
    errorCode: "meta_instant_form_lease_lost",
    errorMessage: "Instant Form provisioning lease was lost.",
  });
}

async function armProviderMutation(claim: ProvisioningClaim, token: string) {
  await assertClaimRpc({
    claim,
    token,
    rpc: "arm_meta_instant_form_provider_mutation",
    errorCode: "meta_instant_form_provider_arm_failed",
    errorMessage: "Instant Form provider mutation could not be durably armed.",
  });
}

async function armSubscriptionMutation(claim: ProvisioningClaim, token: string) {
  await assertClaimRpc({
    claim,
    token,
    rpc: "arm_meta_instant_form_subscription_mutation",
    errorCode: "meta_instant_form_subscription_arm_failed",
    errorMessage: "The Page subscription provider mutation could not be durably armed.",
  });
}

async function recordSubscriptionReceipt(params: {
  claim: ProvisioningClaim;
  token: string;
  evidenceDigest: string;
  source: "provider_response" | "reconciled";
}) {
  await assertClaimRpc({
    claim: params.claim,
    token: params.token,
    rpc: "record_meta_instant_form_subscription_receipt",
    extra: {
      p_evidence_digest: params.evidenceDigest,
      p_receipt_source: params.source,
    },
    errorCode: "meta_instant_form_subscription_receipt_lost",
    errorMessage: "The Page subscription receipt could not be fenced to this claim.",
  });
}

async function recordProviderReceipt(params: {
  claim: ProvisioningClaim;
  token: string;
  providerFormId: string;
  source: "provider_response" | "reconciled";
}) {
  await assertClaimRpc({
    claim: params.claim,
    token: params.token,
    rpc: "record_meta_instant_form_provider_receipt",
    extra: {
      p_provider_form_id: params.providerFormId,
      p_receipt_source: params.source,
    },
    errorCode: "meta_instant_form_receipt_lost",
    errorMessage: "Instant Form provider receipt could not be fenced to this claim.",
  });
}

async function settle(params: {
  claim: ProvisioningClaim;
  token: string;
  outcome: "created" | "rejected" | "operator_required";
  providerFormId?: string | null;
  error?: unknown;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Instant Form settlement storage is unavailable.", "service_role_missing");
  }
  const errorMessage = params.error instanceof Error ? params.error.message : null;
  const errorCode = params.error instanceof ApiError ? params.error.code ?? null : null;
  const { data, error } = await (admin as any).rpc(
    "settle_meta_instant_form_provisioning",
    {
      p_provisioning_id: params.claim.provisioning_id,
      p_processing_token: params.token,
      p_processing_generation: params.claim.processing_generation,
      p_outcome: params.outcome,
      p_provider_form_id: params.providerFormId ?? null,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    },
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (error || row?.settled !== true) {
    throw new ApiError(
      409,
      error?.message ?? "Instant Form provisioning settlement ownership was lost.",
      "meta_instant_form_settlement_lost",
    );
  }
}

export async function ensureMetaInstantForm(params: {
  organizationId: string;
  userId: string;
  campaign: FullCampaignRecord;
  connection?: MetaConnectionRecord;
  marketingAccountId?: string;
  pageId?: string;
  userAccessToken?: string;
  expectedDefinitionDigest?: string;
  assertProviderMutationAllowed?: () => void | Promise<void>;
}) {
  if (!isMetaLiveWriteAllowed()) {
    throw new ApiError(
      403,
      "Automatic Meta Instant Form creation requires the guarded live Meta launch switch.",
      "meta_live_launch_disabled",
    );
  }
  const admin = createAdminClient();
  const pageId = selectedPageId(params.connection, params.pageId);
  const marketingAccountId = params.marketingAccountId ?? params.connection?.id;
  if (!admin || !pageId || typeof marketingAccountId !== "string") {
    throw new ApiError(
      503,
      "Meta Instant Form provisioning is missing service-role storage, a Page selection, or a marketing-account identity.",
      "meta_instant_form_config_incomplete",
    );
  }

  const definition = buildMetaInstantFormDefinition(params.campaign);
  if (
    params.expectedDefinitionDigest &&
    params.expectedDefinitionDigest !== definition.digest
  ) {
    throw new ApiError(
      409,
      "The Meta Instant Form definition changed after customer approval.",
      "meta_instant_form_definition_drift",
    );
  }
  const processingToken = crypto.randomUUID();
  const appId = getMetaEnvOrThrow().appId.trim();
  if (!/^\d{5,40}$/.test(appId)) {
    throw new ApiError(503, "Meta application identity is invalid.", "meta_instant_form_config_incomplete");
  }
  const { data: claimData, error: claimError } = await (admin as any).rpc(
    "claim_meta_instant_form_provisioning",
    {
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_campaign_id: params.campaign.campaign.id,
      p_marketing_account_id: marketingAccountId,
      p_provider_page_id: pageId,
      p_form_name: definition.formName,
      p_definition_digest: definition.digest,
      p_processing_token: processingToken,
      p_lease_seconds: 300,
    },
  );
  let claim = (Array.isArray(claimData) ? claimData[0] : claimData) as
    | ProvisioningClaim
    | null;
  if (claimError || !claim) {
    throw new ApiError(
      503,
      claimError?.message ?? "Meta Instant Form provisioning could not be claimed.",
      "meta_instant_form_claim_failed",
    );
  }
  if (
    !claim.acquired &&
    claim.provisioning_status === "created" &&
    claim.provider_form_id
  ) {
    const { data: verificationData, error: verificationError } = await (admin as any).rpc(
      "reacquire_meta_instant_form_verification",
      {
        p_provisioning_id: claim.provisioning_id,
        p_processing_token: processingToken,
        p_lease_seconds: 300,
      },
    );
    const verificationClaim = (
      Array.isArray(verificationData) ? verificationData[0] : verificationData
    ) as ProvisioningClaim | null;
    if (verificationError || !verificationClaim?.acquired) {
      throw new ApiError(
        409,
        verificationError?.message ??
          "Meta Instant Form live-state revalidation could not acquire its fenced claim.",
        "meta_instant_form_revalidation_claim_required",
      );
    }
    claim = verificationClaim;
  }
  if (!claim.acquired) {
    throw new ApiError(
      409,
      claim.provisioning_status === "operator_required"
        ? "Meta Instant Form provisioning requires operator reconciliation before retry."
        : claim.provisioning_status === "created"
          ? "Meta Instant Form live-state revalidation could not acquire its fenced claim."
        : "Meta Instant Form provisioning is already in progress.",
      claim.provisioning_status === "operator_required"
        ? "meta_instant_form_operator_required"
        : claim.provisioning_status === "created"
          ? "meta_instant_form_revalidation_claim_required"
        : "meta_instant_form_in_progress",
    );
  }

  let providerFormId = claim.provider_form_id;
  const reusedProviderForm = Boolean(providerFormId);
  try {
    const userAccessToken =
      params.userAccessToken?.trim() ||
      (params.connection ? getMetaAccessToken(params.connection) : null);
    if (!userAccessToken) {
      throw new ApiError(
        503,
        "Meta Instant Form provisioning is missing an access token.",
        "meta_instant_form_config_incomplete",
      );
    }
    await renewClaim(claim, processingToken);
    const pageAccessToken = await resolvePageAccessToken({ pageId, userAccessToken });
    await renewClaim(claim, processingToken);
    const exactLiveFormId = await findExactForm({
      pageId,
      pageAccessToken,
      formName: definition.formName,
    });
    if (providerFormId && !exactLiveFormId) {
      throw new ApiError(
        409,
        "The receipted Meta Instant Form no longer exists on the selected Page.",
        "meta_instant_form_missing",
      );
    }
    if (providerFormId && exactLiveFormId && providerFormId !== exactLiveFormId) {
      throw new ApiError(
        409,
        "The live Meta Instant Form identity conflicts with its durable provider receipt.",
        "meta_instant_form_identity_conflict",
      );
    }
    providerFormId = providerFormId ?? exactLiveFormId;
    await renewClaim(claim, processingToken);

    if (providerFormId && claim.provider_form_id !== providerFormId) {
      await recordProviderReceipt({
        claim,
        token: processingToken,
        providerFormId,
        source: "reconciled",
      });
    }

    if (!providerFormId) {
      await params.assertProviderMutationAllowed?.();
      await armProviderMutation(claim, processingToken);
      const formBody = new URLSearchParams({
        name: definition.formName,
        questions: JSON.stringify(definition.questions),
        privacy_policy: JSON.stringify({
          url: definition.privacyPolicyUrl,
          link_text: "Privacy Policy",
        }),
        follow_up_action_url: definition.followUpActionUrl,
        is_optimized_for_quality: "true",
        block_display_for_non_targeted_viewer: "true",
      });
      const { response, data } = await fetchMetaJson<{
        id?: string;
        error?: { message?: string };
      }>(buildMetaGraphUrl(`${pageId}/leadgen_forms`), {
        purpose: "launch_create",
        method: "POST",
        ...withMetaBearerToken(pageAccessToken, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
        body: formBody.toString(),
      });

      if (!response.ok) {
        const providerError = new ApiError(
          response.status >= 500 || response.status === 429 ? 503 : 502,
          data?.error?.message ?? `Meta rejected Instant Form creation with HTTP ${response.status}.`,
          response.status >= 500 || response.status === 429
            ? "meta_instant_form_creation_ambiguous"
            : "meta_instant_form_creation_rejected",
        );
        await settle({
          claim,
          token: processingToken,
          outcome:
            response.status >= 500 || response.status === 429
              ? "operator_required"
              : "rejected",
          error: providerError,
        });
        throw providerError;
      }
      providerFormId = data?.id ?? null;
      if (!providerFormId || !/^\d{5,40}$/.test(providerFormId)) {
        throw new ApiError(
          503,
          "Meta accepted Instant Form creation without a usable form ID.",
          "meta_instant_form_creation_ambiguous",
        );
      }
      await recordProviderReceipt({
        claim,
        token: processingToken,
        providerFormId,
        source: "provider_response",
      });
      await params.assertProviderMutationAllowed?.();
    }

    await renewClaim(claim, processingToken);
    await params.assertProviderMutationAllowed?.();
    await subscribePageLeadgen({
      pageId,
      pageAccessToken,
      appId,
      claim,
      token: processingToken,
    });
    await params.assertProviderMutationAllowed?.();
    await settle({
      claim,
      token: processingToken,
      outcome: "created",
      providerFormId,
    });
    return { providerFormId, reused: reusedProviderForm, definition };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "meta_instant_form_creation_rejected" ||
        error.code === "meta_instant_form_settlement_lost")
    ) {
      throw error;
    }
    await settle({
      claim,
      token: processingToken,
      outcome:
        error instanceof ApiError &&
        error.code === "meta_instant_form_subscription_rejected"
          ? "rejected"
          : "operator_required",
      providerFormId,
      error,
    }).catch(() => null);
    throw error;
  }
}
