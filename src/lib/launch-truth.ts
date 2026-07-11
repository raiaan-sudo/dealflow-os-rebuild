export type LaunchReceiptTruth = {
  resultStatus: string | null;
  scheduledFor?: string | null;
  campaignId: string | null;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaCreativeId: string | null;
  metaAdIds: string[];
};

export type LaunchTruthState =
  | "missing"
  | "failed"
  | "scheduled"
  | "partial"
  | "provider_accepted"
  | "provider_confirmed";

export type LaunchProviderObjectIds = {
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  metaAdId: string | null;
  source: "durable_success_receipt" | "mutable_runtime";
};

type PausedLaunchConfirmationSnapshot = {
  syncResult?: string | null;
  metaCampaignId?: string | null;
  metaAdSetIds?: string[];
  metaAdIds?: string[];
  campaignEntityId?: string | null;
  campaignConfiguredStatus?: string | null;
  campaignEffectiveStatus?: string | null;
  adSetStatuses?: Array<{
    id?: string | null;
    configuredStatus?: string | null;
    effectiveStatus?: string | null;
  }>;
  adStatuses?: Array<{
    id?: string | null;
    configuredStatus?: string | null;
    effectiveStatus?: string | null;
  }>;
};

function isConfiguredPaused(value: string | null | undefined) {
  return value?.trim().toUpperCase() === "PAUSED";
}

function isEffectivelyPaused(value: string | null | undefined) {
  return Boolean(value?.trim().toUpperCase().includes("PAUSED"));
}

export function isFreshPausedLaunchConfirmation(params: {
  receipt: LaunchReceiptTruth | null;
  snapshot: PausedLaunchConfirmationSnapshot | null;
  hasFreshMetaConfirmation: boolean;
}) {
  const { receipt, snapshot } = params;
  if (
    !params.hasFreshMetaConfirmation ||
    !receipt ||
    receipt.resultStatus?.trim().toLowerCase() !== "success" ||
    !receipt.metaCampaignId ||
    receipt.metaAdSetIds.length !== 1 ||
    !receipt.metaCreativeId ||
    receipt.metaAdIds.length !== 1 ||
    !snapshot ||
    snapshot.syncResult !== "success" ||
    snapshot.metaCampaignId !== receipt.metaCampaignId ||
    snapshot.campaignEntityId !== receipt.metaCampaignId ||
    snapshot.metaAdSetIds?.length !== 1 ||
    snapshot.metaAdSetIds[0] !== receipt.metaAdSetIds[0] ||
    snapshot.metaAdIds?.length !== 1 ||
    snapshot.metaAdIds[0] !== receipt.metaAdIds[0] ||
    !isConfiguredPaused(snapshot.campaignConfiguredStatus) ||
    !isEffectivelyPaused(snapshot.campaignEffectiveStatus)
  ) {
    return false;
  }

  const adSet = snapshot.adSetStatuses?.[0];
  const ad = snapshot.adStatuses?.[0];
  return (
    snapshot.adSetStatuses?.length === 1 &&
    adSet?.id === receipt.metaAdSetIds[0] &&
    isConfiguredPaused(adSet.configuredStatus) &&
    isEffectivelyPaused(adSet.effectiveStatus) &&
    snapshot.adStatuses?.length === 1 &&
    ad?.id === receipt.metaAdIds[0] &&
    isConfiguredPaused(ad.configuredStatus) &&
    isEffectivelyPaused(ad.effectiveStatus)
  );
}

export function resolveLaunchProviderObjectIds(params: {
  resolvedCampaignId: string | null;
  runtime: {
    metaCampaignId: string | null;
    metaAdSetId: string | null;
    metaAdId: string | null;
  };
  receipt: LaunchReceiptTruth | null;
}): LaunchProviderObjectIds {
  const normalizedStatus = params.receipt?.resultStatus?.trim().toLowerCase() ?? "";
  const authoritativeReceipt =
    normalizedStatus === "success" &&
    Boolean(params.resolvedCampaignId) &&
    params.receipt?.campaignId === params.resolvedCampaignId &&
    Boolean(params.receipt.metaCampaignId) &&
    params.receipt.metaAdSetIds.length === 1 &&
    Boolean(params.receipt.metaCreativeId) &&
    params.receipt.metaAdIds.length === 1;

  if (authoritativeReceipt && params.receipt) {
    return {
      metaCampaignId: params.receipt.metaCampaignId,
      metaAdSetId: params.receipt.metaAdSetIds[0] ?? null,
      metaAdId: params.receipt.metaAdIds[0] ?? null,
      source: "durable_success_receipt",
    };
  }

  return {
    ...params.runtime,
    source: "mutable_runtime",
  };
}

