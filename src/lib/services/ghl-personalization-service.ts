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
    const mappingId = text(claimed.location_mapping_id);
    const step = text(claimed.current_step);
    let outcome: "succeeded" | "retryable_failure" | "uncertain" | "operator_action_required";
    let receipt: JsonRecord;
    let errorCode: string | null = null;
    let providerMutationAttempted = false;

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
          verifiedReferenceCount: result.outcome === "succeeded" ? result.verifiedReferences.length : 0,
          providerMutationAttempted,
        };
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
    results.push({ id, outcome, providerMutationAttempted });
  }

  return { status: "complete" as const, processed: results.length, results };
}

export async function resolveReadyGhlDestination(input: {
  client: Client;
  organizationId: string;
  environment: "sandbox" | "production";
}) {
  const { data, error } = await input.client.rpc("resolve_ghl_ready_destination_v1", {
    p_organization_id: input.organizationId,
    p_environment: input.environment,
  });
  if (error) throw new Error(`GHL destination resolution failed: ${error.message}`);
  const resolved = row(data);
  return resolved
    ? {
        personalizationId: text(resolved.personalization_id),
        locationMappingId: text(resolved.location_mapping_id),
        destinationUrl: text(resolved.destination_url),
      }
    : null;
}
