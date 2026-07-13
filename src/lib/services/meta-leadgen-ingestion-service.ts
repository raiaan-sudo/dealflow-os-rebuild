import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { isStrongSecretValue } from "@/lib/env";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import {
  assertMetaLeadgenProviderIdentity,
  normalizeMetaLeadgenProviderLead,
  type MetaLeadgenProviderAd,
  type MetaLeadgenProviderLead,
  type MetaLeadgenWebhookEvent,
} from "@/lib/integrations/meta/leadgen-contract";
import {
  buildMetaGraphUrl,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { createVerifiedProviderLeadAndStartConversation } from "@/lib/services/lead-handler-service";
import { recordLeadTrackingEvent } from "@/lib/services/lead-tracking-service";
import { queueLeadSideEffectsJob } from "@/lib/services/system-job-service";
import type { Json } from "@/lib/supabase/types";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type AcceptedEventRow = {
  event_id: string;
  disposition:
    | "claimed"
    | "busy"
    | "duplicate_persisted"
    | "unknown_route"
    | "ambiguous_route"
    | "operator_required"
    | "identity_collision";
  processing_token: string | null;
  processing_generation: number;
  route_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  campaign_id: string | null;
  expected_ad_account_id: string | null;
  reconciliation_job_id: string | null;
};

type ReconciliationClaimRow = AcceptedEventRow & {
  marketing_account_id: string | null;
  provider_leadgen_id: string;
  provider_page_id: string;
  provider_form_id: string;
  provider_ad_id: string | null;
  payload_digest: string;
};

type RouteRow = {
  id: string;
  organization_id: string;
  user_id: string;
  campaign_id: string;
  marketing_account_id: string;
  provider_ad_account_id: string;
  provider_page_id: string;
  provider_form_id: string;
  status: string;
};

type MarketingAccountRow = {
  id: string;
  organization_id: string;
  platform: string;
  external_account_id: string | null;
  access_token_encrypted: string | null;
  connection_metadata: Record<string, unknown> | null;
};

function firstRpcRow<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as T) : null;
}

function getAdminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(
      503,
      "Meta leadgen ingestion storage is not configured.",
      "meta_leadgen_storage_unavailable",
    );
  }
  return admin;
}

function getEventDigest(event: MetaLeadgenWebhookEvent) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        providerLeadgenId: event.providerLeadgenId,
        providerPageId: event.providerPageId,
        providerFormId: event.providerFormId,
        providerAdId: event.providerAdId,
      }),
    )
    .digest("hex");
}

function requireClaimScope(row: AcceptedEventRow) {
  if (
    !row.processing_token ||
    !Number.isSafeInteger(Number(row.processing_generation)) ||
    Number(row.processing_generation) < 1 ||
    !row.route_id ||
    !row.organization_id ||
    !row.user_id ||
    !row.campaign_id ||
    !row.expected_ad_account_id
  ) {
    throw new ApiError(
      503,
      "Meta leadgen event claim is missing its exact tenant scope.",
      "meta_leadgen_claim_scope_missing",
    );
  }

  return {
    eventId: row.event_id,
    processingToken: row.processing_token,
    processingGeneration: Number(row.processing_generation),
    routeId: row.route_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    expectedAdAccountId: row.expected_ad_account_id,
  };
}

