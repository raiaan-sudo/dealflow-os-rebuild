import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import {
  isGhlAutoProvisioningEnabled,
  isGhlProvisioningWritesEnabled,
  isGhlWorkflowEnrollmentEnabled,
} from "@/lib/env";
import { GoHighLevelClient, getGhlPrivateTokenFromCredentialRef } from "@/lib/integrations/gohighlevel/client";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type PartnerTableResponse = Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

type PartnerTableBuilder = {
  select: (...args: unknown[]) => PartnerTableBuilder;
  eq: (...args: unknown[]) => PartnerTableBuilder;
  maybeSingle: () => PartnerTableResponse;
  insert: (value: unknown) => PartnerTableBuilder;
  update: (value: unknown) => PartnerTableBuilder;
  upsert: (value: unknown, options?: unknown) => PartnerTableBuilder;
  then: PartnerTableResponse["then"];
};

type NewPartnerTableClient = {
  from: (table: string) => PartnerTableBuilder;
};

export type GhlWorkspaceProvisioningPayload = {
  source: "stripe_subscription" | "manual" | "admin";
  workspaceId: string;
  userId?: string | null;
  partnerId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeEventId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  workspaceName?: string | null;
  apply?: boolean;
};

type ProvisioningJob = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  partner_id: string;
  status: string;
  idempotency_key: string;
  attempt_count: number;
  metadata?: unknown;
};

type PartnerGhlConfig = {
  partner_id: string;
  enabled: boolean;
  encrypted_credential_ref: string;
  company_id: string | null;
  default_location_id: string | null;
  default_pipeline_id: string | null;
  default_stage_id: string | null;
  default_tags: unknown;
  default_source: string | null;
};

type TemplateConfig = {
  snapshot_id?: string | null;
  default_pipeline_name?: string | null;
  default_stage_name?: string | null;
  default_tags?: unknown;
};

function getAdminClientOrThrow() {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return supabase as AdminClient;
}

function newPartnerTables(supabase: AdminClient) {
  return supabase as unknown as NewPartnerTableClient;
}

function splitName(name: string | null | undefined, email: string | null | undefined) {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || "DealFlow",
      lastName: parts.slice(1).join(" ") || "User",
      fullName: parts.join(" "),
    };
  }

  const fallback = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "DealFlow User";
  const parts = fallback.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "DealFlow",
    lastName: parts.slice(1).join(" ") || "User",
    fullName: parts.join(" ") || "DealFlow User",
  };
}

function compactJsonObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""),
  );
}

export function buildGhlProvisioningIdempotencyKey(params: {
  workspaceId: string;
  partnerId: string;
  stripeSubscriptionId?: string | null;
}) {
  return createHash("sha256")
    .update([params.partnerId, params.workspaceId, params.stripeSubscriptionId ?? "manual", "ghl_provisioning"].join("|"))
    .digest("hex");
}

async function appendProvisioningEvent(params: {
  supabase: AdminClient;
  jobId: string;
  workspaceId: string;
  partnerId: string;
  step: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  externalId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Json;
}) {
  const db = newPartnerTables(params.supabase);
  const { error } = await db.from("ghl_provisioning_events").insert({
    job_id: params.jobId,
    workspace_id: params.workspaceId,
    partner_id: params.partnerId,
    step: params.step,
    status: params.status,
    external_id: params.externalId ?? null,
    error_code: params.errorCode ?? null,
    error_message: params.errorMessage ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    throw new ApiError(500, error.message, "ghl_provisioning_event_insert_failed");
  }
}

async function readPartnerGhlConfig(params: {
  supabase: AdminClient;
  partnerId: string;
}) {
  const db = newPartnerTables(params.supabase);
  const { data, error } = await db
    .from("partner_ghl_config")
    .select("partner_id, enabled, encrypted_credential_ref, company_id, default_location_id, default_pipeline_id, default_stage_id, default_tags, default_source")
    .eq("partner_id", params.partnerId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "ghl_partner_config_fetch_failed");
  }

  return data as PartnerGhlConfig | null;
}

