import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertGhlProductionAllowed,
  assertGhlSandboxAllowed,
  type GhlPersonalizationProviderAdapter,
  type GhlProductionGateInput,
  type GhlSandboxGateInput,
} from "@/lib/integrations/gohighlevel";
import type { Database } from "@/lib/supabase/types";
import {
  resolveGhlProductionAuthority,
  resolveGhlSandboxAuthority,
  type GhlSandboxAuthority,
} from "./ghl-sandbox-authority-service";

type JsonRecord = Record<string, unknown>;
type Client = SupabaseClient<Database> & {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function row(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as JsonRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function assertProvisioningControl(input: {
  client: Client;
  environment: "sandbox" | "production";
}) {
  const { data, error } = await (input.client as any)
    .from("ghl_runtime_controls")
    .select("environment,provisioning_writes_enabled")
    .eq("environment", input.environment)
    .maybeSingle();
  if (error) throw new Error(`GHL personalization runtime-control lookup failed: ${error.message}`);
  return Boolean(data?.provisioning_writes_enabled);
}

function retryAt(now: string) {
  return new Date(Date.parse(now) + 60_000).toISOString();
}

export async function processGhlPersonalizationWorkerBatch(input: {
  client: Client;
  environment: "sandbox" | "production";
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
  providerFactory: (authority: GhlSandboxAuthority) => GhlPersonalizationProviderAdapter;
  maxItems?: number;
  workerId?: string;
}) {
  if (input.environment === "production") {
    if (!input.productionGate || input.productionGate.operation !== "provisioning") {
      throw new Error("GHL production personalization requires a provisioning-scoped gate.");
    }
    assertGhlProductionAllowed(input.productionGate);
  } else {
    if (!input.sandboxGate) throw new Error("GHL sandbox personalization gate is missing.");
    assertGhlSandboxAllowed(input.sandboxGate);
  }

  const maxItems = Math.min(Math.max(input.maxItems ?? 10, 1), 25);
  const workerId = input.workerId?.trim() || `ghl-${input.environment}-personalization`;
  const results: Array<{ id: string; outcome: string; providerMutationAttempted: boolean }> = [];

  for (let index = 0; index < maxItems; index += 1) {
    const now = new Date().toISOString();
    const claim = await input.client.rpc("claim_next_ghl_location_personalization_v1", {
      p_environment: input.environment,
      p_worker_id: workerId,
      p_now: now,
      p_lease_ms: 300_000,
    });
    if (claim.error) throw new Error(`GHL personalization claim failed: ${claim.error.message}`);
    const claimed = row(claim.data);
    if (!claimed) break;

    const id = text(claimed.id);
    const organizationId = text(claimed.organization_id);
    const campaignId = text(claimed.campaign_id);
    const mappingId = text(claimed.location_mapping_id);
    const step = text(claimed.current_step);
    let outcome: "succeeded" | "retryable_failure" | "uncertain" | "operator_action_required";
    let receipt: JsonRecord;
    let errorCode: string | null = null;
    let providerMutationAttempted = false;

    if (!campaignId) {
      outcome = "operator_action_required";
      errorCode = `ghl_${input.environment}_personalization_campaign_missing`;
      receipt = { providerMutationAttempted: false, reason: errorCode };
    } else {
      const controlOpen = await assertProvisioningControl({
        client: input.client,
        environment: input.environment,
      });
      if (!controlOpen) {
        outcome = "retryable_failure";
        errorCode = `ghl_${input.environment}_personalization_control_closed`;
        receipt = { providerMutationAttempted: false, reason: errorCode };
      } else {
        const authority = input.environment === "production"
          ? await resolveGhlProductionAuthority({
              client: input.client,
              organizationId,
              gate: input.productionGate!,
            })
          : await resolveGhlSandboxAuthority({
              client: input.client,
              organizationId,
              gate: input.sandboxGate!,
            });
        if (!authority || authority.mappingId !== mappingId) {
          outcome = "operator_action_required";
          errorCode = `ghl_${input.environment}_personalization_authority_changed`;
          receipt = { providerMutationAttempted: false, reason: errorCode };
        } else {
          const provider = input.providerFactory(authority);
          const result = step === "custom_values"
            ? await provider.applyCustomValues({
                providerLocationId: authority.providerLocationId,
                values: stringRecord(claimed.custom_values),
              })
            : step === "forms"
              ? await provider.verifyPreinstalledForms({
                  providerLocationId: authority.providerLocationId,
                  requiredFormIds: stringArray(claimed.required_form_ids),
                })
              : {
                  outcome: "operator_action_required" as const,
                  errorCode: "ghl_personalization_step_invalid",
                  safeMessage: "The claimed GHL personalization step is invalid.",
                  providerRequestId: null,
                  responseFingerprint: null,
                  providerMutationAttempted: false,
                };
          outcome = result.outcome;
          providerMutationAttempted = result.providerMutationAttempted;
          errorCode = result.outcome === "succeeded" ? null : result.errorCode;
          receipt = {
            outcome: result.outcome,
            providerRequestId: result.providerRequestId,
            responseFingerprint: result.responseFingerprint,
            verifiedReferences: result.outcome === "succeeded" ? result.verifiedReferences : [],
            verifiedReferenceCount: result.outcome === "succeeded" ? result.verifiedReferences.length : 0,
            campaignId,
            valuesFingerprint: text(claimed.values_fingerprint),
            sourcePlanFingerprint: text(claimed.source_plan_fingerprint),
            destinationContractFingerprint: text(claimed.destination_contract_fingerprint),
            providerMutationAttempted,
          };
        }
      }
    }

    const settlement = await input.client.rpc("settle_ghl_location_personalization_v1", {
      p_personalization_id: id,
      p_worker_id: workerId,
      p_lease_token: text(claimed.lease_token),
      p_lease_generation: Number(claimed.lease_generation ?? 0),
      p_outcome: outcome,
      p_receipt: receipt,
      p_error_code: errorCode,
      p_next_retry_at: outcome === "retryable_failure" ? retryAt(now) : null,
      p_now: new Date().toISOString(),
    });
    if (settlement.error || !row(settlement.data)) {
      throw new Error(settlement.error?.message ?? "GHL personalization settlement lost its lease.");
    }
    if (step === "forms" && outcome === "succeeded") {
      const publication = await input.client.rpc("finalize_ghl_funnel_publication_v1", {
        p_personalization_id: id,
      });
      const publicationRow = row(publication.data);
      if (publication.error || !publicationRow || publicationRow.status !== "ready") {
        throw new Error(publication.error?.message ?? "GHL funnel publication receipt could not be finalized.");
      }
    }
    results.push({ id, outcome, providerMutationAttempted });
  }

  return { status: "complete" as const, processed: results.length, results };
}

export async function prepareGhlCampaignPersonalization(input: {
  client: Client;
  organizationId: string;
  campaignId: string;
  environment: "sandbox" | "production";
}) {
  const { data, error } = await input.client.rpc("prepare_ghl_campaign_personalization_v2", {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId,
    p_environment: input.environment,
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(`GHL campaign personalization preparation failed: ${error.message}`);
  const prepared = row(data);
  return prepared
    ? {
        personalizationId: text(prepared.id),
        campaignId: text(prepared.campaign_id),
        locationMappingId: text(prepared.location_mapping_id),
        slotKey: text(prepared.slot_key),
        status: text(prepared.status),
        currentStep: text(prepared.current_step),
        valuesFingerprint: text(prepared.values_fingerprint),
        sourcePlanFingerprint: text(prepared.source_plan_fingerprint),
        destinationContractFingerprint: text(prepared.destination_contract_fingerprint),
      }
    : null;
}

export async function resolveReadyGhlDestination(input: {
  client: Client;
  organizationId: string;
  campaignId: string;
  environment: "sandbox" | "production";
}) {
  const prior = await input.client.rpc("resolve_ghl_ready_campaign_destination_v2", {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId,
    p_environment: input.environment,
  });
  if (prior.error) throw new Error(`GHL destination resolution failed: ${prior.error.message}`);
  const priorReady = row(prior.data);
  if (priorReady?.personalization_id) {
    const publication = await input.client.rpc("finalize_ghl_funnel_publication_v1", {
      p_personalization_id: text(priorReady.personalization_id),
    });
    const publicationRow = row(publication.data);
    if (publication.error || !publicationRow || publicationRow.status !== "ready") {
      throw new Error(`GHL funnel publication proof failed: ${publication.error?.message ?? "publication is not ready"}`);
    }
  }
  const { data, error } = await input.client.rpc("resolve_ghl_ready_campaign_destination_v3", {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId,
    p_environment: input.environment,
  });
  if (error) throw new Error(`GHL destination resolution failed: ${error.message}`);
  const resolved = row(data);
  return resolved
    ? {
        publicationId: text(resolved.publication_id),
        personalizationId: text(resolved.personalization_id),
        campaignId: text(resolved.campaign_id),
        locationMappingId: text(resolved.location_mapping_id),
        slotKey: text(resolved.slot_key),
        destinationUrl: text(resolved.destination_url),
        destinationContractFingerprint: text(resolved.destination_contract_fingerprint),
      }
    : null;
}
