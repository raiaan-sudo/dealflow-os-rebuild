import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { resolveCreativeContentSha256 } from "@/lib/creative-content-integrity";
import { buildMetaGraphUrl, withMetaBearerToken } from "@/lib/integrations/meta/contract";
import { assertCustomerApprovedMetaBudgetCents } from "@/lib/integrations/meta/budget-safety";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { getMetaCampaignActivationGate } from "@/lib/meta-campaign-activation-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { recoverMetaActivationPreauthorizations } from "@/lib/services/meta-campaign-activation-authority-service";

const ACTIVATION_LEASE_SECONDS = 300;
const ACTIVATION_BATCH_LIMIT = 5;

type RpcResult = Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
export type MetaCampaignActivationClient = {
  rpc: (name: string, params: Record<string, unknown>) => RpcResult;
  from: (relation: string) => any;
};

type ProviderObjectType = "ad" | "adset" | "campaign";
type ActivationObject = {
  id: string;
  sequence: number;
  type: ProviderObjectType;
  providerId: string;
  status: string;
  mutationState: string;
};
type ActivationClaim = {
  activationIntentId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  launchRecordId: string;
  marketingAccountId: string;
  activationInputDigest: string;
  approvedDailyBudgetMinor: number;
  approvedCurrency: string;
  processingToken: string;
  processingGeneration: number;
  claimedControlGeneration: number;
  providerObjects: ActivationObject[];
};

type MetaActivationExpectedProviderContract = {
  activationInputDigest: string;
  launchInputDigest: string;
  accountId: string;
  currency: "USD" | "CAD";
  pageId: string;
  pixelId: string;
  campaignId: string;
  adSetIds: string[];
  creativeId: string;
  adIds: string[];
  objective: string;
  specialAdCategories: string[];
  specialAdCategoryCountries: string[];
  isAdSetBudgetSharingEnabled: boolean;
  countryCode: string;
  dailyBudgetMinor: number;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  targeting: Record<string, unknown>;
  destinationType: string | null;
  promotedObject: Record<string, unknown>;
  trackingSpecs: unknown[];
  adDestination: "website" | "meta_instant_form";
  destinationUrl: string;
  callToActionType: string;
  creativeLink: string;
  ctaLink: string | null;
  providerFormBinding: string | null;
  primaryTextSha256: string;
  headlineSha256: string;
  imageContentSha256: string;
  providerFormId: string | null;
  formDefinitionDigest: string | null;
  creationReceiptDigest: string;
};

export type MetaActivationProviderReceipt = {
  providerReceiptId: string;
  observedStatus: "ACTIVE";
  providerStateDigest: string;
  safeReceipt: Record<string, unknown>;
};
export type MetaCampaignActivationProvider = {
  preflightActivation(input: {
    providerObjects: ActivationObject[];
    activationInputDigest: string;
    approvedDailyBudgetMinor: number;
    approvedCurrency: string;
  }): Promise<{ evidenceDigest: string }>;
  verifyFinalContract(input: {
    activationInputDigest: string;
    approvedDailyBudgetMinor: number;
    approvedCurrency: string;
  }): Promise<{
    evidenceDigest: string;
    deliveryState: "configured_active_pending_review" | "delivery_active";
    deliveryEvidenceDigest: string;
  }>;
  activateObject(input: {
    providerObjectId: string;
    providerObjectType: ProviderObjectType;
    activationInputDigest: string;
    approvedDailyBudgetMinor: number;
    approvedCurrency: string;
    preflightEvidenceDigest: string;
  }): Promise<MetaActivationProviderReceipt>;
};

export class MetaActivationDefinitiveRejectionError extends Error {
  readonly code = "meta_activation_provider_rejected";
  constructor(message: string) {
    super(message);
    this.name = "MetaActivationDefinitiveRejectionError";
  }
}

export class MetaActivationAmbiguousError extends Error {
  readonly code = "meta_activation_provider_ambiguous";
  constructor(message: string) {
    super(message);
    this.name = "MetaActivationAmbiguousError";
  }
}

export class MetaActivationProviderDriftError extends Error {
  readonly code = "meta_activation_provider_drift";
  constructor(message: string) {
    super(message);
    this.name = "MetaActivationProviderDriftError";
  }
}

function recoverableActiveProviderIds(providerObjects: ActivationObject[]) {
  const activeProviderIds = new Set<string>();
  const seenProviderIds = new Set<string>();
  let pendingSuffixStarted = false;

  providerObjects.forEach((object, index) => {
    const status = object.status.trim().toLowerCase();
    const mutationState = object.mutationState.trim().toLowerCase();
    if (object.sequence !== index + 1 || seenProviderIds.has(object.providerId)) {
      throw new MetaActivationProviderDriftError(
        "The durable Meta activation order is missing, duplicated, or out of sequence.",
      );
    }
    seenProviderIds.add(object.providerId);

    if (status === "active") {
      if (
        pendingSuffixStarted ||
        (mutationState !== "receipted" && mutationState !== "reconciled")
      ) {
        throw new MetaActivationProviderDriftError(
          "Recovered ACTIVE Meta objects must be an exact receipted or reconciled prefix in activation order.",
        );
      }
      activeProviderIds.add(object.providerId);
      return;
    }

    if (status !== "pending" || mutationState !== "idle") {
      throw new MetaActivationProviderDriftError(
        "Every Meta object after the recovered ACTIVE prefix must remain PAUSED with idle durable mutation state.",
      );
    }
    pendingSuffixStarted = true;
  });

  return activeProviderIds;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function providerIdValue(value: unknown) {
  if (typeof value === "string") return normalizedProviderId(value);
  return normalizedProviderId(recordValue(value)?.id);
}

function sortedUniqueStrings(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(stringValue).filter(Boolean))).sort()
    : [];
}

function normalizedBoolean(value: unknown) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function assertSha256(value: unknown, label: string) {
  const normalized = stringValue(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new ApiError(409, `Immutable Meta ${label} authority is invalid.`, "meta_activation_provider_contract_authority_invalid");
  }
  return normalized;
}

function assertProviderIdentifier(value: unknown, label: string) {
  const normalized = normalizedProviderId(value);
  if (!/^\d{5,40}$/.test(normalized)) {
    throw new ApiError(409, `Immutable Meta ${label} authority is invalid.`, "meta_activation_provider_contract_authority_invalid");
  }
  return normalized;
}

function sameCanonical(left: unknown, right: unknown) {
  return canonicalize(left) === canonicalize(right);
}

function normalizedTrackingSpecs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    const record = recordValue(candidate) ?? {};
    return {
      action_type: sortedUniqueStrings(record.action_type),
      fb_pixel: (Array.isArray(record.fb_pixel) ? record.fb_pixel : [])
        .map(providerIdValue)
        .filter(Boolean)
        .sort(),
    };
  }).sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
}

function normalizedProviderId(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^act_/, "") : "";
}

function normalizedCurrency(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "USD" || normalized === "CAD" ? normalized : "";
}

function integerValue(value: unknown) {
  const parsed = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) ? parsed : null;
}

function safeProviderMessage(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  return message
    .replace(/authorization\s*:\s*bearer\s+\S+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]")
    .slice(0, 500) || fallback;
}

function isSafePreMutationTransient(error: unknown) {
  if (error instanceof MetaActivationAmbiguousError) return true;
  if (error instanceof ApiError && (error.status === 408 || error.status === 429 || error.status >= 500)) {
    return true;
  }
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const code = stringValue(record?.code).toUpperCase();
  const message = safeProviderMessage(error, "").toLowerCase();
  return /^08[A-Z0-9]{3}$/.test(code) || ["53300", "57014", "57P01", "57P02", "57P03"].includes(code) ||
    /\b(timeout|timed out|temporar(?:y|ily)|rate.?limit|connection reset|connection refused|unavailable)\b/.test(message);
}

function asRecord(value: unknown) {
  if (Array.isArray(value)) return (value[0] ?? null) as Record<string, unknown> | null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(500, `Activation claim is missing ${field}.`, "meta_activation_claim_invalid");
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ApiError(500, `Activation claim is missing ${field}.`, "meta_activation_claim_invalid");
  }
  return parsed;
}

