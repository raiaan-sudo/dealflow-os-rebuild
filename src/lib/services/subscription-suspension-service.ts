import "server-only";

import { ApiError } from "@/lib/api/route";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import {
  buildCampaignPlanCriticalFieldPatch,
  mergeCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { queueCampaignOffboardingCleanupJobsForOrganization } from "@/lib/services/campaign-offboarding-cleanup-service";
import { createSystemJob, type SystemJobRecord } from "@/lib/services/system-job-service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type SubscriptionSuspensionJobPayload = {
  organizationId: string;
  reason: string;
  source: string;
  dryRun?: boolean;
};

type CampaignPlanRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  plan: Record<string, unknown> | null;
};

type ManagedMetaObject = {
  id: string;
  type: "campaign" | "adset" | "ad";
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(asString).filter((item): item is string => Boolean(item))))
    : [];
}

function collectManagedMetaObjects(plan: Record<string, unknown> | null): ManagedMetaObject[] {
  const document = asRecord(plan);
  const runtime = asRecord(document.runtime);
  const launchRuntime = asRecord(document.launch_runtime);
  const objects: ManagedMetaObject[] = [];
  const seen = new Set<string>();
  const add = (type: ManagedMetaObject["type"], id: string | null) => {
    if (!id || seen.has(`${type}:${id}`)) {
      return;
    }
    seen.add(`${type}:${id}`);
    objects.push({ type, id });
  };

  add("campaign", asString(runtime.campaignId) ?? asString(launchRuntime.campaign_id));
  add("adset", asString(runtime.adSetId) ?? asString(launchRuntime.adset_id));
  asStringArray(runtime.metaAdSetIds).forEach((id) => add("adset", id));
  add("ad", asString(runtime.adId) ?? asString(launchRuntime.ad_id));
  asStringArray(runtime.metaAdIds).forEach((id) => add("ad", id));

  return objects;
}

async function loadMetaConnection(organizationId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "meta_connection_fetch_failed");
  }

  return (data as MetaConnectionRecord | null) ?? null;
}

