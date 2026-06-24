import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import {
  isGhlAutoProvisioningEnabled,
  isGhlContactWritesEnabled,
  isGhlOpportunityWritesEnabled,
  isGhlProvisioningWritesEnabled,
} from "@/lib/env";
import {
  getGhlPrivateTokenFromCredentialRef,
  GoHighLevelClient,
  type GhlPipelineStageSummary,
  type GhlPipelineSummary,
} from "@/lib/integrations/gohighlevel/client";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

type JsonRecord = Record<string, unknown>;

export type GhlProvisioningMode = "full_auto" | "operator_assisted" | "mapping_only";
export type GhlProvisioningReadinessStatus = "ready" | "needs_operator_action" | "failed";

export type GhlProvisioningTarget = {
  workspaceId: string;
  partnerId?: string | null;
  liveRead?: boolean;
};

const GHL_DESTINATION = "gohighlevel";

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function getAdminClientOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function maskExternalId(value: unknown) {
  const id = asString(value);
  if (!id) {
    return null;
  }

  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : "***";
}

function statusFromReady(ready: boolean, missing: string[], failures: string[]): GhlProvisioningReadinessStatus {
  if (failures.length > 0) {
    return "failed";
  }

  return ready && missing.length === 0 ? "ready" : "needs_operator_action";
}

function normalizePipelineId(pipeline: GhlPipelineSummary) {
  return pipeline.id ?? pipeline._id ?? null;
}

function normalizeStageId(stage: GhlPipelineStageSummary) {
  return stage.id ?? stage._id ?? null;
}

function safeErrorCode(error: unknown) {
  return error instanceof ApiError ? error.code : "ghl_read_failed";
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown GHL read failure.";
}

export function buildGhlProvisioningIdempotencyKey(params: {
  workspaceId: string;
  partnerId: string;
  destination?: string;
}) {
  return createHash("sha256")
    .update([params.partnerId, params.workspaceId, params.destination ?? GHL_DESTINATION, "provisioning_v1"].join("|"))
    .digest("hex");
}

export function getGhlProvisioningGates() {
  return {
    contactWritesEnabled: isGhlContactWritesEnabled(),
    opportunityWritesEnabled: isGhlOpportunityWritesEnabled(),
    autoProvisioningEnabled: isGhlAutoProvisioningEnabled(),
    provisioningWritesEnabled: isGhlProvisioningWritesEnabled(),
    workflowEnrollmentEnabled: false,
    workflowEnrollmentRetired: true,
  };
}

