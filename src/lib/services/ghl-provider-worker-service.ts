import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEnvironmentGhlCredentialResolver,
  createGhlProductionAdapter,
  createProductionEnvironmentGhlCredentialResolver,
  evaluateGhlProductionGate,
  evaluateGhlSandboxGate,
  ghlProductionGateFromEnvironment,
  ghlSandboxGateFromEnvironment,
  GhlHttpClient,
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
import { processGhlInboundFormReconciliationBatch } from "./ghl-inbound-form-reconciliation-service";
import { processGhlPeriodicFormSweepBatch } from "./ghl-periodic-form-sweep-service";
import { isolateGhlProviderWorkerComponent } from "./ghl-provider-worker-isolation";

type JsonRecord = Record<string, unknown>;
type Client = SupabaseClient<Database> & {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function row(value: unknown) {
  return Array.isArray(value) && value[0] && typeof value[0] === "object" ? value[0] as JsonRecord : null;
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }

const GHL_INBOUND_HTTP_TIMEOUT_MS = 3_000;

function createGhlInboundReadHttpClient(baseUrl?: string) {
  return new GhlHttpClient({
    baseUrl,
    timeoutMs: GHL_INBOUND_HTTP_TIMEOUT_MS,
    maxReadAttempts: 1,
  });
}

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

function blockedPeriodicSweep(environment: "sandbox" | "production" | "unproven", code: string, reason: string) {
  return {
    environment,
    status: "blocked" as const,
    blockedReason: code,
    reason,
    processed: 0,
    refreshed: 0,
    providerMutationAttempted: false as const,
    results: [],
  };
}

/**
 * Dedicated, deadline-aware entrypoint for the GET-only periodic form sweep.
 *
 * This is deliberately separate from the mixed provider worker so the cron
 * invocation owns enough wall-clock budget for a bounded provider read and
 * lease settlement. Runtime controls and claim fences remain authoritative in
 * the database; application gates are evaluated before any claim is taken.
 */
export async function processGhlPeriodicFormSweepFromEnvironment(input: {
  maxSweepItems?: number;
  sweepConcurrency?: number;
  maxAttestationRefreshItems?: number;
  attestationRefreshConcurrency?: number;
  workerId?: string;
  deadlineAtMs?: number;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const environment = input.environment ?? process.env;
  const target = getDeploymentTarget(environment as Record<string, string | undefined>);
  const client = createAdminClient();
  if (!client) {
    return blockedPeriodicSweep(
      "unproven",
      "service_role_missing",
      "Supabase service-role authority is not configured.",
    );
  }

  if (target === "production") {
    const gate = ghlProductionGateFromEnvironment("form_submissions_read", environment);
    const decision = evaluateGhlProductionGate(gate);
    if (!decision.allowed) {
      return blockedPeriodicSweep("production", decision.code, decision.reason);
    }
    const result = await processGhlPeriodicFormSweepBatch({
      client: client as any,
      environment: "production",
      productionGate: gate,
      maxSweepItems: input.maxSweepItems,
      sweepConcurrency: input.sweepConcurrency,
      maxAttestationRefreshItems: input.maxAttestationRefreshItems,
      attestationRefreshConcurrency: input.attestationRefreshConcurrency,
      workerId: input.workerId,
      deadlineAtMs: input.deadlineAtMs,
      providerFactory: (authority) => createGhlProductionAdapter({
        credentialRef: authority.credentialRef,
        credentialResolver: createProductionEnvironmentGhlCredentialResolver(environment),
        gate,
        httpClient: createGhlInboundReadHttpClient(gate.baseUrl),
        companyId: authority.providerAgencyId,
      }),
    });
    return { environment: "production" as const, ...result };
  }

  const gate = ghlSandboxGateFromEnvironment(environment);
  const decision = evaluateGhlSandboxGate(gate);
  if (!decision.allowed) {
    return blockedPeriodicSweep("sandbox", decision.code, decision.reason);
  }
  const result = await processGhlPeriodicFormSweepBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate: gate,
    maxSweepItems: input.maxSweepItems,
    sweepConcurrency: input.sweepConcurrency,
    maxAttestationRefreshItems: input.maxAttestationRefreshItems,
    attestationRefreshConcurrency: input.attestationRefreshConcurrency,
    workerId: input.workerId,
    deadlineAtMs: input.deadlineAtMs,
    providerFactory: (authority) => new GhlSandboxAdapter({
      credentialRef: authority.credentialRef,
      credentialResolver: createEnvironmentGhlCredentialResolver(environment),
      gate,
      httpClient: createGhlInboundReadHttpClient(gate.baseUrl),
      companyId: authority.providerAgencyId,
    }),
  });
  return { environment: "sandbox" as const, ...result };
}