async function readTemplateConfig(params: {
  supabase: AdminClient;
  partnerId: string;
}) {
  const db = newPartnerTables(params.supabase);
  const { data, error } = await db
    .from("partner_ghl_template_config")
    .select("snapshot_id, default_pipeline_name, default_stage_name, default_tags")
    .eq("partner_id", params.partnerId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "ghl_template_config_fetch_failed");
  }

  return data as TemplateConfig | null;
}

async function readExistingMapping(params: {
  supabase: AdminClient;
  workspaceId: string;
  partnerId: string;
}) {
  const db = newPartnerTables(params.supabase);
  const { data, error } = await db
    .from("workspace_ghl_mapping")
    .select("id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
    .eq("workspace_id", params.workspaceId)
    .eq("partner_id", params.partnerId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "ghl_mapping_fetch_failed");
  }

  return data as {
    id: string;
    ghl_location_id: string;
    ghl_pipeline_id: string | null;
    ghl_stage_id: string | null;
    sync_enabled: boolean;
  } | null;
}

async function readProvisioningIdentity(params: {
  supabase: AdminClient;
  workspaceId: string;
  userId?: string | null;
}) {
  const db = newPartnerTables(params.supabase);
  const { data: orgRaw, error: orgError } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", params.workspaceId)
    .maybeSingle();

  if (orgError) {
    throw new ApiError(500, orgError.message, "organization_fetch_failed");
  }

  const org = orgRaw as { id: string; name?: string | null } | null;
  if (!org?.id) {
    throw new ApiError(404, "Workspace does not exist for GHL provisioning.", "workspace_not_found");
  }

  if (!params.userId) {
    return {
      workspaceName: org.name ?? null,
      userEmail: null,
      userName: null,
    };
  }

  const { data: userRaw, error: userError } = await db
    .from("users")
    .select("id, email, full_name")
    .eq("id", params.userId)
    .maybeSingle();

  if (userError) {
    logWarn("ghl_provisioning_user_lookup_failed", {
      workspaceId: params.workspaceId,
      userId: params.userId,
      message: userError.message,
    });
  }

  const user = userRaw as { id?: string; email?: string | null; full_name?: string | null } | null;
  return {
    workspaceName: org.name ?? null,
    userEmail: user?.email ?? null,
    userName: user?.full_name ?? null,
  };
}

async function upsertProvisioningJob(params: {
  supabase: AdminClient;
  payload: GhlWorkspaceProvisioningPayload;
  idempotencyKey: string;
}) {
  const db = newPartnerTables(params.supabase);
  const now = new Date().toISOString();
  const row = {
    workspace_id: params.payload.workspaceId,
    user_id: params.payload.userId ?? null,
    partner_id: params.payload.partnerId,
    stripe_customer_id: params.payload.stripeCustomerId ?? null,
    stripe_subscription_id: params.payload.stripeSubscriptionId ?? null,
    stripe_event_id: params.payload.stripeEventId ?? null,
    status: "queued",
    idempotency_key: params.idempotencyKey,
    metadata: compactJsonObject({
      source: params.payload.source,
      customer_email_present: Boolean(params.payload.customerEmail),
      customer_name_present: Boolean(params.payload.customerName),
      workspace_name: params.payload.workspaceName ?? null,
      write_mode_requested: Boolean(params.payload.apply),
    }) as Json,
    updated_at: now,
  };

  const { data, error } = await db
    .from("ghl_provisioning_jobs")
    .upsert(row, { onConflict: "idempotency_key" })
    .select("id, workspace_id, user_id, partner_id, status, idempotency_key, attempt_count, metadata")
    .maybeSingle();

  if (error || !data) {
    throw new ApiError(500, error?.message ?? "GHL provisioning job could not be queued.", "ghl_provisioning_job_upsert_failed");
  }

  return data as ProvisioningJob;
}

