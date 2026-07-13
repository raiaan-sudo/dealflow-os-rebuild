import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseOptionalJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { launchCampaignToMeta } from "@/app/api/campaigns/create/route";
import { resolveCampaignDestinationContract } from "@/lib/campaign-destination";
import { assertCampaignCanLaunch } from "@/lib/services/campaign-entitlements";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { getAppContext } from "@/lib/services/app-context";
import {
  assertCampaignLaunchScheduleDue,
  armManualCampaignLaunchProviderMutation,
  bindManualCampaignLaunchInputSnapshot,
  CampaignLaunchLeaseLostError,
  CampaignLaunchOperatorActionRequiredError,
  claimManualCampaignLaunch,
  completeManualCampaignLaunchClaim,
  failManualCampaignLaunchClaim,
  getCampaignLaunchRecordForCampaign,
  loadManualCampaignLaunchProviderResume,
  persistManualCampaignLaunchRuntime,
  recordManualCampaignLaunchProviderReceipt,
  renewManualCampaignLaunchClaim,
  settleManualCampaignLaunchProviderMutation,
  type CampaignLaunchRecord,
  type ManualCampaignLaunchClaim,
} from "@/lib/services/campaign-launch-audit-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { provisionCompletedMetaInstantFormRoute } from "@/lib/services/meta-instant-form-route-service";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const retryBodySchema = z.object({
  meta_campaign_id: z.string().min(1).optional(),
  meta_adset_id: z.string().min(1).optional(),
  meta_creative_id: z.string().min(1).optional(),
  test_mode_interrupt_after: z.enum(["campaign", "ad_set", "creative"]).optional(),
});

type PersistedLaunchState = {
  campaign_id?: string | null;
  adset_id?: string | null;
  creative_id?: string | null;
  ad_id?: string | null;
  current_stage?: "campaign" | "adset" | "creative" | "ad" | null;
  status?: "in_progress" | "failed" | "completed" | null;
};

type LaunchResponsePayload = {
  campaign_id: string;
  adset_id: string;
  creative_id?: string;
  ad_id: string;
  already_launched?: boolean;
  stage?: "campaign" | "ad_set" | "creative" | "ad";
  error?: string;
  code?: string;
  operator_action_id?: string;
};

const inFlightLaunches = new Map<string, Promise<LaunchResponsePayload>>();
const MANUAL_LAUNCH_LEASE_MS = 30 * 60_000;
const MANUAL_LAUNCH_HEARTBEAT_MS = 60_000;

function normalizeStage(
  stage: PersistedLaunchState["current_stage"] | LaunchResponsePayload["stage"] | undefined | null,
): LaunchResponsePayload["stage"] {
  if (stage === "adset") {
    return "ad_set";
  }

  return stage ?? "campaign";
}

async function loadPersistedLaunchContract(campaignId: string) {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    return {
      launchState: null as PersistedLaunchState | null,
      destinationContract: resolveCampaignDestinationContract(null),
      leadCaptureMode: null as string | null,
      customQuestionCount: 0,
    };
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;
  const plan =
    row?.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
      ? (row.plan as Record<string, unknown>)
      : null;
  const launchRuntime =
    plan?.launch_runtime &&
    typeof plan.launch_runtime === "object" &&
    !Array.isArray(plan.launch_runtime)
      ? (plan.launch_runtime as PersistedLaunchState)
      : null;

  const funnel =
    plan?.funnel && typeof plan.funnel === "object" && !Array.isArray(plan.funnel)
      ? (plan.funnel as Record<string, unknown>)
      : {};
  const configuredQuestions = Array.isArray(plan?.lead_form_questions)
    ? plan.lead_form_questions
    : Array.isArray(funnel.customLeadFormQuestions)
      ? funnel.customLeadFormQuestions
      : [];

  return {
    launchState: launchRuntime,
    destinationContract: resolveCampaignDestinationContract(plan),
    leadCaptureMode:
      typeof plan?.lead_capture_mode === "string" ? plan.lead_capture_mode : null,
    customQuestionCount: configuredQuestions.length,
  };
}