function mapClaim(value: unknown): ActivationClaim | null {
  const row = asRecord(value);
  if (!row) return null;
  const rawObjects = row.provider_objects;
  if (!Array.isArray(rawObjects) || rawObjects.length < 1 || rawObjects.length > 41) {
    throw new ApiError(500, "Activation claim has an invalid provider object set.", "meta_activation_claim_invalid");
  }
  const objects = rawObjects.map((item) => {
    const record = asRecord(item);
    const typeValue = record?.type;
    if (typeValue !== "ad" && typeValue !== "adset" && typeValue !== "campaign") {
      throw new ApiError(500, "Activation claim has an invalid provider object type.", "meta_activation_claim_invalid");
    }
    const type: ProviderObjectType = typeValue;
    return {
      id: requiredString(record?.id, "object id"),
      sequence: requiredPositiveInteger(record?.sequence, "object sequence"),
      type,
      providerId: requiredString(record?.providerId, "provider object id"),
      status: requiredString(record?.status, "object status"),
      mutationState: requiredString(record?.mutationState, "object mutation state"),
    };
  }).sort((left, right) => left.sequence - right.sequence);
  return {
    activationIntentId: requiredString(row.activation_intent_id, "activation id"),
    organizationId: requiredString(row.organization_id, "organization id"),
    userId: requiredString(row.user_id, "user id"),
    campaignId: requiredString(row.campaign_id, "campaign id"),
    launchRecordId: requiredString(row.launch_record_id, "launch record id"),
    marketingAccountId: requiredString(row.marketing_account_id, "marketing account id"),
    activationInputDigest: requiredString(row.activation_input_digest, "input digest"),
    approvedDailyBudgetMinor: requiredPositiveInteger(row.approved_daily_budget_minor, "approved budget"),
    approvedCurrency: requiredString(row.approved_currency, "approved currency"),
    processingToken: requiredString(row.processing_token, "processing token"),
    processingGeneration: requiredPositiveInteger(row.processing_generation, "processing generation"),
    claimedControlGeneration: requiredPositiveInteger(row.claimed_control_generation, "control generation"),
    providerObjects: objects,
  };
}

async function requireRpcTrue(
  client: MetaCampaignActivationClient,
  name: string,
  params: Record<string, unknown>,
  code: string,
) {
  const { data, error } = await client.rpc(name, params);
  if (error || data !== true) {
    throw new ApiError(409, error?.message ?? `${name} was fenced.`, code);
  }
}