async function settleEvent(params: {
  admin: AdminClient;
  eventId: string;
  processingToken: string;
  processingGeneration: number;
  status: "pending_reconciliation" | "persisted" | "operator_required";
  providerAdAccountId?: string | null;
  providerAdId?: string | null;
  leadId?: string | null;
  reconciliationJobId?: string | null;
  sideEffectJobId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { data, error } = await (params.admin as any).rpc("settle_meta_leadgen_event", {
    p_event_id: params.eventId,
    p_processing_token: params.processingToken,
    p_processing_generation: params.processingGeneration,
    p_status: params.status,
    p_provider_ad_account_id: params.providerAdAccountId ?? null,
    p_provider_ad_id: params.providerAdId ?? null,
    p_lead_id: params.leadId ?? null,
    p_reconciliation_job_id: params.reconciliationJobId ?? null,
    p_side_effect_job_id: params.sideEffectJobId ?? null,
    p_error_code: params.errorCode ?? null,
    p_error_message: params.errorMessage ?? null,
  });

  if (error) {
    throw new ApiError(503, error.message, "meta_leadgen_settlement_failed");
  }
  if (data !== true) {
    throw new ApiError(
      409,
      "Meta leadgen event processing ownership was lost.",
      "meta_leadgen_processing_lease_lost",
    );
  }
}

async function queueReconciliationJob(params: {
  admin: AdminClient;
  eventId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  requestId: string;
}) {
  const idempotencyKey = `meta_leadgen_reconciliation:${params.eventId}`;
  const row = {
    organization_id: params.organizationId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    kind: "meta_leadgen_reconciliation",
    status: "pending",
    payload: {
      eventId: params.eventId,
      requestId: params.requestId,
      source: "meta_leadgen_webhook",
    } as Json,
    idempotency_key: idempotencyKey,
    max_attempts: 5,
  };
  const { data, error } = await params.admin
    .from("system_jobs")
    .insert(row as never)
    .select("id")
    .single();

  if (!error && data && typeof (data as { id?: unknown }).id === "string") {
    return (data as { id: string }).id;
  }

  const errorCode = error && "code" in error ? String(error.code) : null;
  if (errorCode === "23505") {
    const { data: existing, error: existingError } = await params.admin
      .from("system_jobs")
      .select("id,organization_id,user_id,campaign_id,kind")
      .eq("idempotency_key", idempotencyKey)
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
      .eq("campaign_id", params.campaignId)
      .eq("kind", "meta_leadgen_reconciliation")
      .maybeSingle();

    if (!existingError && existing && typeof (existing as { id?: unknown }).id === "string") {
      return (existing as { id: string }).id;
    }
  }

  throw new ApiError(
    503,
    error?.message ?? "Meta leadgen reconciliation could not be queued.",
    "meta_leadgen_reconciliation_queue_failed",
  );
}

export async function acceptMetaLeadgenWebhookEvent(params: {
  event: MetaLeadgenWebhookEvent;
  requestId: string;
}) {
  const admin = getAdminOrThrow();
  const workerId = `meta-leadgen-webhook:${crypto.randomUUID()}`;
  const { data, error } = await (admin as any).rpc("accept_meta_leadgen_webhook_event", {
    p_provider_leadgen_id: params.event.providerLeadgenId,
    p_provider_page_id: params.event.providerPageId,
    p_provider_form_id: params.event.providerFormId,
    p_provider_ad_id: params.event.providerAdId,
    p_provider_created_at: params.event.providerCreatedAt,
    p_payload_digest: getEventDigest(params.event),
    p_worker_id: workerId,
    p_lease_ms: 60_000,
  });
  const accepted = firstRpcRow<AcceptedEventRow>(data);

  if (error || !accepted?.event_id) {
    throw new ApiError(
      503,
      error?.message ?? "Meta leadgen event was not durably accepted.",
      "meta_leadgen_accept_failed",
    );
  }

  if (accepted.disposition !== "claimed") {
    logOperationalEvent("meta_leadgen.webhook_event_reused", {
      requestId: params.requestId,
      eventId: accepted.event_id,
      disposition: accepted.disposition,
      organizationId: accepted.organization_id,
      campaignId: accepted.campaign_id,
    });
    return {
      eventId: accepted.event_id,
      disposition: accepted.disposition,
      queued: accepted.disposition === "busy",
      reconciliationJobId: accepted.reconciliation_job_id,
    };
  }

  const claim = requireClaimScope(accepted);
  try {
    const reconciliationJobId = await queueReconciliationJob({
      admin,
      eventId: claim.eventId,
      organizationId: claim.organizationId,
      userId: claim.userId,
      campaignId: claim.campaignId,
      requestId: params.requestId,
    });

    await settleEvent({
      admin,
      eventId: claim.eventId,
      processingToken: claim.processingToken,
      processingGeneration: claim.processingGeneration,
      status: "pending_reconciliation",
      reconciliationJobId,
    });

    logOperationalEvent("meta_leadgen.webhook_event_queued", {
      requestId: params.requestId,
      eventId: claim.eventId,
      organizationId: claim.organizationId,
      campaignId: claim.campaignId,
      reconciliationJobId,
      communicationsEnabled: false,
      capiEnabled: false,
      providerMutationEnabled: false,
    });

    return {
      eventId: claim.eventId,
      disposition: "queued" as const,
      queued: true,
      reconciliationJobId,
    };
  } catch (queueError) {
    await settleEvent({
      admin,
      eventId: claim.eventId,
      processingToken: claim.processingToken,
      processingGeneration: claim.processingGeneration,
      status: "operator_required",
      errorCode: "meta_leadgen_reconciliation_queue_failed",
      errorMessage:
        queueError instanceof Error ? queueError.message : "Reconciliation queue failed.",
    }).catch(() => null);
    throw queueError;
  }
}

async function loadExactRouteAndAccount(params: {
  admin: AdminClient;
  claim: ReturnType<typeof requireClaimScope> & { marketingAccountId: string };
  providerPageId: string;
  providerFormId: string;
}) {
  const { data: routeData, error: routeError } = await params.admin
    .from("meta_leadgen_routes")
    .select(
      "id,organization_id,user_id,campaign_id,marketing_account_id,provider_ad_account_id,provider_page_id,provider_form_id,status",
    )
    .eq("id", params.claim.routeId)
    .eq("organization_id", params.claim.organizationId)
    .eq("user_id", params.claim.userId)
    .eq("campaign_id", params.claim.campaignId)
    .eq("marketing_account_id", params.claim.marketingAccountId)
    .eq("provider_page_id", params.providerPageId)
    .eq("provider_form_id", params.providerFormId)
    .eq("status", "active")
    .maybeSingle();
  const route = routeData as RouteRow | null;

  if (routeError || !route) {
    throw new ApiError(
      409,
      routeError?.message ?? "Meta leadgen route changed before reconciliation.",
      "meta_leadgen_route_scope_lost",
    );
  }

  const { data: accountData, error: accountError } = await params.admin
    .from("marketing_accounts")
    .select(
      "id,organization_id,platform,external_account_id,access_token_encrypted,connection_metadata",
    )
    .eq("id", route.marketing_account_id)
    .eq("organization_id", route.organization_id)
    .eq("platform", "meta_ads")
    .maybeSingle();
  const account = accountData as MarketingAccountRow | null;
  const selectedPageId =
    account?.connection_metadata &&
    typeof account.connection_metadata.selected_page_id === "string"
      ? account.connection_metadata.selected_page_id
      : null;

  if (
    accountError ||
    !account ||
    !account.access_token_encrypted ||
    account.external_account_id?.replace(/^act_/, "") !==
      route.provider_ad_account_id.replace(/^act_/, "") ||
    selectedPageId !== route.provider_page_id
  ) {
    throw new ApiError(
      409,
      accountError?.message ?? "Meta leadgen account identity no longer matches the route.",
      "meta_leadgen_marketing_scope_lost",
    );
  }

  return { route, account };
}

async function fetchProviderLeadAndAd(params: {
  accessToken: string;
  providerLeadgenId: string;
  requestId: string;
}) {
  const leadUrl = buildMetaGraphUrl(params.providerLeadgenId, {
    fields: "id,created_time,ad_id,form_id,field_data",
  });
  const { response: leadResponse, data: leadData } = await fetchMetaJson<
    (MetaLeadgenProviderLead & { error?: { message?: string } }) | null
  >(leadUrl, {
    purpose: "lead_lookup",
    requestId: params.requestId,
    ...withMetaBearerToken(params.accessToken, {
      headers: { Accept: "application/json" },
    }),
  });

  if (!leadResponse.ok || !leadData?.ad_id) {
    const retryable = leadResponse.status === 404 || leadResponse.status === 408 || leadResponse.status === 429 || leadResponse.status >= 500;
    throw new ApiError(
      retryable ? 503 : 409,
      "Meta leadgen lookup did not return a usable lead.",
      retryable
        ? "meta_leadgen_provider_lookup_unavailable"
        : "meta_leadgen_provider_lookup_rejected",
    );
  }

  const adUrl = buildMetaGraphUrl(leadData.ad_id, { fields: "id,account_id" });
  const { response: adResponse, data: adData } = await fetchMetaJson<
    (MetaLeadgenProviderAd & { error?: { message?: string } }) | null
  >(adUrl, {
    purpose: "lead_lookup",
    requestId: params.requestId,
    ...withMetaBearerToken(params.accessToken, {
      headers: { Accept: "application/json" },
    }),
  });

  if (!adResponse.ok || !adData) {
    const retryable = adResponse.status === 404 || adResponse.status === 408 || adResponse.status === 429 || adResponse.status >= 500;
    throw new ApiError(
      retryable ? 503 : 409,
      "Meta ad identity lookup was unavailable.",
      retryable
        ? "meta_leadgen_provider_lookup_unavailable"
        : "meta_leadgen_provider_lookup_rejected",
    );
  }

  return { providerLead: leadData, providerAd: adData };
}

async function queueGhlOnlyLeadEffects(params: {
  requestId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  lead: Record<string, unknown> & { id: string };
}) {
  const job = await queueLeadSideEffectsJob({
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    payload: {
      requestId: params.requestId,
      // Native Meta forms do not contain DealFlow's SMS or advertising-event
      // consent. CRM delivery is operational storage, so it is the only effect
      // requested here and remains fenced by the exact GHL tenant gate.
      enabledEffects: ["ghl_delivery"],
      requiredEffects: ["ghl_delivery"],
      advertisingConsent: null,
      lead: {
        ...params.lead,
        organization_id: params.organizationId,
        campaign_id: params.campaignId,
      },
    },
  });
  return job.id;
}

function isRetryableLookupError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "meta_leadgen_provider_lookup_unavailable" || error.status >= 500)
  );
}