async function resolvePartnerId(admin: AdminClient, workspaceId: string, partnerId?: string | null) {
  if (partnerId) {
    return partnerId;
  }

  const { data: organization, error: organizationError } = await db(admin)
    .from("organizations")
    .select("id, partner_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (organizationError) {
    throw new ApiError(500, organizationError.message, "ghl_provisioning_workspace_lookup_failed");
  }

  const organizationPartnerId = asString(organization?.partner_id);
  if (organizationPartnerId) {
    return organizationPartnerId;
  }

  const { data: mapping, error: mappingError } = await db(admin)
    .from("workspace_ghl_mapping")
    .select("partner_id")
    .eq("workspace_id", workspaceId)
    .eq("sync_enabled", true)
    .limit(2);

  if (mappingError) {
    throw new ApiError(500, mappingError.message, "ghl_provisioning_mapping_partner_lookup_failed");
  }

  const partnerIds = Array.from(
    new Set(
      (Array.isArray(mapping) ? mapping : [])
        .map((row: JsonRecord) => asString(row.partner_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (partnerIds.length > 1) {
    throw new ApiError(409, "Multiple enabled GHL mappings exist for this workspace.", "ghl_provisioning_partner_ambiguous");
  }

  return partnerIds[0] ?? null;
}

async function loadCurrentState(admin: AdminClient, params: { workspaceId: string; partnerId: string }) {
  const [
    { data: organization, error: organizationError },
    { data: partner, error: partnerError },
    { data: config, error: configError },
    { data: mapping, error: mappingError },
    { data: template, error: templateError },
    { data: jobs, error: jobsError },
    { data: users, error: usersError },
  ] = await Promise.all([
    db(admin)
      .from("organizations")
      .select("id, name, partner_id")
      .eq("id", params.workspaceId)
      .maybeSingle(),
    db(admin)
      .from("partners")
      .select("id, slug, brand_name, status")
      .eq("id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("partner_ghl_config")
      .select("partner_id, enabled, auth_type, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id, default_source, metadata")
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("workspace_ghl_mapping")
      .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, metadata, updated_at")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("partner_ghl_template_config")
      .select("partner_id, snapshot_id, default_pipeline_name, default_stage_name, metadata")
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
    db(admin)
      .from("ghl_provisioning_jobs")
      .select("id, status, attempt_count, max_attempts, last_error_code, last_error_message, idempotency_key, metadata, created_at, updated_at")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .order("updated_at", { ascending: false })
      .limit(5),
    db(admin)
      .from("workspace_ghl_users")
      .select("id, email, ghl_location_id, ghl_user_id, invite_status, metadata, updated_at")
      .eq("workspace_id", params.workspaceId)
      .eq("partner_id", params.partnerId)
      .limit(10),
  ]);

  const firstError =
    organizationError ?? partnerError ?? configError ?? mappingError ?? templateError ?? jobsError ?? usersError;
  if (firstError) {
    throw new ApiError(500, firstError.message, "ghl_provisioning_state_lookup_failed");
  }

  return {
    organization: asRecord(organization),
    partner: asRecord(partner),
    config: asRecord(config),
    mapping: asRecord(mapping),
    template: asRecord(template),
    jobs: Array.isArray(jobs) ? (jobs as JsonRecord[]) : [],
    users: Array.isArray(users) ? (users as JsonRecord[]) : [],
  };
}

async function runReadOnlyGhlChecks(params: {
  credentialRef: string | null;
  locationId: string | null;
  pipelineId: string | null;
  stageId: string | null;
}) {
  const credentialConfigured = Boolean(params.credentialRef);
  const token = params.credentialRef ? getGhlPrivateTokenFromCredentialRef(params.credentialRef) : null;

  if (!token) {
    return {
      attempted: false,
      credentialConfigured,
      credentialAvailable: false,
      locationReadable: false,
      pipelineReadable: false,
      stageReadable: false,
      failures: credentialConfigured ? ["credential_env_missing"] : ["credential_ref_missing"],
    };
  }

  if (!params.locationId) {
    return {
      attempted: false,
      credentialConfigured,
      credentialAvailable: true,
      locationReadable: false,
      pipelineReadable: false,
      stageReadable: false,
      failures: ["location_missing"],
    };
  }

  const ghl = new GoHighLevelClient({ token });
  const failures: string[] = [];
  let locationReadable = false;
  let pipelineReadable = false;
  let stageReadable = false;
  let pipelineName: string | null = null;
  let stageName: string | null = null;

  try {
    await ghl.getLocation(params.locationId);
    locationReadable = true;
  } catch (error) {
    failures.push(`${safeErrorCode(error)}:${safeErrorMessage(error)}`);
  }

  try {
    const pipelines = await ghl.getPipelines(params.locationId);
    const pipeline = params.pipelineId
      ? pipelines.find((item) => normalizePipelineId(item) === params.pipelineId)
      : null;
    pipelineReadable = Boolean(!params.pipelineId || pipeline);
    pipelineName = pipeline?.name ?? pipeline?.title ?? null;

    if (params.pipelineId && pipeline) {
      const stage = Array.isArray(pipeline.stages)
        ? pipeline.stages.find((item) => normalizeStageId(item) === params.stageId)
        : null;
      stageReadable = Boolean(!params.stageId || stage);
      stageName = stage?.name ?? stage?.title ?? null;
    } else {
      stageReadable = !params.stageId;
    }
  } catch (error) {
    failures.push(`${safeErrorCode(error)}:${safeErrorMessage(error)}`);
  }

  return {
    attempted: true,
    credentialConfigured,
    credentialAvailable: true,
    locationReadable,
    pipelineReadable,
    stageReadable,
    pipelineName,
    stageName,
    failures,
  };
}

export async function evaluateGhlProvisioningReadiness(target: GhlProvisioningTarget) {
  const admin = getAdminClientOrThrow();
  const partnerId = await resolvePartnerId(admin, target.workspaceId, target.partnerId);

  if (!partnerId) {
    return {
      status: "needs_operator_action" as const,
      mode: "operator_assisted" as const,
      workspaceId: target.workspaceId,
      partnerId: null,
      ready: false,
      missing: ["partner_mapping"],
      failures: [],
      gates: getGhlProvisioningGates(),
      safety: defaultProvisioningSafety(),
    };
  }

  const state = await loadCurrentState(admin, {
    workspaceId: target.workspaceId,
    partnerId,
  });

  const config = state.config;
  const mapping = state.mapping;
  const credentialRef = asString(config?.encrypted_credential_ref);
  const locationId = asString(mapping?.ghl_location_id) ?? asString(config?.default_location_id);
  const pipelineId = asString(mapping?.ghl_pipeline_id) ?? asString(config?.default_pipeline_id);
  const stageId = asString(mapping?.ghl_stage_id) ?? asString(config?.default_stage_id);
  const missing = [
    state.organization?.id ? null : "workspace",
    state.partner?.id ? null : "partner",
    asBoolean(config?.enabled) ? null : "partner_ghl_config_enabled",
    credentialRef ? null : "credential_ref",
    mapping?.workspace_id ? null : "workspace_ghl_mapping",
    asBoolean(mapping?.sync_enabled) ? null : "workspace_ghl_mapping_enabled",
    locationId ? null : "ghl_location_id",
    pipelineId ? null : "ghl_pipeline_id",
    stageId ? null : "ghl_stage_id",
  ].filter((value): value is string => Boolean(value));
  const readOnlyGhl = target.liveRead
    ? await runReadOnlyGhlChecks({
        credentialRef,
        locationId,
        pipelineId,
        stageId,
      })
    : {
        attempted: false,
        credentialConfigured: Boolean(credentialRef),
        credentialAvailable: null,
        locationReadable: null,
        pipelineReadable: null,
        stageReadable: null,
        failures: [] as string[],
      };
  const failures = [
    ...readOnlyGhl.failures,
    target.liveRead && readOnlyGhl.locationReadable === false ? "location_not_readable" : null,
    target.liveRead && pipelineId && readOnlyGhl.pipelineReadable === false ? "pipeline_not_readable" : null,
    target.liveRead && stageId && readOnlyGhl.stageReadable === false ? "stage_not_readable" : null,
  ].filter((value): value is string => Boolean(value));
  const ready = missing.length === 0 && failures.length === 0;
  const gates = getGhlProvisioningGates();
  const mode: GhlProvisioningMode = gates.autoProvisioningEnabled && gates.provisioningWritesEnabled
    ? "full_auto"
    : mapping?.workspace_id
      ? "mapping_only"
      : "operator_assisted";

  return {
    status: statusFromReady(ready, missing, failures),
    mode,
    workspaceId: target.workspaceId,
    partnerId,
    ready,
    missing,
    failures,
    idempotencyKey: buildGhlProvisioningIdempotencyKey({ workspaceId: target.workspaceId, partnerId }),
    organization: state.organization
      ? {
          id: asString(state.organization.id),
          name: asString(state.organization.name),
          partnerId: asString(state.organization.partner_id),
        }
      : null,
    partner: state.partner
      ? {
          id: asString(state.partner.id),
          slug: asString(state.partner.slug),
          brandName: asString(state.partner.brand_name),
          status: asString(state.partner.status),
        }
      : null,
    config: {
      enabled: asBoolean(config?.enabled),
      authType: asString(config?.auth_type),
      credentialConfigured: Boolean(credentialRef),
      credentialRefMasked: credentialRef ? "[configured-env-ref]" : null,
      defaultLocationIdMasked: maskExternalId(config?.default_location_id),
      defaultPipelineIdMasked: maskExternalId(config?.default_pipeline_id),
      defaultStageIdMasked: maskExternalId(config?.default_stage_id),
      source: asString(config?.default_source),
    },
    mapping: {
      exists: Boolean(mapping?.workspace_id),
      syncEnabled: asBoolean(mapping?.sync_enabled),
      locationIdMasked: maskExternalId(locationId),
      pipelineIdMasked: maskExternalId(pipelineId),
      stageIdMasked: maskExternalId(stageId),
      updatedAt: asString(mapping?.updated_at),
    },
    workflow: {
      enabled: false,
      workflowIdMasked: null,
      enrollmentTrigger: null,
      retired: true,
      note: "Workflow enrollment is retired; ClickToScale GHL fulfillment uses contact and opportunity delivery.",
    },
    template: {
      snapshotConfigured: Boolean(asString(state.template?.snapshot_id)),
      defaultPipelineName: asString(state.template?.default_pipeline_name),
      defaultStageName: asString(state.template?.default_stage_name),
    },
    latestJobs: state.jobs.map((job) => ({
      id: asString(job.id),
      status: asString(job.status),
      attemptCount: Number(job.attempt_count ?? 0),
      maxAttempts: Number(job.max_attempts ?? 0),
      lastErrorCode: asString(job.last_error_code),
      lastErrorMessage: asString(job.last_error_message),
      updatedAt: asString(job.updated_at),
    })),
    workspaceUsers: state.users.map((user) => ({
      id: asString(user.id),
      emailMasked: maskEmail(asString(user.email)),
      ghlUserIdMasked: maskExternalId(user.ghl_user_id),
      inviteStatus: asString(user.invite_status),
      updatedAt: asString(user.updated_at),
    })),
    readOnlyGhl,
    gates,
    safety: defaultProvisioningSafety(),
  };
}

export async function loadGhlProvisioningOverview() {
  const admin = getAdminClientOrThrow();
  const { data: mappings, error } = await db(admin)
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, updated_at")
    .limit(25);

  if (error) {
    throw new ApiError(500, error.message, "ghl_provisioning_overview_failed");
  }

  const rows = await Promise.all(
    (Array.isArray(mappings) ? (mappings as JsonRecord[]) : []).map(async (mapping) => {
      const workspaceId = asString(mapping.workspace_id);
      const partnerId = asString(mapping.partner_id);

      if (!workspaceId || !partnerId) {
        return null;
      }

      const readiness = await evaluateGhlProvisioningReadiness({ workspaceId, partnerId, liveRead: false });
      if (!readiness.partnerId || !("mapping" in readiness)) {
        return {
          workspaceId,
          partnerId,
          status: readiness.status,
          mode: readiness.mode,
          ready: readiness.ready,
          missing: readiness.missing,
          failures: readiness.failures,
          locationIdMasked: null,
          pipelineIdMasked: null,
          stageIdMasked: null,
          latestJobStatus: "not_started",
          operatorActionNeeded: true,
        };
      }

      return {
        workspaceId,
        partnerId,
        status: readiness.status,
        mode: readiness.mode,
        ready: readiness.ready,
        missing: readiness.missing,
        failures: readiness.failures,
        locationIdMasked: readiness.mapping.locationIdMasked,
        pipelineIdMasked: readiness.mapping.pipelineIdMasked,
        stageIdMasked: readiness.mapping.stageIdMasked,
        latestJobStatus: readiness.latestJobs[0]?.status ?? "not_started",
        operatorActionNeeded: readiness.status !== "ready",
      };
    }),
  );

  return {
    checkedAt: new Date().toISOString(),
    gates: getGhlProvisioningGates(),
    rows: rows.filter((row): row is NonNullable<typeof row> => Boolean(row)),
    safety: defaultProvisioningSafety(),
  };
}

function maskEmail(email: string | null) {
  if (!email || !email.includes("@")) {
    return null;
  }

  const [name, domain] = email.toLowerCase().split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function defaultProvisioningSafety() {
  return {
    dbMutation: false,
    ghlLocationWrite: false,
    ghlUserWrite: false,
    ghlPipelineWrite: false,
    ghlWorkflowWrite: false,
    contactWrite: false,
    opportunityWrite: false,
    workflowEnrollment: false,
    smsEmailSent: false,
    metaMutation: false,
    stripeBillingProviderAction: false,
    providerGeneration: false,
    tokensExposed: false,
    credentialRefsExposed: false,
  };
}