export function createMetaCampaignActivationProvider(params: {
  connection: MetaConnectionRecord;
  expectedProviderAdAccountId: string;
  expectedContract: MetaActivationExpectedProviderContract;
  environment?: Readonly<Record<string, string | undefined>>;
}): MetaCampaignActivationProvider {
  const accessToken = getMetaAccessToken(params.connection);
  type ProviderState = {
    id: string;
    type: ProviderObjectType;
    accountId: string;
    campaignId: string | null;
    adSetId: string | null;
    status: string;
    effectiveStatus: string;
    issuesInfo: unknown[];
    adReviewFeedback: Record<string, unknown> | null;
    dailyBudgetMinor: number | null;
    objective: string | null;
    specialAdCategories: string[];
    specialAdCategoryCountries: string[];
    isAdSetBudgetSharingEnabled: boolean | null;
    optimizationGoal: string | null;
    billingEvent: string | null;
    bidStrategy: string | null;
    destinationType: string | null;
    targeting: Record<string, unknown> | null;
    promotedObject: Record<string, unknown> | null;
    trackingSpecs: unknown[];
    creativeId: string | null;
  };
  const preflightStates = new Map<string, ProviderState>();
  const activatedObjectIds = new Set<string>();
  let preflightEvidenceDigest: string | null = null;
  let expectedAccountId = "";
  let expectedCurrency = "";

  async function readGraphContract<T>(url: string | URL, fallback: string) {
    let lastResult: { response: Response; data: T | null } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await fetchMetaJson<T>(url, {
          purpose: "launch_lookup",
          ...withMetaBearerToken(accessToken),
        });
        lastResult = result;
        if (
          result.response.ok ||
          ![408, 429].includes(result.response.status) && result.response.status < 500
        ) {
          return result;
        }
      } catch (error) {
        if (attempt === 1) {
          throw new MetaActivationAmbiguousError(safeProviderMessage(error, fallback));
        }
      }
    }
    if (!lastResult) throw new MetaActivationAmbiguousError(fallback);
    return lastResult;
  }

  async function readAccount(providerAdAccountId: string) {
    const accountId = normalizedProviderId(providerAdAccountId);
    const lookup = await readGraphContract<{
      id?: string;
      account_id?: string;
      currency?: string;
      account_status?: string | number;
      error?: { message?: string };
    }>(buildMetaGraphUrl(`act_${accountId}`, { fields: "id,account_id,currency,account_status" }), "Meta account contract read was unavailable.");
    if (!lookup.response.ok || !lookup.data) {
      throw new MetaActivationAmbiguousError(
        safeProviderMessage(lookup.data?.error?.message, "Meta account preflight was unavailable."),
      );
    }
    const observedId = normalizedProviderId(lookup.data.account_id ?? lookup.data.id);
    if (observedId !== accountId || String(lookup.data.account_status ?? "") !== "1") {
      throw new MetaActivationProviderDriftError("The live Meta ad account identity or status changed after customer authorization.");
    }
    return { accountId, currency: normalizedCurrency(lookup.data.currency) };
  }

  async function readObject(object: ActivationObject) {
    const fields = object.type === "campaign"
      ? "id,account_id,status,effective_status,objective,special_ad_categories,special_ad_category_country,is_adset_budget_sharing_enabled,issues_info"
      : object.type === "adset"
        ? "id,account_id,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,promoted_object,optimization_goal,billing_event,bid_strategy,destination_type,tracking_specs,issues_info"
        : "id,account_id,campaign_id,adset_id,status,effective_status,creative,issues_info,ad_review_feedback";
    const lookup = await readGraphContract<{
      id?: string;
      account_id?: string;
      campaign_id?: string;
      adset_id?: string;
      status?: string;
      effective_status?: string;
      daily_budget?: string | number;
      lifetime_budget?: string | number;
      objective?: string;
      special_ad_categories?: unknown[];
      special_ad_category_country?: unknown[];
      is_adset_budget_sharing_enabled?: unknown;
      targeting?: Record<string, unknown>;
      promoted_object?: Record<string, unknown>;
      optimization_goal?: string;
      billing_event?: string;
      bid_strategy?: string;
      destination_type?: string;
      tracking_specs?: unknown[];
      creative?: string | { id?: string };
      issues_info?: unknown[];
      ad_review_feedback?: Record<string, unknown>;
      error?: { message?: string };
    }>(buildMetaGraphUrl(object.providerId, { fields }), `Meta ${object.type} contract read was unavailable.`);
    if (!lookup.response.ok || !lookup.data) {
      throw new MetaActivationAmbiguousError(
        safeProviderMessage(lookup.data?.error?.message, `Meta ${object.type} preflight was unavailable.`),
      );
    }
    if (lookup.data.id !== object.providerId) {
      throw new MetaActivationProviderDriftError(`The live Meta ${object.type} identity changed after customer authorization.`);
    }
    const dailyBudgetMinor = object.type === "adset" ? integerValue(lookup.data.daily_budget) : null;
    if (object.type === "adset" && (dailyBudgetMinor === null || lookup.data.lifetime_budget != null)) {
      throw new MetaActivationProviderDriftError("The live Meta ad-set budget contract no longer matches a daily-budget launch.");
    }
    return {
      id: object.providerId,
      type: object.type,
      accountId: normalizedProviderId(lookup.data.account_id),
      campaignId: typeof lookup.data.campaign_id === "string" ? lookup.data.campaign_id : null,
      adSetId: typeof lookup.data.adset_id === "string" ? lookup.data.adset_id : null,
      status: typeof lookup.data.status === "string" ? lookup.data.status.toUpperCase() : "",
      effectiveStatus: typeof lookup.data.effective_status === "string" ? lookup.data.effective_status.toUpperCase() : "",
      issuesInfo: Array.isArray(lookup.data.issues_info) ? lookup.data.issues_info : [],
      adReviewFeedback: recordValue(lookup.data.ad_review_feedback),
      dailyBudgetMinor,
      objective: typeof lookup.data.objective === "string" ? lookup.data.objective.toUpperCase() : null,
      specialAdCategories: sortedUniqueStrings(lookup.data.special_ad_categories),
      specialAdCategoryCountries: sortedUniqueStrings(lookup.data.special_ad_category_country),
      isAdSetBudgetSharingEnabled: normalizedBoolean(lookup.data.is_adset_budget_sharing_enabled),
      optimizationGoal: typeof lookup.data.optimization_goal === "string" ? lookup.data.optimization_goal.toUpperCase() : null,
      billingEvent: typeof lookup.data.billing_event === "string" ? lookup.data.billing_event.toUpperCase() : null,
      bidStrategy: typeof lookup.data.bid_strategy === "string" ? lookup.data.bid_strategy.toUpperCase() : null,
      destinationType: typeof lookup.data.destination_type === "string" ? lookup.data.destination_type.toUpperCase() : null,
      targeting: recordValue(lookup.data.targeting),
      promotedObject: recordValue(lookup.data.promoted_object),
      trackingSpecs: Array.isArray(lookup.data.tracking_specs) ? lookup.data.tracking_specs : [],
      creativeId: providerIdValue(lookup.data.creative) || null,
    } satisfies ProviderState;
  }

  function assertHierarchy(states: ProviderState[], accountId: string) {
    const campaigns = states.filter((state) => state.type === "campaign");
    const adSets = states.filter((state) => state.type === "adset");
    const ads = states.filter((state) => state.type === "ad");
    if (campaigns.length !== 1 || adSets.length < 1 || ads.length < 1) {
      throw new MetaActivationProviderDriftError("The live Meta object hierarchy is incomplete or ambiguous.");
    }
    const campaignId = campaigns[0]!.id;
    const adSetIds = new Set(adSets.map((state) => state.id));
    for (const state of states) {
      if (state.accountId !== accountId) {
        throw new MetaActivationProviderDriftError(`The live Meta ${state.type} account changed after customer authorization.`);
      }
      if (state.type === "adset" && state.campaignId !== campaignId) {
        throw new MetaActivationProviderDriftError("The live Meta ad set no longer belongs to the approved campaign.");
      }
      if (state.type === "ad" && (state.campaignId !== campaignId || !state.adSetId || !adSetIds.has(state.adSetId))) {
        throw new MetaActivationProviderDriftError("The live Meta ad no longer belongs to the approved campaign hierarchy.");
      }
    }
  }

  function asLookupObject(state: ProviderState): ActivationObject {
    return {
      id: state.id,
      sequence: 1,
      type: state.type,
      providerId: state.id,
      status: "pending",
      mutationState: "idle",
    };
  }

  function contractDrift(message: string): never {
    throw new MetaActivationProviderDriftError(message);
  }

  async function readCreativeContract() {
    const lookup = await readGraphContract<{
      id?: string;
      account_id?: string;
      object_story_spec?: {
        page_id?: string;
        link_data?: {
          message?: string;
          name?: string;
          link?: string;
          picture?: string;
          call_to_action?: { type?: string; value?: Record<string, unknown> };
        };
      };
      error?: { message?: string };
    }>(buildMetaGraphUrl(params.expectedContract.creativeId, {
      fields: "id,account_id,object_story_spec",
    }), "Meta creative contract read was unavailable.");
    if (!lookup.response.ok || lookup.data?.id !== params.expectedContract.creativeId) {
      contractDrift("The live Meta creative no longer matches its durable creation receipt.");
    }
    return lookup.data!;
  }

  async function resolveObservedCreativeDigest(pictureUrl: string) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await resolveCreativeContentSha256(pictureUrl);
      } catch (error) {
        lastError = error;
      }
    }
    throw new MetaActivationAmbiguousError(
      safeProviderMessage(lastError, "The live Meta creative bytes could not be verified."),
    );
  }

  async function readInstantFormDefinitionDigest(formId: string) {
    const lookup = await readGraphContract<{
      id?: string;
      name?: string;
      status?: string;
      questions?: Array<{ type?: string; key?: string; label?: string }>;
      privacy_policy?: { url?: string };
      follow_up_action_url?: string;
      is_optimized_for_quality?: unknown;
      block_display_for_non_targeted_viewer?: unknown;
      error?: { message?: string };
    }>(buildMetaGraphUrl(formId, {
      fields: "id,name,status,questions,privacy_policy,follow_up_action_url,is_optimized_for_quality,block_display_for_non_targeted_viewer",
    }), "Meta Instant Form contract read was unavailable.");
    if (
      !lookup.response.ok ||
      lookup.data?.id !== formId ||
      stringValue(lookup.data.status).toUpperCase() !== "ACTIVE" ||
      normalizedBoolean(lookup.data.is_optimized_for_quality) !== true ||
      normalizedBoolean(lookup.data.block_display_for_non_targeted_viewer) !== true
    ) {
      contractDrift("The live Meta Instant Form identity, status, or quality contract drifted.");
    }
    const questions = (lookup.data.questions ?? []).map((question) => ({
      type: stringValue(question.type).toUpperCase(),
      key: stringValue(question.key),
      ...(stringValue(question.label) ? { label: stringValue(question.label) } : {}),
    }));
    return sha256(JSON.stringify({
      questions,
      quality: true,
      privacyPolicyUrl: stringValue(lookup.data.privacy_policy?.url),
      followUpActionUrl: stringValue(lookup.data.follow_up_action_url),
    }));
  }

  async function verifyFullProviderContract(states: ProviderState[]) {
    const expected = params.expectedContract;
    const campaigns = states.filter((state) => state.type === "campaign");
    const adSets = states.filter((state) => state.type === "adset");
    const ads = states.filter((state) => state.type === "ad");
    if (
      campaigns.length !== 1 ||
      campaigns[0]!.id !== expected.campaignId ||
      !sameCanonical(adSets.map((state) => state.id).sort(), [...expected.adSetIds].sort()) ||
      !sameCanonical(ads.map((state) => state.id).sort(), [...expected.adIds].sort())
    ) {
      contractDrift("The live Meta hierarchy no longer matches durable creation receipts.");
    }
    const campaign = campaigns[0]!;
    if (
      campaign.objective !== expected.objective ||
      !sameCanonical(campaign.specialAdCategories, expected.specialAdCategories) ||
      !sameCanonical(campaign.specialAdCategoryCountries, expected.specialAdCategoryCountries) ||
      campaign.isAdSetBudgetSharingEnabled !== expected.isAdSetBudgetSharingEnabled
    ) {
      contractDrift("The live Meta objective or housing special-ad contract drifted after approval.");
    }

    for (const adSet of adSets) {
      const geoLocations = recordValue(adSet.targeting?.geo_locations);
      const countries = sortedUniqueStrings(geoLocations?.countries);
      const expectedGeoLocations = recordValue(recordValue(expected.targeting)?.geo_locations);
      const expectedCountries = sortedUniqueStrings(expectedGeoLocations?.countries);
      const disallowedGeoKeys = Object.keys(geoLocations ?? {}).filter((key) => key !== "countries");
      const promotedObject = adSet.promotedObject ?? {};
      if (
        !sameCanonical(countries, expectedCountries) ||
        disallowedGeoKeys.length > 0 ||
        adSet.optimizationGoal !== expected.optimizationGoal ||
        adSet.billingEvent !== expected.billingEvent ||
        adSet.bidStrategy !== expected.bidStrategy
      ) {
        contractDrift("The live Meta targeting, optimization, billing, or bid contract drifted after approval.");
      }
      if (expected.adDestination === "meta_instant_form") {
        if (
          adSet.destinationType !== expected.destinationType ||
          providerIdValue(promotedObject.page_id) !== providerIdValue(expected.promotedObject.page_id) ||
          !sameCanonical(normalizedTrackingSpecs(adSet.trackingSpecs), normalizedTrackingSpecs(expected.trackingSpecs))
        ) {
          contractDrift("The live Meta Instant Form promoted Page contract drifted after approval.");
        }
      } else {
        if (
          expected.destinationType !== null ||
          adSet.destinationType !== null && adSet.destinationType !== "WEBSITE" ||
          providerIdValue(promotedObject.pixel_id) !== providerIdValue(expected.promotedObject.pixel_id) ||
          stringValue(promotedObject.custom_event_type).toUpperCase() !==
            stringValue(expected.promotedObject.custom_event_type).toUpperCase() ||
          !sameCanonical(normalizedTrackingSpecs(adSet.trackingSpecs), normalizedTrackingSpecs(expected.trackingSpecs))
        ) {
          contractDrift("The live Meta Pixel, conversion, or tracking contract drifted after approval.");
        }
      }
    }

    for (const ad of ads) {
      if (ad.creativeId !== expected.creativeId) {
        contractDrift("A live Meta ad no longer points to the receipted approved creative.");
      }
    }

    const creative = await readCreativeContract();
    const story = creative.object_story_spec;
    const linkData = story?.link_data;
    const cta = linkData?.call_to_action;
    const ctaValue = cta?.value ?? {};
    if (
      normalizedProviderId(creative.account_id) !== expected.accountId ||
      providerIdValue(story?.page_id) !== expected.pageId ||
      sha256(stringValue(linkData?.message)) !== expected.primaryTextSha256 ||
      sha256(stringValue(linkData?.name)) !== expected.headlineSha256 ||
      stringValue(cta?.type).toUpperCase() !== expected.callToActionType
    ) {
      contractDrift("The live Meta Page, copy, headline, or CTA contract drifted after approval.");
    }
    const imageDigest = await resolveObservedCreativeDigest(stringValue(linkData?.picture));
    if (imageDigest !== expected.imageContentSha256) {
      contractDrift("The live Meta creative image content drifted after approval.");
    }

    let observedFormDefinitionDigest: string | null = null;
    if (expected.adDestination === "meta_instant_form") {
      if (
        !expected.providerFormId ||
        providerIdValue(ctaValue.lead_gen_form_id) !== expected.providerFormId ||
        expected.providerFormBinding !== "provisioning_receipt" ||
        stringValue(linkData?.link) !== expected.creativeLink
      ) {
        contractDrift("The live Meta ad no longer points to the durably provisioned Instant Form.");
      }
      observedFormDefinitionDigest = await readInstantFormDefinitionDigest(expected.providerFormId);
      if (observedFormDefinitionDigest !== expected.formDefinitionDigest) {
        contractDrift("The live Meta Instant Form definition drifted after customer approval.");
      }
    } else if (
      expected.providerFormBinding !== null ||
      stringValue(linkData?.link) !== expected.creativeLink ||
      stringValue(ctaValue.link) !== expected.ctaLink
    ) {
      contractDrift("The live Meta website destination URL drifted after customer approval.");
    }

    return {
      accountId: expected.accountId,
      campaignId: expected.campaignId,
      adSetIds: expected.adSetIds,
      adIds: expected.adIds,
      creativeId: expected.creativeId,
      objective: expected.objective,
      countryCode: expected.countryCode,
      pageId: expected.pageId,
      pixelId: expected.pixelId,
      destinationUrl: expected.destinationUrl,
      providerFormId: expected.providerFormId,
      formDefinitionDigest: observedFormDefinitionDigest,
      creationReceiptDigest: expected.creationReceiptDigest,
      imageContentSha256: imageDigest,
    };
  }

  async function verifyLiveContract(targetId: string, expectedTargetStatus: "PAUSED" | "ACTIVE") {
    const account = await readAccount(expectedAccountId);
    if (account.accountId !== expectedAccountId || account.currency !== expectedCurrency) {
      throw new MetaActivationProviderDriftError("The Meta account identity or currency drifted during activation.");
    }
    const expectedStates = [...preflightStates.values()];
    const observedStates = await Promise.all(expectedStates.map((state) => readObject(asLookupObject(state))));
    const observedById = new Map(observedStates.map((state) => [state.id, state]));
    for (const expected of expectedStates) {
      const observed = observedById.get(expected.id);
      if (
        !observed ||
        observed.type !== expected.type ||
        observed.accountId !== expected.accountId ||
        observed.campaignId !== expected.campaignId ||
        observed.adSetId !== expected.adSetId ||
        observed.dailyBudgetMinor !== expected.dailyBudgetMinor ||
        observed.status !== (
          observed.id === targetId
            ? expectedTargetStatus
            : activatedObjectIds.has(observed.id) ? "ACTIVE" : "PAUSED"
        )
      ) {
        throw new MetaActivationProviderDriftError("The live Meta hierarchy, status, or budget drifted from the exact preflight contract.");
      }
    }
    const totalDailyBudgetMinor = observedStates
      .filter((state) => state.type === "adset")
      .reduce((sum, state) => sum + (state.dailyBudgetMinor ?? 0), 0);
    if (totalDailyBudgetMinor !== [...preflightStates.values()]
      .filter((state) => state.type === "adset")
      .reduce((sum, state) => sum + (state.dailyBudgetMinor ?? 0), 0)) {
      throw new MetaActivationProviderDriftError("The live Meta daily budget drifted during activation.");
    }
    await verifyFullProviderContract(observedStates);
    return observedById.get(targetId)!;
  }

  function classifyFinalDeliveryState(states: ProviderState[]) {
    const blockingStatuses = new Set(["DISAPPROVED", "WITH_ISSUES", "ERROR", "DELETED", "ARCHIVED"]);
    const pendingStatuses = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"]);
    const evidence = states.map((state) => ({
      id: state.id,
      type: state.type,
      effectiveStatus: state.effectiveStatus,
      issuesInfo: state.issuesInfo,
      adReviewFeedback: state.adReviewFeedback,
    })).sort((left, right) => left.id.localeCompare(right.id));
    for (const state of states) {
      if (
        blockingStatuses.has(state.effectiveStatus) ||
        state.issuesInfo.length > 0 ||
        (state.adReviewFeedback && Object.keys(state.adReviewFeedback).length > 0)
      ) {
        contractDrift("Meta reported a disapproved or with-issues delivery state after activation.");
      }
      if (!pendingStatuses.has(state.effectiveStatus)) {
        contractDrift("Meta returned an unknown final review or delivery state after activation.");
      }
    }
    return {
      deliveryState: states.every((state) => state.effectiveStatus === "ACTIVE")
        ? "delivery_active" as const
        : "configured_active_pending_review" as const,
      evidenceDigest: sha256(canonicalize(evidence)),
    };
  }

  return {
    async preflightActivation(input) {
      preflightStates.clear();
      activatedObjectIds.clear();
      const recoveredActiveProviderIds = recoverableActiveProviderIds(input.providerObjects);
      if (
        input.activationInputDigest !== params.expectedContract.activationInputDigest ||
        input.approvedDailyBudgetMinor !== params.expectedContract.dailyBudgetMinor ||
        normalizedCurrency(input.approvedCurrency) !== params.expectedContract.currency
      ) {
        throw new MetaActivationProviderDriftError(
          "The activation claim no longer matches its immutable approval and receipt contract.",
        );
      }
      if (
        !normalizedProviderId(params.expectedProviderAdAccountId) ||
        normalizedProviderId(params.connection.external_account_id) !== normalizedProviderId(params.expectedProviderAdAccountId)
      ) {
        throw new MetaActivationProviderDriftError("The connected Meta account no longer matches the customer-authorized account.");
      }
      const account = await readAccount(params.expectedProviderAdAccountId);
      expectedAccountId = account.accountId;
      expectedCurrency = normalizedCurrency(input.approvedCurrency);
      if (!expectedCurrency || account.currency !== expectedCurrency) {
        throw new MetaActivationProviderDriftError("The live Meta account currency changed after customer authorization.");
      }
      const states = await Promise.all(input.providerObjects.map(readObject));
      assertHierarchy(states, expectedAccountId);
      for (const state of states) {
        const expectedStatus = recoveredActiveProviderIds.has(state.id) ? "ACTIVE" : "PAUSED";
        if (state.status !== expectedStatus) {
          throw new MetaActivationProviderDriftError(
            "The live Meta ACTIVE prefix does not exactly match durable receipt and reconciliation truth.",
          );
        }
      }
      const totalDailyBudgetMinor = states
        .filter((state) => state.type === "adset")
        .reduce((sum, state) => sum + (state.dailyBudgetMinor ?? 0), 0);
      if (totalDailyBudgetMinor !== input.approvedDailyBudgetMinor) {
        throw new MetaActivationProviderDriftError("The live Meta daily budget no longer matches the exact customer-approved total.");
      }
      const immutableContract = await verifyFullProviderContract(states);
      for (const state of states) preflightStates.set(state.id, state);
      for (const providerId of recoveredActiveProviderIds) activatedObjectIds.add(providerId);
      const durableObjectsByProviderId = new Map(
        input.providerObjects.map((object) => [object.providerId, object]),
      );
      const evidence = {
        activationInputDigest: input.activationInputDigest,
        accountId: expectedAccountId,
        currency: expectedCurrency,
        approvedDailyBudgetMinor: input.approvedDailyBudgetMinor,
        immutableContract,
        objects: states.map((state) => ({
          id: state.id,
          type: state.type,
          accountId: state.accountId,
          campaignId: state.campaignId,
          adSetId: state.adSetId,
          status: state.status,
          durableStatus: durableObjectsByProviderId.get(state.id)?.status,
          durableMutationState: durableObjectsByProviderId.get(state.id)?.mutationState,
          dailyBudgetMinor: state.dailyBudgetMinor,
        })).sort((left, right) => left.id.localeCompare(right.id)),
      };
      preflightEvidenceDigest = sha256(canonicalize(evidence));
      return { evidenceDigest: preflightEvidenceDigest };
    },
    async verifyFinalContract(input) {
      if (
        input.activationInputDigest !== params.expectedContract.activationInputDigest
      ) {
        throw new MetaActivationProviderDriftError("The final Meta activation input identity is invalid.");
      }
      if (
        input.approvedDailyBudgetMinor !== params.expectedContract.dailyBudgetMinor ||
        normalizedCurrency(input.approvedCurrency) !== params.expectedContract.currency
      ) {
        throw new MetaActivationProviderDriftError("The final Meta activation budget or currency authority drifted.");
      }
      const observed = await verifyLiveContract("", "ACTIVE");
      void observed;
      const states = await Promise.all(
        [...preflightStates.values()].map((state) => readObject(asLookupObject(state))),
      );
      const delivery = classifyFinalDeliveryState(states);
      const evidenceDigest = sha256(canonicalize({
        activationInputDigest: input.activationInputDigest,
        deliveryState: delivery.deliveryState,
        deliveryEvidenceDigest: delivery.evidenceDigest,
        creationReceiptDigest: params.expectedContract.creationReceiptDigest,
      }));
      return {
        evidenceDigest,
        deliveryState: delivery.deliveryState,
        deliveryEvidenceDigest: delivery.evidenceDigest,
      };
    },
    async activateObject(input) {
      const expected = preflightStates.get(input.providerObjectId);
      if (
        !expected ||
        expected.type !== input.providerObjectType ||
        !preflightEvidenceDigest ||
        input.preflightEvidenceDigest !== preflightEvidenceDigest
      ) {
        throw new MetaActivationProviderDriftError("The exact live Meta preflight evidence is missing or changed.");
      }
      // Repeat the complete account/hierarchy/currency/budget proof immediately
      // before every ACTIVE write. The worker may run for several seconds and
      // a one-time batch preflight is not sufficient authority for a later
      // provider mutation.
      await verifyLiveContract(input.providerObjectId, "PAUSED");
      // This is the last synchronous authority check before the real Graph
      // ACTIVE request. It deliberately repeats the worker's pre-arm and
      // post-arm checks because the live hierarchy proof above may take time.
      assertCustomerApprovedMetaBudgetCents(
        input.approvedDailyBudgetMinor,
        "Customer-approved Meta activation daily budget",
        (params.environment ?? process.env) as Record<string, string | undefined>,
      );
      let writeResponse: Response;
      let writeData: { success?: boolean; error?: { message?: string } } | null;
      try {
        const write = await fetchMetaJson<{ success?: boolean; error?: { message?: string } }>(
          buildMetaGraphUrl(input.providerObjectId),
          {
            purpose: "launch_create",
            method: "POST",
            ...withMetaBearerToken(accessToken, {
              headers: { "Content-Type": "application/json" },
            }),
            body: JSON.stringify({ status: "ACTIVE" }),
          },
        );
        writeResponse = write.response;
        writeData = write.data;
      } catch (error) {
        throw new MetaActivationAmbiguousError(
          safeProviderMessage(error, "Meta activation write had no definitive response."),
        );
      }
      if (!writeResponse.ok || writeData?.success !== true) {
        if (writeResponse.status === 408 || writeResponse.status === 429 || writeResponse.status >= 500) {
          throw new MetaActivationAmbiguousError(
            safeProviderMessage(writeData?.error?.message, "Meta activation returned an ambiguous response."),
          );
        }
        throw new MetaActivationDefinitiveRejectionError(
          safeProviderMessage(writeData?.error?.message, "Meta rejected the activation request."),
        );
      }

      let observed: ProviderState;
      try {
        observed = await verifyLiveContract(input.providerObjectId, "ACTIVE");
      } catch (error) {
        if (error instanceof MetaActivationProviderDriftError) throw error;
        throw new MetaActivationAmbiguousError(
          safeProviderMessage(error, "Meta activation could not be reconciled."),
        );
      }
      if (
        observed.id !== expected.id ||
        observed.type !== expected.type ||
        observed.accountId !== expected.accountId ||
        observed.campaignId !== expected.campaignId ||
        observed.adSetId !== expected.adSetId ||
        observed.dailyBudgetMinor !== expected.dailyBudgetMinor ||
        observed.status !== "ACTIVE"
      ) {
        throw new MetaActivationAmbiguousError("Meta did not confirm the exact object in ACTIVE configured status.");
      }
      activatedObjectIds.add(observed.id);
      const providerReceiptId =
        writeResponse.headers.get("x-fb-trace-id") ??
        writeResponse.headers.get("x-fb-request-id") ??
        `meta-active:${input.providerObjectId}:${crypto.randomUUID()}`;
      const safeReceipt = {
        providerObjectId: input.providerObjectId,
        providerObjectType: input.providerObjectType,
        activationInputDigest: input.activationInputDigest,
        preflightEvidenceDigest: input.preflightEvidenceDigest,
        observedStatus: "ACTIVE",
        accountId: observed.accountId,
        campaignId: observed.campaignId,
        adSetId: observed.adSetId,
        dailyBudgetMinor: observed.dailyBudgetMinor,
        currency: expectedCurrency,
        providerRequestId: providerReceiptId,
      };
      return {
        providerReceiptId,
        observedStatus: "ACTIVE",
        providerStateDigest: sha256(JSON.stringify(safeReceipt)),
        safeReceipt,
      };
    },
  };
}

