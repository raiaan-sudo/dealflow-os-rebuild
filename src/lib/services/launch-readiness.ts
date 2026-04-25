type MetaTrackingStateLike = {
  status?: {
    status?: string | null;
    metadata?: {
      pixelId?: string | null;
      launchDomain?: string | null;
      domainVerified?: boolean;
      [key: string]: unknown;
    } | null;
  } | null;
} | null;

export type LaunchRequirements = {
  campaignSaved: boolean;
  metaConnected: boolean;
  pixelReady: boolean;
  domainReady: boolean;
};

export function getLaunchBlockingReasons(requirements: LaunchRequirements) {
  return [
    !requirements.campaignSaved ? "Save the campaign first" : null,
    !requirements.metaConnected ? "Connect a real Meta ad account" : null,
    !requirements.pixelReady ? "Configure the Meta pixel" : null,
    !requirements.domainReady ? "Verify the launch domain" : null,
  ].filter((reason): reason is string => Boolean(reason));
}

export function getDomainVerificationReady(metaTrackingState: MetaTrackingStateLike) {
  const metadata = metaTrackingState?.status?.metadata ?? null;

  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "domainVerified" in metadata &&
      metadata.domainVerified === true,
  );
}

export function getPixelReady(metaTrackingState: MetaTrackingStateLike) {
  const metadata = metaTrackingState?.status?.metadata ?? null;

  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "pixelId" in metadata &&
      typeof metadata.pixelId === "string" &&
      metadata.pixelId.trim().length > 0,
  );
}

export function getLaunchDomainReady(metaTrackingState: MetaTrackingStateLike) {
  const metadata = metaTrackingState?.status?.metadata ?? null;

  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "launchDomain" in metadata &&
      typeof metadata.launchDomain === "string" &&
      metadata.launchDomain.trim().length > 0,
  );
}

export function getLaunchRequirements(params: {
  campaignSaved: boolean;
  metaConnected: boolean;
  metaTrackingState: MetaTrackingStateLike;
}): LaunchRequirements {
  const pixelConfigured = getPixelReady(params.metaTrackingState);
  const domainConfigured = getLaunchDomainReady(params.metaTrackingState);
  const domainVerificationReady = getDomainVerificationReady(params.metaTrackingState);

  return {
    campaignSaved: params.campaignSaved,
    metaConnected: params.metaConnected,
    pixelReady: pixelConfigured,
    domainReady: domainConfigured && domainVerificationReady,
  };
}
