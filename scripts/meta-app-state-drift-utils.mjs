export const CAMPAIGN_345_ACTIVE_META = {
  campaignId: "345dcc04-8e87-4ead-b71a-40236e2ef52e",
  organizationId: "8b82dea3-54da-4ccb-accc-81931513436c",
  userId: "ddaff253-807d-419e-8411-7b276558f05e",
  metaCampaignId: "120248208607670616",
  metaAdSetId: "120248208608400616",
  metaAdId: "120248208609740616",
  metaCreativeId: "1387185106767238",
  dailyBudget: "300",
  destinationUrl: "https://app.agentdealflow.io/f/raiaan-realty",
};

export function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeMetaStatus(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isActiveMetaStatus(value) {
  return normalizeMetaStatus(value) === "ACTIVE";
}

export function isPausedMetaStatus(value) {
  return normalizeMetaStatus(value) === "PAUSED";
}

export function isCampaignPausedMetaStatus(value) {
  return normalizeMetaStatus(value) === "CAMPAIGN_PAUSED";
}

export function readPlanRuntime(plan) {
  const runtime = asRecord(asRecord(plan).runtime);
  const launchRuntime = asRecord(asRecord(plan).launch_runtime);

  return {
    status: typeof runtime.status === "string" ? runtime.status : null,
    safetyState: typeof runtime.safetyState === "string" ? runtime.safetyState : null,
    metaPushStatus: typeof runtime.metaPushStatus === "string" ? runtime.metaPushStatus : null,
    campaignId: typeof runtime.campaignId === "string" ? runtime.campaignId : null,
    adSetId: typeof runtime.adSetId === "string" ? runtime.adSetId : null,
    adId: typeof runtime.adId === "string" ? runtime.adId : null,
    launchRuntimeStatus: typeof launchRuntime.status === "string" ? launchRuntime.status : null,
    launchRuntimeStepStatus: typeof launchRuntime.step_status === "string" ? launchRuntime.step_status : null,
  };
}

export function metaProofIsExactActive(proof, expected = CAMPAIGN_345_ACTIVE_META) {
  return (
    proof?.campaign?.id === expected.metaCampaignId &&
    proof?.adset?.id === expected.metaAdSetId &&
    proof?.ad?.id === expected.metaAdId &&
    proof?.ad?.creative_id === expected.metaCreativeId &&
    proof?.adset?.campaign_id === expected.metaCampaignId &&
    proof?.ad?.campaign_id === expected.metaCampaignId &&
    proof?.ad?.adset_id === expected.metaAdSetId &&
    String(proof?.adset?.daily_budget ?? "") === expected.dailyBudget &&
    proof?.creative?.destinationLink === expected.destinationUrl &&
    isActiveMetaStatus(proof?.campaign?.status) &&
    isActiveMetaStatus(proof?.campaign?.effective_status) &&
    isActiveMetaStatus(proof?.adset?.status) &&
    isActiveMetaStatus(proof?.adset?.effective_status) &&
    isActiveMetaStatus(proof?.ad?.status) &&
    isActiveMetaStatus(proof?.ad?.effective_status)
  );
}

export function metaProofIsCampaignLevelPaused(proof, expected = CAMPAIGN_345_ACTIVE_META) {
  return (
    proof?.campaign?.id === expected.metaCampaignId &&
    proof?.adset?.id === expected.metaAdSetId &&
    proof?.ad?.id === expected.metaAdId &&
    proof?.ad?.creative_id === expected.metaCreativeId &&
    proof?.adset?.campaign_id === expected.metaCampaignId &&
    proof?.ad?.campaign_id === expected.metaCampaignId &&
    proof?.ad?.adset_id === expected.metaAdSetId &&
    String(proof?.adset?.daily_budget ?? "") === expected.dailyBudget &&
    proof?.creative?.destinationLink === expected.destinationUrl &&
    isPausedMetaStatus(proof?.campaign?.status) &&
    isPausedMetaStatus(proof?.campaign?.effective_status) &&
    (isActiveMetaStatus(proof?.adset?.status) || isPausedMetaStatus(proof?.adset?.status)) &&
    (isCampaignPausedMetaStatus(proof?.adset?.effective_status) || isPausedMetaStatus(proof?.adset?.effective_status)) &&
    (isActiveMetaStatus(proof?.ad?.status) || isPausedMetaStatus(proof?.ad?.status)) &&
    (isCampaignPausedMetaStatus(proof?.ad?.effective_status) || isPausedMetaStatus(proof?.ad?.effective_status))
  );
}

export function getMetaProofFailures(proof, expected = CAMPAIGN_345_ACTIVE_META) {
  const failures = [];
  if (proof?.campaign?.id !== expected.metaCampaignId) failures.push("campaign_id_mismatch");
  if (!isActiveMetaStatus(proof?.campaign?.status) || !isActiveMetaStatus(proof?.campaign?.effective_status)) {
    failures.push("campaign_not_active");
  }
  if (proof?.adset?.id !== expected.metaAdSetId) failures.push("adset_id_mismatch");
  if (proof?.adset?.campaign_id !== expected.metaCampaignId) failures.push("adset_campaign_mismatch");
  if (String(proof?.adset?.daily_budget ?? "") !== expected.dailyBudget) failures.push("adset_daily_budget_mismatch");
  if (!isActiveMetaStatus(proof?.adset?.status) || !isActiveMetaStatus(proof?.adset?.effective_status)) {
    failures.push("adset_not_active");
  }
  if (proof?.ad?.id !== expected.metaAdId) failures.push("ad_id_mismatch");
  if (proof?.ad?.campaign_id !== expected.metaCampaignId) failures.push("ad_campaign_mismatch");
  if (proof?.ad?.adset_id !== expected.metaAdSetId) failures.push("ad_adset_mismatch");
  if (proof?.ad?.creative_id !== expected.metaCreativeId) failures.push("ad_creative_mismatch");
  if (!isActiveMetaStatus(proof?.ad?.status) || !isActiveMetaStatus(proof?.ad?.effective_status)) {
    failures.push("ad_not_active");
  }
  if (proof?.creative?.id !== expected.metaCreativeId) failures.push("creative_id_mismatch");
  if (proof?.creative?.destinationLink !== expected.destinationUrl) failures.push("creative_destination_mismatch");
  return failures;
}

export function appRuntimeReflectsActiveMeta(campaignRow, expected = CAMPAIGN_345_ACTIVE_META) {
  const runtime = readPlanRuntime(campaignRow?.plan);
  return (
    campaignRow?.launch_status === "live" &&
    runtime.status === "live" &&
    runtime.safetyState === "live" &&
    runtime.metaPushStatus === "published" &&
    runtime.campaignId === expected.metaCampaignId &&
    runtime.adSetId === expected.metaAdSetId &&
    runtime.adId === expected.metaAdId &&
    runtime.launchRuntimeStatus === "live" &&
    runtime.launchRuntimeStepStatus === "active"
  );
}

export function appRuntimeReflectsPausedMeta(campaignRow, expected = CAMPAIGN_345_ACTIVE_META) {
  const runtime = readPlanRuntime(campaignRow?.plan);
  return (
    campaignRow?.launch_status === "paused" &&
    runtime.status === "paused" &&
    runtime.safetyState === "paused" &&
    runtime.metaPushStatus === "paused" &&
    runtime.campaignId === expected.metaCampaignId &&
    runtime.adSetId === expected.metaAdSetId &&
    runtime.adId === expected.metaAdId &&
    runtime.launchRuntimeStatus === "paused" &&
    runtime.launchRuntimeStepStatus === "paused"
  );
}

export function buildActiveRuntimePatch(plan, proof, now, expected = CAMPAIGN_345_ACTIVE_META) {
  const current = asRecord(plan);
  const currentRuntime = asRecord(current.runtime);
  const currentLaunchRuntime = asRecord(current.launch_runtime);
  const budgetDailyInput = Number(expected.dailyBudget) / 100;

  return {
    ...current,
    launch_status: "live",
    runtime: {
      ...currentRuntime,
      status: "live",
      safetyState: "live",
      launchMode: "live",
      lastAction: "Meta delivery verified ACTIVE read-only; app runtime reconciled without mutating Meta.",
      statusUpdatedAt: now,
      launchedAt: typeof currentRuntime.launchedAt === "string" ? currentRuntime.launchedAt : now,
      campaignId: expected.metaCampaignId,
      adSetId: expected.metaAdSetId,
      adId: expected.metaAdId,
      budgetDaily: `$${budgetDailyInput}/day`,
      budgetDailyInput,
      metaPushStatus: "published",
      metaAdSetIds: [expected.metaAdSetId],
      metaAdIds: [expected.metaAdId],
      pausedAdIds: [],
      metaLastMessage:
        "Meta campaign, ad set, creative, and ad were verified read-only as ACTIVE at the approved $3/day budget.",
    },
    launch_runtime: {
      ...currentLaunchRuntime,
      current_stage: "ad",
      status: "live",
      step_status: "active",
      campaign_id: expected.metaCampaignId,
      adset_id: expected.metaAdSetId,
      creative_id: expected.metaCreativeId,
      ad_id: expected.metaAdId,
      daily_budget: expected.dailyBudget,
      destination_url: expected.destinationUrl,
      updated_at: now,
      read_only_reconciled_at: now,
    },
  };
}

export function latestSnapshotIsFreshActive(snapshot, proof, nowMs = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  if (!snapshot) return false;
  const syncedAt = Date.parse(snapshot.synced_at ?? "");
  const adSetStatuses = Array.isArray(snapshot.ad_set_statuses) ? snapshot.ad_set_statuses : [];
  const adStatuses = Array.isArray(snapshot.ad_statuses) ? snapshot.ad_statuses : [];
  const adSet = adSetStatuses.find((row) => row?.id === proof?.adset?.id);
  const ad = adStatuses.find((row) => row?.id === proof?.ad?.id);

  return (
    Number.isFinite(syncedAt) &&
    nowMs - syncedAt <= maxAgeMs &&
    snapshot.meta_campaign_id === proof?.campaign?.id &&
    isActiveMetaStatus(snapshot.campaign_status) &&
    isActiveMetaStatus(adSet?.status) &&
    isActiveMetaStatus(ad?.status)
  );
}

export function latestSnapshotIsFreshPaused(snapshot, proof, nowMs = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  if (!snapshot) return false;
  const syncedAt = Date.parse(snapshot.synced_at ?? "");
  const adSetStatuses = Array.isArray(snapshot.ad_set_statuses) ? snapshot.ad_set_statuses : [];
  const adStatuses = Array.isArray(snapshot.ad_statuses) ? snapshot.ad_statuses : [];
  const adSet = adSetStatuses.find((row) => row?.id === proof?.adset?.id);
  const ad = adStatuses.find((row) => row?.id === proof?.ad?.id);

  return (
    Number.isFinite(syncedAt) &&
    nowMs - syncedAt <= maxAgeMs &&
    snapshot.meta_campaign_id === proof?.campaign?.id &&
    isPausedMetaStatus(snapshot.campaign_status) &&
    (isActiveMetaStatus(adSet?.status) || isPausedMetaStatus(adSet?.status)) &&
    (isActiveMetaStatus(ad?.status) || isPausedMetaStatus(ad?.status))
  );
}