async function loadExpectedProviderContract(params: {
  client: MetaCampaignActivationClient;
  claim: ActivationClaim;
}) {
  const [intentResult, launchResult, preauthorizationResult, receiptsResult] = await Promise.all([
    params.client.from("meta_campaign_activation_intents")
      .select("provider_ad_account_id,launch_input_digest,activation_input_digest")
      .eq("id", params.claim.activationIntentId)
      .eq("organization_id", params.claim.organizationId)
      .eq("launch_record_id", params.claim.launchRecordId)
      .maybeSingle(),
    params.client.from("campaign_launch_records")
      .select("id,organization_id,user_id,campaign_id,launch_input_snapshot,launch_input_digest,meta_campaign_id,meta_ad_set_ids,meta_creative_id,meta_ad_ids,schedule_lease_generation")
      .eq("id", params.claim.launchRecordId)
      .eq("organization_id", params.claim.organizationId)
      .eq("user_id", params.claim.userId)
      .eq("campaign_id", params.claim.campaignId)
      .maybeSingle(),
    params.client.from("meta_campaign_activation_preauthorizations")
      .select("launch_approval_snapshot,launch_approval_digest,provider_ad_account_id,provider_page_id,provider_pixel_id,approved_currency,approved_daily_budget_minor,ad_destination,destination_url_digest,status")
      .eq("activation_intent_id", params.claim.activationIntentId)
      .eq("organization_id", params.claim.organizationId)
      .eq("user_id", params.claim.userId)
      .eq("campaign_id", params.claim.campaignId)
      .eq("status", "finalized")
      .maybeSingle(),
    params.client.from("campaign_launch_provider_receipts")
      .select("stage,object_id,response_status,launch_input_digest,lease_generation")
      .eq("launch_id", params.claim.launchRecordId)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (
    intentResult.error || !intentResult.data ||
    launchResult.error || !launchResult.data ||
    preauthorizationResult.error || !preauthorizationResult.data ||
    receiptsResult.error || !Array.isArray(receiptsResult.data)
  ) {
    const authorityError = intentResult.error ?? launchResult.error ?? preauthorizationResult.error ?? receiptsResult.error;
    if (isSafePreMutationTransient(authorityError)) {
      throw new MetaActivationAmbiguousError(
        safeProviderMessage(authorityError, "Immutable Meta approval authority was temporarily unavailable."),
      );
    }
    throw new ApiError(
      409,
      intentResult.error?.message ?? launchResult.error?.message ?? preauthorizationResult.error?.message ?? receiptsResult.error?.message ??
        "Immutable Meta approval or creation receipt authority is missing.",
      "meta_activation_provider_contract_authority_invalid",
    );
  }
  const intent = intentResult.data as Record<string, unknown>;
  const launch = launchResult.data as Record<string, unknown>;
  const preauthorization = preauthorizationResult.data as Record<string, unknown>;
  const approvalSnapshot = recordValue(preauthorization.launch_approval_snapshot);
  const launchSnapshot = recordValue(launch.launch_input_snapshot);
  const launchDestination = recordValue(launchSnapshot?.destination);
  const normalizedLaunchSnapshot = launchSnapshot ? structuredClone(launchSnapshot) : null;
  const normalizedDestination = recordValue(normalizedLaunchSnapshot?.destination);
  if (normalizedDestination) normalizedDestination.provider_form_id = null;
  if (!approvalSnapshot || !launchSnapshot || !sameCanonical(normalizedLaunchSnapshot, approvalSnapshot)) {
    throw new ApiError(
      409,
      "The receipted launch no longer matches the immutable customer approval snapshot.",
      "meta_activation_provider_contract_authority_invalid",
    );
  }
  const provider = recordValue(approvalSnapshot.provider);
  const creative = recordValue(approvalSnapshot.creative);
  const destination = recordValue(approvalSnapshot.destination);
  const delivery = recordValue(approvalSnapshot.delivery);
  const providerContract = recordValue(approvalSnapshot.provider_contract);
  const campaignContract = recordValue(providerContract?.campaign);
  const adSetContract = recordValue(providerContract?.ad_set);
  const creativeContract = recordValue(providerContract?.creative);
  const accountId = assertProviderIdentifier(provider?.ad_account_id, "ad account");
  const pageId = assertProviderIdentifier(provider?.page_id, "Page");
  const pixelId = assertProviderIdentifier(provider?.pixel_id, "Pixel");
  const campaignId = assertProviderIdentifier(launch.meta_campaign_id, "campaign receipt");
  const creativeId = assertProviderIdentifier(launch.meta_creative_id, "creative receipt");
  const adSetIds = Array.isArray(launch.meta_ad_set_ids)
    ? launch.meta_ad_set_ids.map((value) => assertProviderIdentifier(value, "ad-set receipt"))
    : [];
  const adIds = Array.isArray(launch.meta_ad_ids)
    ? launch.meta_ad_ids.map((value) => assertProviderIdentifier(value, "ad receipt"))
    : [];
  const currency = normalizedCurrency(provider?.account_currency);
  const objective = stringValue(delivery?.objective).toUpperCase();
  const countryCode = stringValue(delivery?.country_code).toUpperCase();
  const dailyBudgetMinor = integerValue(delivery?.daily_budget_minor);
  const adDestination = stringValue(destination?.ad_destination).toLowerCase();
  const destinationUrl = stringValue(approvalSnapshot.destination_url);
  const specialAdCategories = sortedUniqueStrings(campaignContract?.special_ad_categories);
  const specialAdCategoryCountries = sortedUniqueStrings(campaignContract?.special_ad_category_country);
  const isAdSetBudgetSharingEnabled = normalizedBoolean(campaignContract?.is_adset_budget_sharing_enabled);
  const targeting = recordValue(adSetContract?.targeting);
  const targetGeoLocations = recordValue(targeting?.geo_locations);
  const promotedObject = recordValue(adSetContract?.promoted_object);
  const trackingSpecs = Array.isArray(adSetContract?.tracking_specs) ? adSetContract.tracking_specs : null;
  const optimizationGoal = stringValue(adSetContract?.optimization_goal).toUpperCase();
  const billingEvent = stringValue(adSetContract?.billing_event).toUpperCase();
  const bidStrategy = stringValue(adSetContract?.bid_strategy).toUpperCase();
  const destinationType = adSetContract?.destination_type === null
    ? null
    : stringValue(adSetContract?.destination_type).toUpperCase();
  const callToActionType = stringValue(creativeContract?.call_to_action_type).toUpperCase();
  const creativeLink = stringValue(creativeContract?.link);
  const ctaLink = creativeContract?.cta_link === null ? null : stringValue(creativeContract?.cta_link);
  const providerFormBinding = creativeContract?.provider_form_binding === null
    ? null
    : stringValue(creativeContract?.provider_form_binding);
  const expectedOptimizationGoal = adDestination === "meta_instant_form"
    ? "LEAD_GENERATION"
    : objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" : "OFFSITE_CONVERSIONS";
  const expectedTrackingSpecs = adDestination === "meta_instant_form"
    ? []
    : [{ action_type: ["offsite_conversion"], fb_pixel: [pixelId] }];
  const promotedKeys = Object.keys(promotedObject ?? {}).sort();
  if (
    accountId !== normalizedProviderId(intent.provider_ad_account_id) ||
    intent.activation_input_digest !== params.claim.activationInputDigest ||
    launch.launch_input_digest !== intent.launch_input_digest ||
    preauthorization.provider_ad_account_id !== accountId ||
    preauthorization.provider_page_id !== pageId ||
    preauthorization.provider_pixel_id !== pixelId ||
    !currency ||
    currency !== params.claim.approvedCurrency ||
    dailyBudgetMinor !== params.claim.approvedDailyBudgetMinor ||
    !/^OUTCOME_[A-Z_]+$/.test(objective) ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    (adDestination !== "website" && adDestination !== "meta_instant_form") ||
    !destinationUrl ||
    preauthorization.destination_url_digest !== sha256(destinationUrl) ||
    adSetIds.length < 1 ||
    adIds.length < 1 ||
    !campaignContract || !adSetContract || !creativeContract || !targeting || !targetGeoLocations || !promotedObject || !trackingSpecs ||
    stringValue(campaignContract.objective).toUpperCase() !== objective ||
    !sameCanonical(sortedUniqueStrings(delivery?.special_ad_categories), ["HOUSING"]) ||
    !sameCanonical(specialAdCategories, ["HOUSING"]) ||
    !sameCanonical(specialAdCategoryCountries, [countryCode]) ||
    isAdSetBudgetSharingEnabled !== false ||
    billingEvent !== "IMPRESSIONS" ||
    optimizationGoal !== expectedOptimizationGoal ||
    integerValue(adSetContract.daily_budget_minor) !== dailyBudgetMinor ||
    bidStrategy !== "LOWEST_COST_WITHOUT_CAP" ||
    !sameCanonical(sortedUniqueStrings(targetGeoLocations.countries), [countryCode]) ||
    Object.keys(targetGeoLocations).some((key) => key !== "countries") ||
    Object.keys(targeting).some((key) => key !== "geo_locations") ||
    destinationType !== (adDestination === "meta_instant_form" ? "ON_AD" : null) ||
    !sameCanonical(normalizedTrackingSpecs(trackingSpecs), normalizedTrackingSpecs(expectedTrackingSpecs)) ||
    (adDestination === "meta_instant_form"
      ? !sameCanonical(promotedKeys, ["page_id"]) || providerIdValue(promotedObject.page_id) !== pageId
      : !sameCanonical(promotedKeys, ["custom_event_type", "pixel_id"]) ||
        providerIdValue(promotedObject.pixel_id) !== pixelId ||
        stringValue(promotedObject.custom_event_type).toUpperCase() !== "LEAD") ||
    providerIdValue(creativeContract.page_id) !== pageId ||
    callToActionType !== "LEARN_MORE" ||
    creativeLink !== (adDestination === "meta_instant_form" ? "https://fb.me/" : destinationUrl) ||
    ctaLink !== (adDestination === "meta_instant_form" ? null : destinationUrl) ||
    providerFormBinding !== (adDestination === "meta_instant_form" ? "provisioning_receipt" : null)
  ) {
    throw new ApiError(409, "Immutable Meta provider contract fields are inconsistent.", "meta_activation_provider_contract_authority_invalid");
  }

  const expectedIdsByStage = new Map<string, string[]>([
    ["campaign", [campaignId]],
    ["adset", adSetIds],
    ["creative", [creativeId]],
    ["ad", adIds],
  ]);
  for (const [stage, expectedIds] of expectedIdsByStage) {
    const rows = (receiptsResult.data as Array<Record<string, unknown>>).filter((row) => row.stage === stage);
    const distinctIds = Array.from(new Set(rows.map((row) => stringValue(row.object_id)))).sort();
    const successfulIds = Array.from(new Set(rows.filter((row) => {
      const status = integerValue(row.response_status);
      return status !== null && status >= 200 && status <= 299 && row.launch_input_digest === launch.launch_input_digest;
    }).map((row) => stringValue(row.object_id)))).sort();
    if (
      rows.some((row) => row.launch_input_digest !== launch.launch_input_digest) ||
      !sameCanonical(distinctIds, [...expectedIds].sort()) ||
      !sameCanonical(successfulIds, [...expectedIds].sort())
    ) {
      throw new ApiError(409, `Durable Meta ${stage} creation receipts are missing or ambiguous.`, "meta_activation_provider_contract_authority_invalid");
    }
  }
  const creationReceiptDigest = sha256(canonicalize((receiptsResult.data as Array<Record<string, unknown>>).map((row) => ({
    stage: row.stage,
    objectId: row.object_id,
    responseStatus: row.response_status,
    launchInputDigest: row.launch_input_digest,
    leaseGeneration: row.lease_generation,
  }))));

  let providerFormId: string | null = null;
  let formDefinitionDigest: string | null = null;
  if (adDestination === "meta_instant_form") {
    formDefinitionDigest = assertSha256(destination?.form_definition_digest, "Instant Form definition");
    const provisioningResult = await params.client.from("meta_instant_form_provisioning")
      .select("provider_form_id,provider_page_id,definition_digest,status,provider_mutation_state,subscription_state")
      .eq("organization_id", params.claim.organizationId)
      .eq("user_id", params.claim.userId)
      .eq("campaign_id", params.claim.campaignId)
      .eq("definition_digest", formDefinitionDigest)
      .maybeSingle();
    const provisioning = provisioningResult.data as Record<string, unknown> | null;
    if (
      provisioningResult.error || !provisioning ||
      provisioning.status !== "created" ||
      !["receipted", "reconciled"].includes(stringValue(provisioning.provider_mutation_state)) ||
      !["subscribed", "reconciled"].includes(stringValue(provisioning.subscription_state)) ||
      providerIdValue(provisioning.provider_page_id) !== pageId
    ) {
      throw new ApiError(409, "Durable Meta Instant Form provisioning authority is incomplete.", "meta_activation_provider_contract_authority_invalid");
    }
    providerFormId = assertProviderIdentifier(provisioning.provider_form_id, "Instant Form receipt");
    const snapshotFormId = providerIdValue(launchDestination?.provider_form_id);
    if (snapshotFormId && snapshotFormId !== providerFormId) {
      throw new ApiError(409, "The launch Instant Form receipt conflicts with provisioning authority.", "meta_activation_provider_contract_authority_invalid");
    }
  }

  return {
    activationInputDigest: params.claim.activationInputDigest,
    launchInputDigest: stringValue(launch.launch_input_digest),
    accountId,
    currency: currency as "USD" | "CAD",
    pageId,
    pixelId,
    campaignId,
    adSetIds,
    creativeId,
    adIds,
    objective,
    specialAdCategories,
    specialAdCategoryCountries,
    isAdSetBudgetSharingEnabled: isAdSetBudgetSharingEnabled!,
    countryCode,
    dailyBudgetMinor: dailyBudgetMinor!,
    optimizationGoal,
    billingEvent,
    bidStrategy,
    targeting,
    destinationType,
    promotedObject,
    trackingSpecs,
    adDestination: adDestination as "website" | "meta_instant_form",
    destinationUrl,
    callToActionType,
    creativeLink,
    ctaLink,
    providerFormBinding,
    primaryTextSha256: assertSha256(creative?.primary_text_sha256, "primary copy"),
    headlineSha256: assertSha256(creative?.headline_sha256, "headline"),
    imageContentSha256: assertSha256(creative?.image_content_sha256, "creative image"),
    providerFormId,
    formDefinitionDigest,
    creationReceiptDigest,
  } satisfies MetaActivationExpectedProviderContract;
}

async function defaultProviderFactory(params: {
  client: MetaCampaignActivationClient;
  claim: ActivationClaim;
  environment: Readonly<Record<string, string | undefined>>;
}) {
  const [accountResult, intentResult, expectedContract] = await Promise.all([
    params.client.from("marketing_accounts")
      .select("*")
      .eq("id", params.claim.marketingAccountId)
      .eq("organization_id", params.claim.organizationId)
      .eq("platform", "meta_ads")
      .eq("status", "connected")
      .maybeSingle(),
    params.client.from("meta_campaign_activation_intents")
      .select("provider_ad_account_id")
      .eq("id", params.claim.activationIntentId)
      .eq("organization_id", params.claim.organizationId)
      .maybeSingle(),
    loadExpectedProviderContract(params),
  ]);
  const expectedProviderAdAccountId = typeof intentResult.data?.provider_ad_account_id === "string"
    ? intentResult.data.provider_ad_account_id.trim()
    : "";
  if (accountResult.error || !accountResult.data || intentResult.error || !expectedProviderAdAccountId) {
    const authorityError = accountResult.error ?? intentResult.error;
    if (isSafePreMutationTransient(authorityError)) {
      throw new MetaActivationAmbiguousError(
        safeProviderMessage(authorityError, "Connected Meta authority was temporarily unavailable."),
      );
    }
    throw new ApiError(
      409,
      accountResult.error?.message ?? intentResult.error?.message ?? "Connected Meta authority is missing.",
      "meta_activation_authority_missing",
    );
  }
  return createMetaCampaignActivationProvider({
    connection: accountResult.data as MetaConnectionRecord,
    expectedProviderAdAccountId,
    expectedContract,
    environment: params.environment,
  });
}

export async function processDueMetaCampaignActivationBatch(params: {
  client: MetaCampaignActivationClient;
  environment: Readonly<Record<string, string | undefined>>;
  maxClaims?: number;
  workerId?: string;
  providerFactory?: (input: {
    client: MetaCampaignActivationClient;
    claim: ActivationClaim;
    environment: Readonly<Record<string, string | undefined>>;
  }) => Promise<MetaCampaignActivationProvider>;
}) {
  const gate = getMetaCampaignActivationGate(params.environment);
  if (!gate.allowed || gate.target === "blocked") {
    return { enabled: false as const, blockedReason: gate.reason, claimedCount: 0, completedIds: [], operatorRequiredIds: [], retryDeferredIds: [], providerMutationAttempted: false };
  }
  const workerId = params.workerId?.trim() || `meta-activation:${crypto.randomUUID()}`;
  const maxClaims = Math.min(Math.max(Math.trunc(params.maxClaims ?? ACTIVATION_BATCH_LIMIT), 1), ACTIVATION_BATCH_LIMIT);
  const completedIds: string[] = [];
  const operatorRequiredIds: string[] = [];
  const retryDeferredIds: string[] = [];
  let claimedCount = 0;
  let providerMutationAttempted = false;
  for (let cycle = 0; cycle < maxClaims; cycle += 1) {
    const claimed = await params.client.rpc("claim_due_meta_campaign_activation", {
      p_worker_id: workerId,
      p_environment: gate.target,
      p_lease_seconds: ACTIVATION_LEASE_SECONDS,
    });
    if (claimed.error) throw new ApiError(500, claimed.error.message ?? "Activation claim failed.", "meta_activation_claim_failed");
    const claim = mapClaim(claimed.data);
    if (!claim) break;
    claimedCount += 1;
    let claimProviderMutationAttempted = false;
    let claimProviderMutationArmed = false;
    try {
      recoverableActiveProviderIds(claim.providerObjects);
      assertCustomerApprovedMetaBudgetCents(
        claim.approvedDailyBudgetMinor,
        "Customer-approved Meta activation daily budget",
        params.environment as Record<string, string | undefined>,
      );
      const provider = await (params.providerFactory ?? defaultProviderFactory)({
        client: params.client,
        claim,
        environment: params.environment,
      });
      const preflight = await provider.preflightActivation({
        providerObjects: claim.providerObjects,
        activationInputDigest: claim.activationInputDigest,
        approvedDailyBudgetMinor: claim.approvedDailyBudgetMinor,
        approvedCurrency: claim.approvedCurrency,
      });
      for (const object of claim.providerObjects) {
        if (object.status === "active") continue;
        assertCustomerApprovedMetaBudgetCents(
          claim.approvedDailyBudgetMinor,
          "Customer-approved Meta activation daily budget",
          params.environment as Record<string, string | undefined>,
        );
        await requireRpcTrue(params.client, "renew_meta_campaign_activation_claim", {
          p_activation_intent_id: claim.activationIntentId,
          p_worker_id: workerId,
          p_processing_token: claim.processingToken,
          p_processing_generation: claim.processingGeneration,
          p_lease_seconds: ACTIVATION_LEASE_SECONDS,
        }, "meta_activation_lease_lost");
        await requireRpcTrue(params.client, "arm_meta_campaign_activation_object", {
          p_activation_intent_id: claim.activationIntentId,
          p_object_id: object.id,
          p_worker_id: workerId,
          p_processing_token: claim.processingToken,
          p_processing_generation: claim.processingGeneration,
        }, "meta_activation_arm_fenced");
        claimProviderMutationArmed = true;
        assertCustomerApprovedMetaBudgetCents(
          claim.approvedDailyBudgetMinor,
          "Customer-approved Meta activation daily budget",
          params.environment as Record<string, string | undefined>,
        );
        providerMutationAttempted = true;
        claimProviderMutationAttempted = true;
        const receipt = await provider.activateObject({
          providerObjectId: object.providerId,
          providerObjectType: object.type,
          activationInputDigest: claim.activationInputDigest,
          approvedDailyBudgetMinor: claim.approvedDailyBudgetMinor,
          approvedCurrency: claim.approvedCurrency,
          preflightEvidenceDigest: preflight.evidenceDigest,
        });
        await requireRpcTrue(params.client, "record_meta_campaign_activation_receipt", {
          p_activation_intent_id: claim.activationIntentId,
          p_object_id: object.id,
          p_worker_id: workerId,
          p_processing_token: claim.processingToken,
          p_processing_generation: claim.processingGeneration,
          p_provider_receipt_id: receipt.providerReceiptId,
          p_provider_state_digest: receipt.providerStateDigest,
          p_provider_receipt: receipt.safeReceipt,
        }, "meta_activation_receipt_fenced");
        await requireRpcTrue(params.client, "settle_meta_campaign_activation_object", {
          p_activation_intent_id: claim.activationIntentId,
          p_object_id: object.id,
          p_worker_id: workerId,
          p_processing_token: claim.processingToken,
          p_processing_generation: claim.processingGeneration,
        }, "meta_activation_object_settlement_fenced");
      }
      const finalContract = await provider.verifyFinalContract({
        activationInputDigest: claim.activationInputDigest,
        approvedDailyBudgetMinor: claim.approvedDailyBudgetMinor,
        approvedCurrency: claim.approvedCurrency,
      });
      await requireRpcTrue(params.client, "record_meta_campaign_activation_delivery_state", {
        p_activation_intent_id: claim.activationIntentId,
        p_worker_id: workerId,
        p_processing_token: claim.processingToken,
        p_processing_generation: claim.processingGeneration,
        p_delivery_status: finalContract.deliveryState,
        p_delivery_evidence_digest: finalContract.deliveryEvidenceDigest,
        p_provider_contract_evidence_digest: finalContract.evidenceDigest,
      }, "meta_activation_delivery_state_fenced");
      await requireRpcTrue(params.client, "settle_meta_campaign_activation", {
        p_activation_intent_id: claim.activationIntentId,
        p_worker_id: workerId,
        p_processing_token: claim.processingToken,
        p_processing_generation: claim.processingGeneration,
        p_outcome: "active",
        p_error_code: null,
        p_error_message: null,
      }, "meta_activation_settlement_fenced");
      completedIds.push(claim.activationIntentId);
    } catch (error) {
      const retryable = !claimProviderMutationArmed && !claimProviderMutationAttempted && isSafePreMutationTransient(error);
      const definitive = error instanceof MetaActivationDefinitiveRejectionError ||
        (error instanceof MetaActivationProviderDriftError && !claimProviderMutationArmed && !claimProviderMutationAttempted);
      const outcome = retryable ? "retryable" : definitive ? "rejected" : "operator_required";
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code) : "meta_activation_unexpected_failure";
      const message = error instanceof Error ? error.message : "Meta activation failed.";
      const settlement = await params.client.rpc("settle_meta_campaign_activation", {
        p_activation_intent_id: claim.activationIntentId,
        p_worker_id: workerId,
        p_processing_token: claim.processingToken,
        p_processing_generation: claim.processingGeneration,
        p_outcome: outcome,
        p_error_code: code,
        p_error_message: message,
      });
      if (settlement.error || settlement.data !== true) {
        throw new ApiError(409, settlement.error?.message ?? "Activation failure settlement was fenced.", "meta_activation_failure_settlement_fenced");
      }
      if (retryable) {
        retryDeferredIds.push(claim.activationIntentId);
        // Do not reclaim the same immediately-due intent again inside this
        // worker batch. A later scheduled pass may retry after the transient
        // read dependency has recovered.
        break;
      }
      if (!definitive) operatorRequiredIds.push(claim.activationIntentId);
    }
  }
  return { enabled: true as const, environment: gate.target, blockedReason: null, claimedCount, completedIds, operatorRequiredIds, retryDeferredIds, providerMutationAttempted };
}

export async function processMetaCampaignActivationFromEnvironment(params: {
  maxClaims?: number;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const environment = params.environment ?? process.env;
  const client = createAdminClient();
  if (!client) {
    return { enabled: false as const, blockedReason: "service_role_missing", claimedCount: 0, completedIds: [], operatorRequiredIds: [], providerMutationAttempted: false, finalizationRecovery: { examinedCount: 0, finalizedCount: 0, operatorRequiredCount: 0 } };
  }
  // This recovery creates only a durable intent from pre-existing immutable
  // customer authority and an exact PAUSED receipt. It performs no provider
  // write and therefore remains safe while the activation-write gate is shut.
  const finalizationRecovery = await recoverMetaActivationPreauthorizations(20);
  const gate = getMetaCampaignActivationGate(environment);
  if (!gate.allowed) {
    return { enabled: false as const, blockedReason: gate.reason, claimedCount: 0, completedIds: [], operatorRequiredIds: [], providerMutationAttempted: false, finalizationRecovery };
  }
  return {
    ...(await processDueMetaCampaignActivationBatch({ client: client as any, environment, maxClaims: params.maxClaims })),
    finalizationRecovery,
  };
}