async function pauseMetaObject(params: {
  accessToken: string;
  object: ManagedMetaObject;
}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${params.object.id}`);
  url.searchParams.set("access_token", params.accessToken);

  const body = new URLSearchParams({
    status: "PAUSED",
  });

  const { response, data } = await fetchMetaJson<Record<string, unknown> | null>(
    url.toString(),
    {
      purpose: "sync",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      retries: 0,
    },
  );

  if (!response.ok) {
    const message =
      data && typeof data.error === "object" && data.error && "message" in data.error
        ? String((data.error as { message?: unknown }).message)
        : "Meta object pause failed.";
    throw new ApiError(502, message, "meta_suspension_pause_failed");
  }

  return {
    id: params.object.id,
    type: params.object.type,
    status: "paused",
  };
}

async function markCampaignSuspended(params: {
  campaign: CampaignPlanRow;
  reason: string;
  source: string;
  dryRun: boolean;
  pausedObjects: Array<{ id: string; type: string; status: string }>;
  skippedObjects: ManagedMetaObject[];
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const now = new Date().toISOString();
  const currentPlan = params.campaign.plan ?? {};
  const currentRuntime = asRecord(currentPlan.runtime);
  const nextPlan = mergeCampaignPlanDocument(currentPlan, {
    subscription_suspension: {
      status: params.dryRun ? "dry_run" : "suspended",
      reason: params.reason,
      source: params.source,
      updated_at: now,
      paused_objects: params.pausedObjects,
      skipped_objects: params.skippedObjects,
    } as never,
    runtime: {
      ...currentRuntime,
      safetyState: "paused",
      metaLastMessage: params.dryRun
        ? "Subscription suspension dry run verified DealFlow-managed Meta objects."
        : "Subscription ended. DealFlow-managed campaign infrastructure was paused.",
      lastAction: params.dryRun
        ? "Subscription suspension dry run completed."
        : "Subscription ended; campaign is read-only until billing is reactivated.",
      statusUpdatedAt: now,
    },
  });

  const { error } = await supabase
    .from("campaign_plans")
    .update(buildCampaignPlanCriticalFieldPatch(nextPlan) as never)
    .eq("id", params.campaign.id);

  if (error) {
    throw new ApiError(500, error.message, "campaign_suspension_persist_failed");
  }
}

export async function queueSubscriptionSuspensionJobsForOrganization(params: {
  organizationId: string;
  reason: string;
  source: string;
  stripeSubscriptionId?: string | null;
  billingEndedAt?: string | null;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id")
    .eq("organization_id", params.organizationId);

  if (error) {
    throw new ApiError(500, error.message, "campaign_suspension_campaign_fetch_failed");
  }

  const campaigns = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    user_id: string | null;
    organization_id: string | null;
  }>;

  const jobs = await Promise.all(
    campaigns
      .filter((campaign) => campaign.user_id && campaign.organization_id)
      .map((campaign) =>
        createSystemJob({
          supabase,
          organizationId: campaign.organization_id as string,
          userId: campaign.user_id as string,
          campaignId: campaign.id,
          kind: "subscription_suspension",
          idempotencyKey: `subscription_suspension:${campaign.organization_id}:${campaign.id}:${params.reason}`,
          maxAttempts: 3,
          payload: {
            organizationId: params.organizationId,
            reason: params.reason,
            source: params.source,
            dryRun: process.env.DEALFLOW_SUSPENSION_DRY_RUN === "true",
          },
        }),
      ),
  );

  logOperationalEvent("subscription_suspension.jobs_queued", {
    organizationId: params.organizationId,
    reason: params.reason,
    source: params.source,
    jobCount: jobs.length,
  });

  await queueCampaignOffboardingCleanupJobsForOrganization({
    organizationId: params.organizationId,
    reason: params.reason,
    source: params.source,
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    billingEndedAt: params.billingEndedAt ?? null,
  }).catch((error) => {
    logWarn("campaign_offboarding.queue_failed", {
      organizationId: params.organizationId,
      reason: params.reason,
      source: params.source,
      message: error instanceof Error ? error.message : "Unknown campaign offboarding queue failure",
    });
  });

  return jobs;
}

export async function runSubscriptionSuspensionJob(params: {
  job: SystemJobRecord<"subscription_suspension">;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const payload = params.job.payload as SubscriptionSuspensionJobPayload;
  const campaignId = params.job.campaign_id;

  if (!campaignId) {
    throw new ApiError(400, "Campaign suspension job is missing campaign id.", "campaign_suspension_campaign_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id,user_id,organization_id,plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_suspension_campaign_fetch_failed");
  }

  const campaign = (data as CampaignPlanRow | null) ?? null;

  if (!campaign?.organization_id || campaign.organization_id !== payload.organizationId) {
    throw new ApiError(403, "Suspension job does not match the campaign workspace.", "campaign_suspension_forbidden");
  }

  const managedObjects = collectManagedMetaObjects(campaign.plan);
  const dryRun = payload.dryRun === true;
  const pausedObjects: Array<{ id: string; type: string; status: string }> = [];
  const skippedObjects: ManagedMetaObject[] = [];

  if (managedObjects.length > 0 && !dryRun) {
    const connection = await loadMetaConnection(payload.organizationId);

    if (!connection) {
      throw new ApiError(409, "Meta connection is unavailable for campaign suspension.", "meta_connection_missing");
    }

    const accessToken = getMetaAccessToken(connection);

    for (const object of managedObjects) {
      try {
        pausedObjects.push(await pauseMetaObject({ accessToken, object }));
      } catch (error) {
        logWarn("subscription_suspension.meta_pause_failed", {
          campaignId,
          objectType: object.type,
          objectId: object.id,
          message: error instanceof Error ? error.message : "Unknown Meta pause failure",
        });
        throw error;
      }
    }
  } else {
    skippedObjects.push(...managedObjects);
  }

  await markCampaignSuspended({
    campaign,
    reason: payload.reason,
    source: payload.source,
    dryRun,
    pausedObjects,
    skippedObjects,
  });

  return {
    campaignId,
    organizationId: payload.organizationId,
    reason: payload.reason,
    source: payload.source,
    dryRun,
    managedObjectCount: managedObjects.length,
    pausedObjects,
    skippedObjects,
  } satisfies Json;
}
