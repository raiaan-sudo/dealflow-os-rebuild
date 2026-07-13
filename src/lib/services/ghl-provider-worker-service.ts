import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEnvironmentGhlCredentialResolver,
  createGhlProductionAdapter,
  createProductionEnvironmentGhlCredentialResolver,
  evaluateGhlProductionGate,
  evaluateGhlSandboxGate,
  ghlProductionGateFromEnvironment,
  ghlSandboxGateFromEnvironment,
  GhlSandboxAdapter,
  type GhlProductionGateInput,
  type GhlSandboxGateInput,
} from "@/lib/integrations/gohighlevel";
import type { Database } from "@/lib/supabase/types";
import { getDeploymentTarget } from "@/lib/deployment-target";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGhlProvisioningRepository } from "./ghl-provisioning-repository";
import {
  executeNextGhlProductionProvisioningStep,
  executeNextGhlSandboxProvisioningStep,
} from "./ghl-provisioning-service";
import {
  processGhlProductionOutboxBatch,
  processGhlSandboxOutboxBatch,
} from "./ghl-sandbox-outbox-service";
import { processGhlPersonalizationWorkerBatch } from "./ghl-personalization-service";

type JsonRecord = Record<string, unknown>;
type Client = SupabaseClient<Database> & {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function row(value: unknown) {
  return Array.isArray(value) && value[0] && typeof value[0] === "object" ? value[0] as JsonRecord : null;
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }

type GhlRuntimeControl = "provisioning_writes_enabled" | "lead_writes_enabled";

export class GhlRuntimeControlError extends Error {
  readonly code = "ghl_database_runtime_control_closed";
  constructor(
    readonly environment: "sandbox" | "production",
    readonly control: GhlRuntimeControl,
  ) {
    super(`The ${environment} GHL database ${control} control is closed.`);
    this.name = "GhlRuntimeControlError";
  }
}

export async function assertGhlDatabaseRuntimeControl(input: {
  client: Client;
  environment: "sandbox" | "production";
  control: GhlRuntimeControl;
}) {
  const { data, error } = await (input.client as any)
    .from("ghl_runtime_controls")
    .select(`environment,${input.control}`)
    .eq("environment", input.environment)
    .maybeSingle();
  if (error) {
    throw new Error(`GHL runtime control lookup failed: ${error.message}`);
  }
  if (!data || data[input.control] !== true) {
    throw new GhlRuntimeControlError(input.environment, input.control);
  }
}

export async function processGhlProvisioningWorkerBatch(input: {
  client: Client;
  environment: "sandbox" | "production";
  sandboxGate?: GhlSandboxGateInput;
  productionGate?: GhlProductionGateInput;
  maxSteps?: number;
  workerId?: string;
}) {
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 25, 1), 50);
  const workerId = input.workerId?.trim() || `ghl-${input.environment}-provisioner`;
  const repository = createGhlProvisioningRepository(input.client);
  const results: { runId: string; state: string }[] = [];
  for (let index = 0; index < maxSteps; index += 1) {
    const now = new Date().toISOString();
    const claim = await input.client.rpc("claim_next_ghl_provisioning_run_v1", {
      p_environment: input.environment,
      p_worker_id: workerId,
      p_now: now,
      p_lease_ms: 300_000,
    });
    if (claim.error) throw new Error(`GHL provisioning claim failed: ${claim.error.message}`);
    const claimed = row(claim.data);
    if (!claimed) break;
    const runId = text(claimed.id);
    const leaseToken = text(claimed.lease_token);
    const leaseGeneration = Number(claimed.lease_generation ?? 0);
    try {
      // The claim RPC checks the same database switch while locking the row.
      // Re-read it after claim and immediately before constructing a provider
      // adapter so an operator flip fences an already-claimed run.
      await assertGhlDatabaseRuntimeControl({
        client: input.client,
        environment: input.environment,
        control: "provisioning_writes_enabled",
      });
      const installation = await (input.client as any).from("ghl_installations")
        .select("id,environment,provider_agency_id,encrypted_credential_ref,status")
        .eq("id", text(claimed.installation_id))
        .eq("environment", input.environment)
        .eq("status", "active")
        .maybeSingle();
      if (installation.error || !installation.data) throw new Error(installation.error?.message ?? "GHL installation authority is missing.");
      const credentialRef = text(installation.data.encrypted_credential_ref);
      const companyId = text(installation.data.provider_agency_id);
      const provider = input.environment === "production"
        ? createGhlProductionAdapter({
          credentialRef,
          credentialResolver: createProductionEnvironmentGhlCredentialResolver(),
          gate: input.productionGate!,
          companyId,
        })
        : new GhlSandboxAdapter({
          credentialRef,
          credentialResolver: createEnvironmentGhlCredentialResolver(),
          gate: input.sandboxGate!,
          companyId,
        });
      const next = input.environment === "production"
        ? await executeNextGhlProductionProvisioningStep(runId, { repository, provider, productionGate: input.productionGate })
        : await executeNextGhlSandboxProvisioningStep(runId, { repository, provider, sandboxGate: input.sandboxGate });
      if (next.state === "ready") {
        const prepared = await input.client.rpc("prepare_ghl_location_personalization_v1", {
          p_provisioning_run_id: runId,
          p_now: new Date().toISOString(),
        });
        if (prepared.error || !row(prepared.data)) {
          throw new Error(prepared.error?.message ?? "GHL personalization receipt could not be prepared.");
        }
      }
      results.push({ runId, state: next.state });
    } finally {
      const released = await input.client.rpc("release_ghl_provisioning_run_claim_v1", {
        p_run_id: runId,
        p_worker_id: workerId,
        p_lease_token: leaseToken,
        p_lease_generation: leaseGeneration,
        p_now: new Date().toISOString(),
      });
      if (released.error || released.data !== true) throw new Error(released.error?.message ?? "GHL provisioning lease was lost before release.");
    }
  }
  return { status: "complete" as const, processed: results.length, results };
}