async function acquireMetaLaunchLock(claim: ManualCampaignLaunchClaim) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service role is required for durable Meta launch locking.");
  }

  const token = crypto.randomUUID();
  const lockedUntil = new Date(Date.now() + MANUAL_LAUNCH_LEASE_MS).toISOString();

  const inserted = await supabase
    .from("meta_launch_locks")
    .insert({
      campaign_id: claim.campaignId,
      lock_token: token,
      locked_by: `${claim.workerId}:generation:${claim.leaseGeneration}`,
      locked_until: lockedUntil,
    } as never)
    .select("*")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return token;
  }

  const { data: existingRaw, error: existingError } = await supabase
    .from("meta_launch_locks")
    .select("*")
    .eq("campaign_id", claim.campaignId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const existing = existingRaw as { locked_until?: string | null } | null;
  const existingExpiry = existing?.locked_until ? new Date(existing.locked_until).getTime() : 0;

  if (existing && existingExpiry > Date.now()) {
    throw new ApiError(
      409,
      "A launch is already running for this campaign.",
      "meta_launch_lock_active",
    );
  }

  const { data: updatedRaw, error: updateError } = await supabase
    .from("meta_launch_locks")
    .update({
      lock_token: token,
      locked_by: `${claim.workerId}:generation:${claim.leaseGeneration}`,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("campaign_id", claim.campaignId)
    .lte("locked_until", new Date().toISOString())
    .select("*")
    .maybeSingle();

  if (updateError || !updatedRaw) {
    throw new ApiError(
      409,
      "A launch is already running for this campaign.",
      "meta_launch_lock_active",
    );
  }

  return token;
}

async function renewMetaLaunchLock(claim: ManualCampaignLaunchClaim, token: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new CampaignLaunchLeaseLostError(
      "The service-role client is unavailable for the campaign-level lease.",
    );
  }

  const { data, error } = await supabase
    .from("meta_launch_locks")
    .update({
      locked_until: new Date(Date.now() + MANUAL_LAUNCH_LEASE_MS).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("campaign_id", claim.campaignId)
    .eq("lock_token", token)
    .eq("locked_by", `${claim.workerId}:generation:${claim.leaseGeneration}`)
    .gt("locked_until", new Date().toISOString())
    .select("campaign_id")
    .maybeSingle();

  if (error || !data) {
    throw new CampaignLaunchLeaseLostError("The campaign-level Meta launch lease was lost.");
  }
}

async function releaseMetaLaunchLock(claim: ManualCampaignLaunchClaim, token: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("meta_launch_locks")
    .delete()
    .eq("campaign_id", claim.campaignId)
    .eq("lock_token", token)
    .eq("locked_by", `${claim.workerId}:generation:${claim.leaseGeneration}`);
}

function resolveResumeObjectId(params: {
  stage: string;
  receipted: string | null;
  persisted: string | null;
  requested?: string | null;
}) {
  const candidates = [params.receipted, params.persisted, params.requested]
    .map((value) => value?.trim() || null)
    .filter((value): value is string => Boolean(value));
  const distinct = new Set(candidates);

  if (distinct.size > 1) {
    throw new ApiError(
      409,
      `The ${params.stage} recovery identity conflicts with its durable provider receipt.`,
      "campaign_launch_resume_identity_conflict",
    );
  }

  return candidates[0] ?? null;
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  let launchClaim: ManualCampaignLaunchClaim | null = null;
  let auditContext: { campaignId: string; campaignName: string } | null = null;
  let launchCompletionCommitted = false;

  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);

    if (!record) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }
    const appContext = await getAppContext();
    if (!appContext) {
      throw new ApiError(401, "Authentication is required.", "unauthorized");
    }
    if (
      record.campaign.organization_id &&
      record.campaign.organization_id !== appContext.organization.id
    ) {
      throw new ApiError(403, "Campaign workspace access was denied.", "forbidden");
    }
    await assertCampaignCanLaunch(id);

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-launch", id),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const retryBody = await parseOptionalJsonBody(request, retryBodySchema, {});

    if (
      retryBody.test_mode_interrupt_after &&
      process.env.ALLOW_META_LAUNCH_INTERRUPTION_TESTS !== "true"
    ) {
      throw new ApiError(
        403,
        "Meta launch interruption testing is not enabled in this environment.",
        "meta_launch_interruption_disabled",
      );
    }
    const existingLaunch = inFlightLaunches.get(id);

    if (existingLaunch) {
      return NextResponse.json(await existingLaunch);
    }

    const persistedContract = await loadPersistedLaunchContract(id);
    const persistedLaunchState = persistedContract.launchState;

    const existingCampaignId =
      persistedLaunchState?.campaign_id ?? record?.launch.runtime.campaignId ?? null;
    const existingAdSetId =
      persistedLaunchState?.adset_id ??
      record?.launch.runtime.adSetId ??
      record?.launch.runtime.metaAdSetIds?.[0] ??
      null;
    const existingCreativeId = persistedLaunchState?.creative_id ?? null;
    const existingAdId =
      persistedLaunchState?.ad_id ?? record?.launch.runtime.adId ?? record?.launch.runtime.metaAdIds?.[0] ?? null;

    const completedReceipt = await getCampaignLaunchRecordForCampaign({
      campaignId: id,
      campaignName: record.campaign.name,
      metaCampaignId: existingCampaignId,
    });
    const completedAdSetId = completedReceipt?.metaAdSetIds[0] ?? null;
    const completedCreativeId = completedReceipt?.metaCreativeId ?? null;
    const completedAdId = completedReceipt?.metaAdIds[0] ?? null;

    if (
      completedReceipt?.resultStatus === "success" &&
      completedReceipt.campaignId === id &&
      completedReceipt.metaCampaignId &&
      completedReceipt.metaAdSetIds.length === 1 &&
      completedReceipt.metaCreativeId &&
      completedReceipt.metaAdIds.length === 1
    ) {
      if (persistedContract.destinationContract.adDestination === "meta_instant_form") {
        if (!record.campaign.organization_id) {
          throw new ApiError(
            500,
            "Campaign is missing workspace context.",
            "campaign_workspace_missing",
          );
        }
        await provisionCompletedMetaInstantFormRoute({
          record,
          organizationId: record.campaign.organization_id,
          actorUserId: appContext.user.id,
        });
      }
      return NextResponse.json({
        campaign_id: resolveResumeObjectId({
          stage: "campaign",
          receipted: completedReceipt.metaCampaignId,
          persisted: existingCampaignId,
          requested: retryBody.meta_campaign_id,
        }),
        adset_id: resolveResumeObjectId({
          stage: "ad set",
          receipted: completedAdSetId,
          persisted: existingAdSetId,
          requested: retryBody.meta_adset_id,
        }),
        creative_id: resolveResumeObjectId({
          stage: "creative",
          receipted: completedCreativeId,
          persisted: existingCreativeId,
          requested: retryBody.meta_creative_id,
        }),
        ad_id: resolveResumeObjectId({
          stage: "ad",
          receipted: completedAdId,
          persisted: existingAdId,
        }),
        already_launched: true,
        stage: "ad",
      });
    }

    const scheduledReceipt: CampaignLaunchRecord = await assertCampaignLaunchScheduleDue({
      campaignId: id,
    });
    auditContext = { campaignId: id, campaignName: record.campaign.name };
    launchClaim = await claimManualCampaignLaunch({
      launchId: scheduledReceipt.id,
      campaignId: id,
      leaseMs: MANUAL_LAUNCH_LEASE_MS,
    });
    const receiptedResume = await loadManualCampaignLaunchProviderResume(launchClaim);
    const resumeState = {
      metaCampaignId: resolveResumeObjectId({
        stage: "campaign",
        receipted: receiptedResume.metaCampaignId,
        persisted: existingCampaignId,
        requested: retryBody.meta_campaign_id,
      }),
      metaAdSetId: resolveResumeObjectId({
        stage: "ad set",
        receipted: receiptedResume.metaAdSetId,
        persisted: existingAdSetId,
        requested: retryBody.meta_adset_id,
      }),
      metaCreativeId: resolveResumeObjectId({
        stage: "creative",
        receipted: receiptedResume.metaCreativeId,
        persisted: existingCreativeId,
        requested: retryBody.meta_creative_id,
      }),
      metaAdId: resolveResumeObjectId({
        stage: "ad",
        receipted: receiptedResume.metaAdId,
        persisted: existingAdId,
      }),
    };
    const launchLockToken = await acquireMetaLaunchLock(launchClaim);

    const launchPromise = (async () => {
      let heartbeatFailure: unknown = null;
      const assertClaimAndLocks = async () => {
        if (heartbeatFailure) {
          throw heartbeatFailure;
        }
        await renewManualCampaignLaunchClaim({
          claim: launchClaim!,
          leaseMs: MANUAL_LAUNCH_LEASE_MS,
        });
        await renewMetaLaunchLock(launchClaim!, launchLockToken);
      };
      const heartbeat = setInterval(() => {
        void assertClaimAndLocks().catch((error) => {
          heartbeatFailure = error;
        });
      }, MANUAL_LAUNCH_HEARTBEAT_MS);

      try {
      let launchInputDigest: string | null = null;
      await assertClaimAndLocks();
      const response = await launchCampaignToMeta(
        id,
        {
          metaCampaignId: resumeState.metaCampaignId ?? undefined,
          metaAdSetId: resumeState.metaAdSetId ?? undefined,
          metaCreativeId: resumeState.metaCreativeId ?? undefined,
          metaAdId: resumeState.metaAdId ?? undefined,
        },
        {
          testModeInterruptAfter:
            retryBody.test_mode_interrupt_after === "ad_set"
              ? "adset"
              : retryBody.test_mode_interrupt_after,
          assertProviderMutationAllowed: assertClaimAndLocks,
          bindLaunchInputSnapshot: async (binding) => {
            await bindManualCampaignLaunchInputSnapshot({
              claim: launchClaim!,
              binding,
            });
            launchInputDigest = binding.digest;
          },
          recordProviderReceipt: (receipt) =>
            recordManualCampaignLaunchProviderReceipt({
              claim: launchClaim!,
              ...receipt,
            }),
          armProviderMutation: (mutation) =>
            armManualCampaignLaunchProviderMutation({
              claim: launchClaim!,
              ...mutation,
            }),
          settleProviderMutation: (settlement) =>
            settleManualCampaignLaunchProviderMutation({
              claim: launchClaim!,
              settlement,
            }),
          persistLaunchState: (state, message) =>
            persistManualCampaignLaunchRuntime({
              claim: launchClaim!,
              state,
              message,
            }),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | (Partial<LaunchResponsePayload> & {
            campaign?: unknown;
            adset?: unknown;
            creative?: unknown;
            ad?: unknown;
          })
        | null;

      if (!response.ok || !data) {
        const inferredStage = normalizeStage(
          data?.stage ??
            persistedLaunchState?.current_stage ??
          (data?.campaign_id && data?.adset_id && data?.creative_id
            ? "ad"
            : data?.campaign_id && data?.adset_id
              ? "creative"
            : data?.campaign_id
                ? "ad_set"
                : "campaign"),
        );
        const launchError = new Error(data?.error || "Launch failed.") as Error & {
          code?: string;
          httpStatus?: number;
          stage?: LaunchResponsePayload["stage"];
          payload?: Partial<LaunchResponsePayload>;
        };
        launchError.code =
          typeof data?.code === "string" && /^[a-z0-9_]{3,80}$/.test(data.code)
            ? data.code
            : "provider_launch_failed";
        launchError.httpStatus = response.status;
        launchError.stage = inferredStage;
        launchError.payload = {
          campaign_id: typeof data?.campaign_id === "string" ? data.campaign_id : undefined,
          adset_id: typeof data?.adset_id === "string" ? data.adset_id : undefined,
          creative_id: typeof data?.creative_id === "string" ? data.creative_id : undefined,
          ad_id: typeof data?.ad_id === "string" ? data.ad_id : undefined,
          error: typeof data?.error === "string" ? data.error : "Launch failed.",
          code: launchError.code,
          stage: inferredStage,
        };
        throw launchError;
      }

      if (
        !("campaign_id" in data) ||
        !("adset_id" in data) ||
        !("creative_id" in data) ||
        !("ad_id" in data) ||
        typeof data.campaign_id !== "string" ||
        typeof data.adset_id !== "string" ||
        typeof data.creative_id !== "string" ||
        typeof data.ad_id !== "string"
      ) {
        const launchError = new Error("Launch failed.") as Error & {
          stage?: LaunchResponsePayload["stage"];
          payload?: Partial<LaunchResponsePayload>;
        };
        launchError.stage = normalizeStage(persistedLaunchState?.current_stage ?? "campaign");
        launchError.payload = {
          error: "Launch failed.",
          stage: normalizeStage(persistedLaunchState?.current_stage ?? "campaign"),
        };
        throw launchError;
      }

      if (!record.campaign.organization_id) {
        throw new ApiError(
          500,
          "Campaign is missing workspace context.",
          "campaign_workspace_missing",
        );
      }

      if (!launchInputDigest) {
        throw new ApiError(
          409,
          "The immutable launch input receipt is missing.",
          "launch_input_snapshot_missing",
        );
      }

      await assertClaimAndLocks();
      const receiptTimestamp = new Date().toISOString();
      await completeManualCampaignLaunchClaim({
        claim: launchClaim!,
        metaCampaignId: data.campaign_id,
        metaAdSetId: data.adset_id,
        metaCreativeId: data.creative_id,
        metaAdId: data.ad_id,
        executionMetadata: {
          source: "campaign_launch_route",
          providerObjectsCreatedPaused: true,
          launchAttemptCount: launchClaim!.attemptCount,
          launchLeaseGeneration: launchClaim!.leaseGeneration,
          recoveredFromPersistedRuntime: persistedLaunchState?.status === "completed",
          launchInputDigest,
        },
        event: {
          id: `campaign-created:${data.campaign_id}:generation:${launchClaim!.leaseGeneration}`,
          label: "Provider campaign object set reconciled",
          status: "success",
          target: record.campaign.name,
          detail: "The PAUSED provider object set and all immutable provider receipts were accepted by the current fenced launch owner.",
          timestamp: receiptTimestamp,
        },
      });
      launchCompletionCommitted = true;

      if (persistedContract.destinationContract.adDestination === "meta_instant_form") {
        await provisionCompletedMetaInstantFormRoute({
          record,
          organizationId: record.campaign.organization_id,
          actorUserId: appContext.user.id,
        });
      }

      return {
        campaign_id: data.campaign_id,
        adset_id: data.adset_id,
        ad_id: data.ad_id,
        creative_id: data.creative_id,
        already_launched: persistedLaunchState?.status === "completed" || undefined,
        stage: "ad" as const,
      };
      } finally {
        clearInterval(heartbeat);
      }
    })();

    inFlightLaunches.set(id, launchPromise);

    try {
      return NextResponse.json(await launchPromise);
    } finally {
      inFlightLaunches.delete(id);
      await releaseMetaLaunchLock(launchClaim, launchLockToken).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof CampaignLaunchOperatorActionRequiredError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          operator_action_id: error.operatorActionId,
        },
        { status: 409 },
      );
    }

    if (launchClaim && auditContext && !launchCompletionCommitted) {
      const rawErrorCode =
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : "provider_launch_failed";
      const errorCode = /^[a-z0-9_]{3,80}$/.test(rawErrorCode)
        ? rawErrorCode
        : "provider_launch_failed";
      const payload =
        error && typeof error === "object" && "payload" in error && error.payload && typeof error.payload === "object"
          ? (error.payload as Partial<LaunchResponsePayload>)
          : null;

      await failManualCampaignLaunchClaim({
        claim: launchClaim,
        errorCode,
        metaCampaignId:
          typeof payload?.campaign_id === "string" ? payload.campaign_id : null,
        metaAdSetIds:
          typeof payload?.adset_id === "string" ? [payload.adset_id] : [],
        metaAdIds: typeof payload?.ad_id === "string" ? [payload.ad_id] : [],
        executionMetadata: {
          source: "campaign_launch_route",
          errorCode,
          providerMutationOutcome: "failed_or_partial",
          launchLeaseGeneration: launchClaim.leaseGeneration,
        },
        event: {
          id: `launch-failed:${launchClaim.leaseGeneration}`,
          label: "Manual provider launch failed",
          status: "failed",
          target: auditContext.campaignName,
          detail: `The due launch attempt did not complete. Safe error code: ${errorCode}.`,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => undefined);
    }

    if (
      error &&
      typeof error === "object" &&
      "payload" in error &&
      error.payload &&
      typeof error.payload === "object"
    ) {
      const status =
        "httpStatus" in error &&
        typeof error.httpStatus === "number" &&
        Number.isInteger(error.httpStatus) &&
        error.httpStatus >= 400 &&
        error.httpStatus <= 599
          ? error.httpStatus
          : 500;
      const payload = error.payload as Partial<LaunchResponsePayload>;
      const code =
        typeof payload.code === "string" && /^[a-z0-9_]{3,80}$/.test(payload.code)
          ? payload.code
          : "provider_launch_failed";
      const operatorActionRequired = [
        "meta_provider_create_outcome_ambiguous",
        "campaign_launch_provider_receipt_persist_failed",
        "scheduled_launch_provider_receipt_persist_failed",
        "campaign_launch_provider_mutation_settlement_failed",
        "scheduled_launch_provider_mutation_settlement_failed",
        "meta_lookup_ambiguous",
      ].includes(code);
      return NextResponse.json(
        {
          ...payload,
          code,
          ...(operatorActionRequired && launchClaim
            ? { operator_action_id: launchClaim.id }
            : {}),
        },
        { status: operatorActionRequired ? 409 : status },
      );
    }

    return handleApiError(error, "Launch campaign");
  }
}