export async function reconcileMetaLeadgenEvent(params: {
  eventId: string;
  requestId: string;
  workerId: string;
  terminalOnFailure?: boolean;
}) {
  const admin = getAdminOrThrow();
  const { data, error } = await (admin as any).rpc("claim_meta_leadgen_reconciliation", {
    p_event_id: params.eventId,
    p_worker_id: params.workerId,
    p_lease_ms: 300_000,
  });
  const claimed = firstRpcRow<ReconciliationClaimRow>(data);

  if (error || !claimed?.event_id) {
    throw new ApiError(
      503,
      error?.message ?? "Meta leadgen reconciliation could not be claimed.",
      "meta_leadgen_reconciliation_claim_failed",
    );
  }
  if (claimed.disposition !== "claimed") {
    return {
      eventId: claimed.event_id,
      disposition: claimed.disposition,
      persisted: claimed.disposition === "duplicate_persisted",
    };
  }

  const baseClaim = requireClaimScope(claimed);
  if (!claimed.marketing_account_id) {
    throw new ApiError(
      503,
      "Meta leadgen reconciliation claim is missing the marketing account.",
      "meta_leadgen_claim_scope_missing",
    );
  }
  const claim = { ...baseClaim, marketingAccountId: claimed.marketing_account_id };

  try {
    const { route, account } = await loadExactRouteAndAccount({
      admin,
      claim,
      providerPageId: claimed.provider_page_id,
      providerFormId: claimed.provider_form_id,
    });
    const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
    if (!encryptionKey || !isStrongSecretValue(encryptionKey)) {
      throw new ApiError(
        503,
        "Meta token decryption is not configured.",
        "meta_leadgen_provider_lookup_unavailable",
      );
    }
    const accessToken = decryptSecret(account.access_token_encrypted!, encryptionKey);
    const provider = await fetchProviderLeadAndAd({
      accessToken,
      providerLeadgenId: claimed.provider_leadgen_id,
      requestId: params.requestId,
    });
    const verified = assertMetaLeadgenProviderIdentity({
      event: {
        providerLeadgenId: claimed.provider_leadgen_id,
        providerPageId: claimed.provider_page_id,
        providerFormId: claimed.provider_form_id,
        providerAdId: claimed.provider_ad_id,
        providerCreatedAt: null,
      },
      expectedAdAccountId: route.provider_ad_account_id,
      providerLead: provider.providerLead,
      providerAd: provider.providerAd,
    });
    const normalized = normalizeMetaLeadgenProviderLead(verified.providerLead);
    const lead = await createVerifiedProviderLeadAndStartConversation(
      {
        name: normalized.name,
        email: normalized.email,
        phone: normalized.phone,
        source: "meta_instant_form",
        notes: "Captured from a verified Meta Instant Form leadgen event.",
        utm_source: "meta",
        utm_medium: "paid_social",
        ad_id: verified.providerAd.id,
        sms_consent: false,
        consent_source: "meta_instant_form_no_sms_consent",
        skip_recent_duplicate_fallback: true,
        custom_answers: normalized.customAnswers,
        metadata: {
          meta_leadgen: {
            event_id: claim.eventId,
            provider_leadgen_id: claimed.provider_leadgen_id,
            provider_page_id: claimed.provider_page_id,
            provider_form_id: claimed.provider_form_id,
            provider_ad_id: verified.providerAd.id,
            provider_ad_account_id: verified.normalizedAdAccountId,
            provider_created_at: normalized.providerCreatedAt,
            communications_suppressed: true,
            capi_suppressed: true,
          },
        },
      },
      {
        provider: "meta_leadgen",
        organizationId: claim.organizationId,
        userId: claim.userId,
        campaignId: claim.campaignId,
      },
    );
    const sideEffectJobId = await queueGhlOnlyLeadEffects({
      requestId: params.requestId,
      organizationId: claim.organizationId,
      userId: claim.userId,
      campaignId: claim.campaignId,
      lead: lead as Record<string, unknown> & { id: string },
    });

    await settleEvent({
      admin,
      eventId: claim.eventId,
      processingToken: claim.processingToken,
      processingGeneration: claim.processingGeneration,
      status: "persisted",
      providerAdAccountId: verified.normalizedAdAccountId,
      providerAdId: verified.providerAd.id,
      leadId: lead.id,
      sideEffectJobId,
    });

    await recordLeadTrackingEvent({
      organizationId: claim.organizationId,
      campaignId: claim.campaignId,
      leadId: lead.id,
      eventType: "lead_captured",
      status: "recorded",
      source: "meta_instant_form",
      eventId: claimed.provider_leadgen_id,
      attribution: {
        ad_id: verified.providerAd.id,
        provider_form_id: claimed.provider_form_id,
        provider_page_id: claimed.provider_page_id,
      },
      metadata: {
        requestId: params.requestId,
        nativeLeadgenEventId: claim.eventId,
        communicationsSuppressed: true,
        capiSuppressed: true,
      },
    }).catch(() => null);

    logOperationalEvent("meta_leadgen.reconciliation_persisted", {
      requestId: params.requestId,
      eventId: claim.eventId,
      organizationId: claim.organizationId,
      campaignId: claim.campaignId,
      leadId: lead.id,
      sideEffectJobId,
      communicationsEnabled: false,
      capiEnabled: false,
      ghlDeliveryRequested: true,
      providerMutationPerformed: false,
    });

    return {
      eventId: claim.eventId,
      disposition: "persisted" as const,
      persisted: true,
      leadId: lead.id,
      sideEffectJobId,
    };
  } catch (processingError) {
    const retryable = isRetryableLookupError(processingError) && !params.terminalOnFailure;
    const errorCode =
      processingError instanceof ApiError
        ? processingError.code
        : "meta_leadgen_reconciliation_failed";
    const errorMessage =
      processingError instanceof Error
        ? processingError.message
        : "Meta leadgen reconciliation failed.";

    await settleEvent({
      admin,
      eventId: claim.eventId,
      processingToken: claim.processingToken,
      processingGeneration: claim.processingGeneration,
      status: retryable ? "pending_reconciliation" : "operator_required",
      errorCode,
      errorMessage,
    }).catch((settlementError) => {
      logError("meta_leadgen.reconciliation_settlement_failed", {
        requestId: params.requestId,
        eventId: claim.eventId,
        code:
          settlementError instanceof ApiError
            ? settlementError.code
            : "meta_leadgen_settlement_failed",
      });
    });

    logWarn("meta_leadgen.reconciliation_failed", {
      requestId: params.requestId,
      eventId: claim.eventId,
      organizationId: claim.organizationId,
      campaignId: claim.campaignId,
      retryable,
      terminalOnFailure: params.terminalOnFailure === true,
      code: errorCode,
    });

    throw processingError;
  }
}