export function resolveLaunchTruth(params: {
  requestedCampaignId: string | null;
  resolvedCampaignId: string | null;
  receipt: LaunchReceiptTruth | null;
  confirmedInMeta: boolean;
}): LaunchTruthState {
  if (
    !params.requestedCampaignId ||
    !params.resolvedCampaignId ||
    params.requestedCampaignId !== params.resolvedCampaignId ||
    !params.receipt ||
    !params.receipt.campaignId ||
    params.receipt.campaignId !== params.resolvedCampaignId
  ) {
    return "missing";
  }

  const normalizedStatus = params.receipt.resultStatus?.trim().toLowerCase() ?? "";

  if (normalizedStatus === "failed") {
    return "failed";
  }

  if (
    normalizedStatus === "scheduled" &&
    params.receipt.scheduledFor &&
    Number.isFinite(new Date(params.receipt.scheduledFor).getTime())
  ) {
    return "scheduled";
  }

  if (normalizedStatus === "partial" || normalizedStatus === "partial_success") {
    return "partial";
  }

  const hasProviderObjectSet =
    normalizedStatus === "success" &&
    Boolean(params.receipt.metaCampaignId) &&
    params.receipt.metaAdSetIds.length === 1 &&
    Boolean(params.receipt.metaCreativeId) &&
    params.receipt.metaAdIds.length === 1;

  if (!hasProviderObjectSet) {
    return "missing";
  }

  return params.confirmedInMeta ? "provider_confirmed" : "provider_accepted";
}

export function getLaunchTruthPresentation(state: LaunchTruthState) {
  switch (state) {
    case "provider_confirmed":
      return {
        eyebrow: "Launch",
        title: "Campaign object set confirmed in Meta (paused)",
        description: "A durable receipt and fresh Meta sync confirm the campaign, ad set, and ad are configured PAUSED; the creative is durably receipted. No delivery or spend is inferred.",
        badge: "Provider confirmed; paused",
        tone: "success" as const,
      };
    case "provider_accepted":
      return {
        eyebrow: "Launch verification",
        title: "Campaign objects recorded in Meta (paused at completion)",
        description: "A durable receipt records the campaign, ad set, and ad as configured PAUSED at completion, plus one creative. Fresh Meta confirmation is still required; no delivery or spend is inferred.",
        badge: "Created paused; awaiting confirmation",
        tone: "warning" as const,
      };
    case "partial":
      return {
        eyebrow: "Launch needs attention",
        title: "Campaign launch is partially complete",
        description: "The durable launch receipt records one or more failed downstream objects. Review and reconcile before continuing.",
        badge: "Partial launch",
        tone: "warning" as const,
      };
    case "failed":
      return {
        eyebrow: "Launch failed",
        title: "Campaign was not launched",
        description: "The durable launch receipt records a failed attempt. No success is being inferred from this page URL.",
        badge: "Failed",
        tone: "danger" as const,
      };
    case "scheduled":
      return {
        eyebrow: "Launch scheduled",
        title: "Campaign queued for 9:00 a.m. Eastern",
        description: "A durable launch intent exists. No provider objects have been created yet.",
        badge: "Scheduled; not launched",
        tone: "neutral" as const,
      };
    default:
      return {
        eyebrow: "Launch status unavailable",
        title: "No verified launch receipt",
        description: "This URL does not prove a launch. Return to the launch flow or dashboard and retry only after the saved state is reconciled.",
        badge: "Not verified",
        tone: "neutral" as const,
      };
  }
}
