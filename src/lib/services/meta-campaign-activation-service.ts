import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { buildMetaGraphUrl, withMetaBearerToken } from "@/lib/integrations/meta/contract";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { getMetaCampaignActivationGate } from "@/lib/meta-campaign-activation-gate";
import { createAdminClient } from "@/lib/supabase/admin";

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

export type MetaActivationProviderReceipt = {
  providerReceiptId: string;
  observedStatus: "ACTIVE";
  providerStateDigest: string;
  safeReceipt: Record<string, unknown>;
};
export type MetaCampaignActivationProvider = {
  activateObject(input: {
    providerObjectId: string;
    providerObjectType: ProviderObjectType;
    activationInputDigest: string;
    approvedDailyBudgetMinor: number;
    approvedCurrency: string;
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

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
}): MetaCampaignActivationProvider {
  const accessToken = getMetaAccessToken(params.connection);
  return {
    async activateObject(input) {
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
          error instanceof Error ? error.message : "Meta activation write had no definitive response.",
        );
      }
      if (!writeResponse.ok || writeData?.success !== true) {
        if (writeResponse.status === 408 || writeResponse.status === 429 || writeResponse.status >= 500) {
          throw new MetaActivationAmbiguousError(
            writeData?.error?.message ?? "Meta activation returned an ambiguous response.",
          );
        }
        throw new MetaActivationDefinitiveRejectionError(
          writeData?.error?.message ?? "Meta rejected the activation request.",
        );
      }

      let observed: { id?: string; status?: string; error?: { message?: string } } | null;
      try {
        const lookup = await fetchMetaJson<{ id?: string; status?: string; error?: { message?: string } }>(
          buildMetaGraphUrl(input.providerObjectId, { fields: "id,status" }),
          { purpose: "launch_lookup", ...withMetaBearerToken(accessToken) },
        );
        if (!lookup.response.ok) throw new Error(lookup.data?.error?.message ?? "Meta status lookup failed.");
        observed = lookup.data;
      } catch (error) {
        throw new MetaActivationAmbiguousError(
          error instanceof Error ? error.message : "Meta activation could not be reconciled.",
        );
      }
      if (observed?.id !== input.providerObjectId || observed.status !== "ACTIVE") {
        throw new MetaActivationAmbiguousError("Meta did not confirm the exact object in ACTIVE configured status.");
      }
      const providerReceiptId =
        writeResponse.headers.get("x-fb-trace-id") ??
        writeResponse.headers.get("x-fb-request-id") ??
        `meta-active:${input.providerObjectId}:${crypto.randomUUID()}`;
      const safeReceipt = {
        providerObjectId: input.providerObjectId,
        providerObjectType: input.providerObjectType,
        activationInputDigest: input.activationInputDigest,
        observedStatus: "ACTIVE",
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

async function defaultProviderFactory(params: {
  client: MetaCampaignActivationClient;
  claim: ActivationClaim;
}) {
  const { data, error } = await params.client.from("marketing_accounts")
    .select("*")
    .eq("id", params.claim.marketingAccountId)
    .eq("organization_id", params.claim.organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !data) {
    throw new ApiError(409, error?.message ?? "Connected Meta authority is missing.", "meta_activation_authority_missing");
  }
  return createMetaCampaignActivationProvider({ connection: data as MetaConnectionRecord });
}

export async function processDueMetaCampaignActivationBatch(params: {
  client: MetaCampaignActivationClient;
  environment: Readonly<Record<string, string | undefined>>;
  maxClaims?: number;
  workerId?: string;
  providerFactory?: (input: {
    client: MetaCampaignActivationClient;
    claim: ActivationClaim;
  }) => Promise<MetaCampaignActivationProvider>;
}) {
  const gate = getMetaCampaignActivationGate(params.environment);
  if (!gate.allowed || gate.target === "blocked") {
    return { enabled: false as const, blockedReason: gate.reason, claimedCount: 0, completedIds: [], operatorRequiredIds: [], providerMutationAttempted: false };
  }
  const workerId = params.workerId?.trim() || `meta-activation:${crypto.randomUUID()}`;
  const maxClaims = Math.min(Math.max(Math.trunc(params.maxClaims ?? ACTIVATION_BATCH_LIMIT), 1), ACTIVATION_BATCH_LIMIT);
  const completedIds: string[] = [];
  const operatorRequiredIds: string[] = [];
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
    try {
      const provider = await (params.providerFactory ?? defaultProviderFactory)({ client: params.client, claim });
      for (const object of claim.providerObjects) {
        if (object.status === "active") continue;
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
        providerMutationAttempted = true;
        const receipt = await provider.activateObject({
          providerObjectId: object.providerId,
          providerObjectType: object.type,
          activationInputDigest: claim.activationInputDigest,
          approvedDailyBudgetMinor: claim.approvedDailyBudgetMinor,
          approvedCurrency: claim.approvedCurrency,
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
      const definitive = error instanceof MetaActivationDefinitiveRejectionError;
      const outcome = definitive ? "rejected" : "operator_required";
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
      if (!definitive) operatorRequiredIds.push(claim.activationIntentId);
    }
  }
  return { enabled: true as const, environment: gate.target, blockedReason: null, claimedCount, completedIds, operatorRequiredIds, providerMutationAttempted };
}

export async function processMetaCampaignActivationFromEnvironment(params: {
  maxClaims?: number;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const environment = params.environment ?? process.env;
  const gate = getMetaCampaignActivationGate(environment);
  if (!gate.allowed) {
    return { enabled: false as const, blockedReason: gate.reason, claimedCount: 0, completedIds: [], operatorRequiredIds: [], providerMutationAttempted: false };
  }
  const client = createAdminClient();
  if (!client) {
    return { enabled: false as const, blockedReason: "service_role_missing", claimedCount: 0, completedIds: [], operatorRequiredIds: [], providerMutationAttempted: false };
  }
  return processDueMetaCampaignActivationBatch({ client: client as any, environment, maxClaims: params.maxClaims });
}