async function markProvisioningJob(params: {
  supabase: AdminClient;
  jobId: string;
  status: "processing" | "provisioned" | "failed" | "dead_letter" | "skipped";
  lastCompletedStep?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextRetryAt?: string | null;
  metadata?: Json;
}) {
  const db = newPartnerTables(params.supabase);
  const { data, error } = await db
    .from("ghl_provisioning_jobs")
    .update({
      status: params.status,
      last_completed_step: params.lastCompletedStep ?? null,
      last_error_code: params.errorCode ?? null,
      last_error_message: params.errorMessage ?? null,
      next_retry_at: params.nextRetryAt ?? null,
      ...(params.metadata ? { metadata: params.metadata } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.jobId)
    .select("id, workspace_id, user_id, partner_id, status, idempotency_key, attempt_count, metadata")
    .maybeSingle();

  if (error || !data) {
    throw new ApiError(500, error?.message ?? "GHL provisioning job could not be updated.", "ghl_provisioning_job_update_failed");
  }

  return data as ProvisioningJob;
}

async function persistWorkspaceMapping(params: {
  supabase: AdminClient;
  payload: GhlWorkspaceProvisioningPayload;
  locationId: string;
  pipelineId?: string | null;
  stageId?: string | null;
  source: string;
}) {
  const db = newPartnerTables(params.supabase);
  const now = new Date().toISOString();

  const { error: attributionError } = await db
    .from("workspace_partner_attribution")
    .upsert(
      {
        workspace_id: params.payload.workspaceId,
        partner_id: params.payload.partnerId,
        source: params.source,
        active: true,
        metadata: {
          billing_owner: "dealflow",
          crm_destination: "gohighlevel",
          provisioning_source: params.payload.source,
        },
        assigned_by: params.payload.userId ?? null,
        updated_at: now,
      },
      { onConflict: "workspace_id" },
    );

  if (attributionError) {
    throw new ApiError(500, attributionError.message, "workspace_partner_attribution_upsert_failed");
  }

  const { error: mappingError } = await db
    .from("workspace_ghl_mapping")
    .upsert(
      {
        workspace_id: params.payload.workspaceId,
        partner_id: params.payload.partnerId,
        ghl_location_id: params.locationId,
        ghl_pipeline_id: params.pipelineId ?? null,
        ghl_stage_id: params.stageId ?? null,
        sync_enabled: true,
        assigned_by: params.payload.userId ?? null,
        updated_at: now,
      },
      { onConflict: "workspace_id,partner_id" },
    );

  if (mappingError) {
    throw new ApiError(500, mappingError.message, "workspace_ghl_mapping_upsert_failed");
  }
}

async function persistWorkspaceGhlUser(params: {
  supabase: AdminClient;
  payload: GhlWorkspaceProvisioningPayload;
  locationId: string;
  userId?: string | null;
  inviteStatus: "pending" | "invited" | "active" | "failed" | "skipped";
}) {
  const email = params.payload.customerEmail?.trim().toLowerCase();
  if (!email) {
    return;
  }

  const db = newPartnerTables(params.supabase);
  const { error } = await db
    .from("workspace_ghl_users")
    .upsert(
      {
        workspace_id: params.payload.workspaceId,
        partner_id: params.payload.partnerId,
        ghl_location_id: params.locationId,
        ghl_user_id: params.userId ?? null,
        email,
        invite_status: params.inviteStatus,
        metadata: {
          source: params.payload.source,
          stripe_subscription_id: params.payload.stripeSubscriptionId ?? null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,partner_id,email" },
    );

  if (error) {
    throw new ApiError(500, error.message, "workspace_ghl_user_upsert_failed");
  }
}

export async function queueGhlWorkspaceProvisioningJob(payload: GhlWorkspaceProvisioningPayload) {
  if (!isGhlAutoProvisioningEnabled()) {
    return { queued: false, skipped: true, reason: "ghl_auto_provisioning_disabled" };
  }

  const supabase = getAdminClientOrThrow();
  const idempotencyKey = buildGhlProvisioningIdempotencyKey({
    workspaceId: payload.workspaceId,
    partnerId: payload.partnerId,
    stripeSubscriptionId: payload.stripeSubscriptionId,
  });
  const job = await upsertProvisioningJob({ supabase, payload, idempotencyKey });

  logOperationalEvent("ghl_provisioning.queued", {
    jobId: job.id,
    workspaceId: payload.workspaceId,
    partnerId: payload.partnerId,
    source: payload.source,
  });

  return { queued: true, skipped: false, jobId: job.id };
}

export async function provisionGhlWorkspaceForDealFlowWorkspace(payload: GhlWorkspaceProvisioningPayload) {
  const supabase = getAdminClientOrThrow();
  const idempotencyKey = buildGhlProvisioningIdempotencyKey({
    workspaceId: payload.workspaceId,
    partnerId: payload.partnerId,
    stripeSubscriptionId: payload.stripeSubscriptionId,
  });
  const job = await upsertProvisioningJob({ supabase, payload, idempotencyKey });
  await markProvisioningJob({
    supabase,
    jobId: job.id,
    status: "processing",
    metadata: {
      ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
      started_at: new Date().toISOString(),
    } as Json,
  });

  const config = await readPartnerGhlConfig({ supabase, partnerId: payload.partnerId });
  if (!config?.enabled) {
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "partner_config",
      status: "skipped",
      metadata: { reason: "partner_ghl_disabled" },
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "skipped",
      lastCompletedStep: "partner_config",
      metadata: { reason: "partner_ghl_disabled" },
    });
    return { provisioned: false, skipped: true, reason: "partner_ghl_disabled", jobId: job.id };
  }

  const existingMapping = await readExistingMapping({
    supabase,
    workspaceId: payload.workspaceId,
    partnerId: payload.partnerId,
  });

  if (existingMapping?.ghl_location_id) {
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "existing_mapping",
      status: "succeeded",
      externalId: existingMapping.ghl_location_id,
      metadata: { reused_existing_mapping: true },
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "provisioned",
      lastCompletedStep: "existing_mapping",
      metadata: {
        reused_existing_mapping: true,
        ghl_location_id: existingMapping.ghl_location_id,
        sync_enabled: existingMapping.sync_enabled,
      },
    });
    return {
      provisioned: true,
      skipped: false,
      reusedExisting: true,
      jobId: job.id,
      locationId: existingMapping.ghl_location_id,
    };
  }

  const token = getGhlPrivateTokenFromCredentialRef(config.encrypted_credential_ref);
  if (!token) {
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "auth",
      status: "failed",
      errorCode: "ghl_auth_missing",
      errorMessage: "GoHighLevel credential reference is configured but the server token is missing.",
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "failed",
      errorCode: "ghl_auth_missing",
      errorMessage: "GoHighLevel credential reference is configured but the server token is missing.",
      nextRetryAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    return { provisioned: false, skipped: false, reason: "ghl_auth_missing", jobId: job.id };
  }

  const apply = Boolean(payload.apply) && isGhlProvisioningWritesEnabled();
  const template = await readTemplateConfig({ supabase, partnerId: payload.partnerId });
  const identity = await readProvisioningIdentity({
    supabase,
    workspaceId: payload.workspaceId,
    userId: payload.userId,
  });
  const resolvedEmail = payload.customerEmail?.trim().toLowerCase() || identity.userEmail;
  const resolvedName = payload.customerName?.trim() || identity.userName;
  const name = splitName(resolvedName, resolvedEmail);
  const workspaceName = payload.workspaceName?.trim() || identity.workspaceName || `${name.fullName} Workspace`;
  const resolvedPayload = {
    ...payload,
    customerEmail: resolvedEmail,
    customerName: resolvedName,
    workspaceName,
  };

  if (!apply) {
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "dry_run",
      status: "succeeded",
      metadata: {
        would_create_location: true,
        would_create_user: Boolean(resolvedPayload.customerEmail),
        workflow_enrollment_enabled: isGhlWorkflowEnrollmentEnabled(),
      },
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "skipped",
      lastCompletedStep: "dry_run",
      metadata: {
        dry_run: true,
        write_mode_requested: Boolean(payload.apply),
        writes_enabled: isGhlProvisioningWritesEnabled(),
        workspace_name: workspaceName,
        snapshot_configured: Boolean(template?.snapshot_id),
      },
    });
    return { provisioned: false, skipped: true, reason: "dry_run", jobId: job.id };
  }

  if (!config.company_id?.trim()) {
    const message = "Click to Scale GoHighLevel company_id is required before live workspace provisioning.";
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "configuration",
      status: "failed",
      errorCode: "ghl_company_id_missing",
      errorMessage: message,
      metadata: {
        credential_ref_present: Boolean(config.encrypted_credential_ref),
        writes_enabled: isGhlProvisioningWritesEnabled(),
      },
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "dead_letter",
      errorCode: "ghl_company_id_missing",
      errorMessage: message,
      nextRetryAt: null,
    });
    throw new ApiError(500, message, "ghl_company_id_missing");
  }

  const client = new GoHighLevelClient({ token });

  try {
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "location_create",
      status: "started",
      metadata: { workspace_name: workspaceName, snapshot_configured: Boolean(template?.snapshot_id) },
    });
    const locationId = await client.createLocation({
      name: workspaceName,
      companyId: config.company_id,
      firstName: name.firstName,
      lastName: name.lastName,
      email: resolvedPayload.customerEmail,
      snapshotId: template?.snapshot_id,
      metadata: {
        dealflow_workspace_id: payload.workspaceId,
        dealflow_partner_id: payload.partnerId,
      },
    });
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "location_create",
      status: "succeeded",
      externalId: locationId,
    });

    let ghlUserId: string | null = null;
    if (resolvedPayload.customerEmail?.trim()) {
      await appendProvisioningEvent({
        supabase,
        jobId: job.id,
        workspaceId: payload.workspaceId,
        partnerId: payload.partnerId,
        step: "user_invite",
        status: "started",
        externalId: locationId,
      });
      ghlUserId = await client.createUser({
        locationId,
        companyId: config.company_id,
        firstName: name.firstName,
        lastName: name.lastName,
        email: resolvedPayload.customerEmail.trim().toLowerCase(),
      });
      await appendProvisioningEvent({
        supabase,
        jobId: job.id,
        workspaceId: payload.workspaceId,
        partnerId: payload.partnerId,
        step: "user_invite",
        status: "succeeded",
        externalId: ghlUserId,
      });
    }

    await persistWorkspaceMapping({
      supabase,
      payload: resolvedPayload,
      locationId,
      pipelineId: config.default_pipeline_id,
      stageId: config.default_stage_id,
      source: "ghl_auto_provisioning",
    });
    await persistWorkspaceGhlUser({
      supabase,
      payload: resolvedPayload,
      locationId,
      userId: ghlUserId,
      inviteStatus: ghlUserId ? "invited" : "skipped",
    });

    if (isGhlWorkflowEnrollmentEnabled()) {
      logWarn("ghl_workflow_enrollment_deferred", {
        workspaceId: payload.workspaceId,
        partnerId: payload.partnerId,
        reason: "workflow_mapping_not_selected",
      });
    }

    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: "provisioned",
      lastCompletedStep: "workspace_mapping",
      metadata: {
        ghl_location_id: locationId,
        ghl_user_id: ghlUserId,
        workflow_enrollment: "disabled",
      },
    });

    logOperationalEvent("ghl_provisioning.provisioned", {
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      locationId,
      userInvited: Boolean(ghlUserId),
    });

    return { provisioned: true, skipped: false, jobId: job.id, locationId, userId: ghlUserId };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "ghl_provisioning_failed";
    const message = error instanceof Error ? error.message : "Unknown GHL provisioning failure.";
    const retryable = code === "ghl_rate_limited" || code === "ghl_unavailable";
    await appendProvisioningEvent({
      supabase,
      jobId: job.id,
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      step: "provisioning",
      status: "failed",
      errorCode: code,
      errorMessage: message,
    }).catch((eventError) => {
      logWarn("ghl_provisioning_failure_event_failed", {
        jobId: job.id,
        message: eventError instanceof Error ? eventError.message : "Unknown event logging failure",
      });
    });
    await markProvisioningJob({
      supabase,
      jobId: job.id,
      status: retryable ? "failed" : "dead_letter",
      errorCode: code,
      errorMessage: message,
      nextRetryAt: retryable ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
    });
    throw error;
  }
}

export async function safeQueueGhlWorkspaceProvisioningJob(payload: GhlWorkspaceProvisioningPayload) {
  try {
    return await queueGhlWorkspaceProvisioningJob(payload);
  } catch (error) {
    logError("ghl_provisioning_queue_failed", {
      workspaceId: payload.workspaceId,
      partnerId: payload.partnerId,
      stripeSubscriptionId: payload.stripeSubscriptionId ?? null,
      code: error instanceof ApiError ? error.code : "unknown_error",
      message: error instanceof Error ? error.message : "Unknown GHL provisioning queue failure.",
    });
    return { queued: false, skipped: false, reason: "ghl_provisioning_queue_failed" };
  }
}