function blockedComponent(code: string, reason: string) {
  return {
    enabled: false as const,
    blockedReason: code,
    reason,
    processed: 0,
    providerMutationAttempted: false,
  };
}

/**
 * Authoritative cron/system-runner entrypoint. It evaluates application gates
 * before any database claim. The claim functions enforce database controls,
 * and each worker re-checks those controls immediately before provider use.
 */
export async function processGhlProviderWorkerFromEnvironment(input: {
  maxProvisioningSteps?: number;
  maxLeadItems?: number;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const environment = input.environment ?? process.env;
  const target = getDeploymentTarget(environment as Record<string, string | undefined>);
  const client = createAdminClient();
  if (!client) {
    return {
      environment: "unproven" as const,
      provisioning: blockedComponent("service_role_missing", "Supabase service-role authority is not configured."),
      personalization: blockedComponent("service_role_missing", "Supabase service-role authority is not configured."),
      delivery: blockedComponent("service_role_missing", "Supabase service-role authority is not configured."),
    };
  }

  if (target === "production") {
    const provisioningGate = ghlProductionGateFromEnvironment("provisioning", environment);
    const leadGate = ghlProductionGateFromEnvironment("lead_delivery", environment);
    const provisioningDecision = evaluateGhlProductionGate(provisioningGate);
    const leadDecision = evaluateGhlProductionGate(leadGate);
    const provisioning = provisioningDecision.allowed
      ? await processGhlProvisioningWorkerBatch({
          client: client as any,
          environment: "production",
          productionGate: provisioningGate,
          maxSteps: input.maxProvisioningSteps,
        })
      : blockedComponent(provisioningDecision.code, provisioningDecision.reason);
    const personalization = provisioningDecision.allowed
      ? await processGhlPersonalizationWorkerBatch({
          client: client as any,
          environment: "production",
          productionGate: provisioningGate,
          maxItems: input.maxProvisioningSteps,
          providerFactory: (authority) => createGhlProductionAdapter({
            credentialRef: authority.credentialRef,
            credentialResolver: createProductionEnvironmentGhlCredentialResolver(environment),
            gate: provisioningGate,
            companyId: authority.providerAgencyId,
          }),
        })
      : blockedComponent(provisioningDecision.code, provisioningDecision.reason);
    const delivery = leadDecision.allowed
      ? await processGhlProductionOutboxBatch(
          { maxItems: input.maxLeadItems },
          {
            client: client as any,
            gate: leadGate,
            providerFactory: (authority) => createGhlProductionAdapter({
              credentialRef: authority.credentialRef,
              credentialResolver: createProductionEnvironmentGhlCredentialResolver(environment),
              gate: leadGate,
              companyId: authority.providerAgencyId,
            }),
          },
        )
      : blockedComponent(leadDecision.code, leadDecision.reason);
    return { environment: "production" as const, provisioning, personalization, delivery };
  }

  const sandboxGate = ghlSandboxGateFromEnvironment(environment);
  const sandboxDecision = evaluateGhlSandboxGate(sandboxGate);
  if (!sandboxDecision.allowed) {
    return {
      environment: "sandbox" as const,
      provisioning: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
      personalization: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
      delivery: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
    };
  }
  const provisioning = await processGhlProvisioningWorkerBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate,
    maxSteps: input.maxProvisioningSteps,
  });
  const personalization = await processGhlPersonalizationWorkerBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate,
    maxItems: input.maxProvisioningSteps,
    providerFactory: (authority) => new GhlSandboxAdapter({
      credentialRef: authority.credentialRef,
      credentialResolver: createEnvironmentGhlCredentialResolver(environment),
      gate: sandboxGate,
      companyId: authority.providerAgencyId,
    }),
  });
  const delivery = await processGhlSandboxOutboxBatch(
    { maxItems: input.maxLeadItems },
    {
      client: client as any,
      gate: sandboxGate,
      providerFactory: (authority) => new GhlSandboxAdapter({
        credentialRef: authority.credentialRef,
        credentialResolver: createEnvironmentGhlCredentialResolver(environment),
        gate: sandboxGate,
        companyId: authority.providerAgencyId,
      }),
    },
  );
  return { environment: "sandbox" as const, provisioning, personalization, delivery };
}