/**
 * Authoritative cron/system-runner entrypoint. It evaluates application gates
 * before any database claim. The claim functions enforce database controls,
 * and each worker re-checks those controls immediately before provider use.
 */
export async function processGhlProviderWorkerFromEnvironment(input: {
  maxProvisioningSteps?: number;
  maxLeadItems?: number;
  maxReconciliationItems?: number;
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
      reconciliation: blockedComponent("service_role_missing", "Supabase service-role authority is not configured."),
      delivery: blockedComponent("service_role_missing", "Supabase service-role authority is not configured."),
    };
  }

  if (target === "production") {
    const provisioningGate = ghlProductionGateFromEnvironment("provisioning", environment);
    const leadGate = ghlProductionGateFromEnvironment("lead_delivery", environment);
    const reconciliationGate = ghlProductionGateFromEnvironment("lifecycle_webhook", environment);
    const provisioningDecision = evaluateGhlProductionGate(provisioningGate);
    const leadDecision = evaluateGhlProductionGate(leadGate);
    const reconciliationDecision = evaluateGhlProductionGate(reconciliationGate);
    // Lead capture reconciliation runs first and every component is isolated;
    // a provisioning, personalization, or delivery poison row cannot prevent
    // signed inbound form receipts from progressing.
    const reconciliation = reconciliationDecision.allowed
      ? await isolateGhlProviderWorkerComponent("reconciliation", () => processGhlInboundFormReconciliationBatch({
          client: client as any,
          environment: "production",
          productionGate: reconciliationGate,
          // One receipt can fan out to 25 exact form GETs. Keep the sequential
          // system-job budget bounded so support/reporting/optimizer stages
          // always retain execution time in the same invocation.
          maxItems: Math.min(input.maxReconciliationItems ?? 1, 1),
          providerFactory: (authority) => createGhlProductionAdapter({
            credentialRef: authority.credentialRef,
            credentialResolver: createProductionEnvironmentGhlCredentialResolver(environment),
            gate: reconciliationGate,
            httpClient: createGhlInboundReadHttpClient(reconciliationGate.baseUrl),
            companyId: authority.providerAgencyId,
          }),
        }))
      : blockedComponent(reconciliationDecision.code, reconciliationDecision.reason);
    const delivery = leadDecision.allowed
      ? await isolateGhlProviderWorkerComponent("delivery", () => processGhlProductionOutboxBatch(
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
        ))
      : blockedComponent(leadDecision.code, leadDecision.reason);
    const provisioning = provisioningDecision.allowed
      ? await isolateGhlProviderWorkerComponent("provisioning", () => processGhlProvisioningWorkerBatch({
          client: client as any,
          environment: "production",
          productionGate: provisioningGate,
          maxSteps: input.maxProvisioningSteps,
        }))
      : blockedComponent(provisioningDecision.code, provisioningDecision.reason);
    const personalization = provisioningDecision.allowed
      ? await isolateGhlProviderWorkerComponent("personalization", () => processGhlPersonalizationWorkerBatch({
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
        }))
      : blockedComponent(provisioningDecision.code, provisioningDecision.reason);
    return { environment: "production" as const, provisioning, personalization, reconciliation, delivery };
  }

  const sandboxGate = ghlSandboxGateFromEnvironment(environment);
  const sandboxDecision = evaluateGhlSandboxGate(sandboxGate);
  if (!sandboxDecision.allowed) {
    return {
      environment: "sandbox" as const,
      provisioning: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
      personalization: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
      reconciliation: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
      delivery: blockedComponent(sandboxDecision.code, sandboxDecision.reason),
    };
  }
  const reconciliation = await isolateGhlProviderWorkerComponent("reconciliation", () => processGhlInboundFormReconciliationBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate,
    maxItems: Math.min(input.maxReconciliationItems ?? 1, 1),
    providerFactory: (authority) => new GhlSandboxAdapter({
      credentialRef: authority.credentialRef,
      credentialResolver: createEnvironmentGhlCredentialResolver(environment),
      gate: sandboxGate,
      httpClient: createGhlInboundReadHttpClient(sandboxGate.baseUrl),
      companyId: authority.providerAgencyId,
    }),
  }));
  const delivery = await isolateGhlProviderWorkerComponent("delivery", () => processGhlSandboxOutboxBatch(
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
  ));
  const provisioning = await isolateGhlProviderWorkerComponent("provisioning", () => processGhlProvisioningWorkerBatch({
    client: client as any,
    environment: "sandbox",
    sandboxGate,
    maxSteps: input.maxProvisioningSteps,
  }));
  const personalization = await isolateGhlProviderWorkerComponent("personalization", () => processGhlPersonalizationWorkerBatch({
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
  }));
  return { environment: "sandbox" as const, provisioning, personalization, reconciliation, delivery };
}
