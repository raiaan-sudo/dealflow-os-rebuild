export type LaunchAuthorizedMetaPixelInput = {
  connectionStatus: string | null | undefined;
  currentPixelId: string | null | undefined;
  contractPixelId: string | null | undefined;
  contractStatus: string | null | undefined;
  trackingMode: string | null | undefined;
};

export type LaunchAuthorizedMetaPixelResult =
  | { allowed: true; pixelId: string }
  | {
      allowed: false;
      reason:
        | "meta_connection_not_connected"
        | "meta_campaign_tracking_contract_missing"
        | "meta_campaign_tracking_contract_not_configured"
        | "meta_campaign_tracking_mode_not_website"
        | "meta_campaign_pixel_missing"
        | "meta_campaign_pixel_drift";
    };

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

export function resolveLaunchAuthorizedMetaPixel(
  input: LaunchAuthorizedMetaPixelInput,
): LaunchAuthorizedMetaPixelResult {
  if (input.connectionStatus !== "connected") {
    return { allowed: false, reason: "meta_connection_not_connected" };
  }
  if (!input.contractStatus) {
    return { allowed: false, reason: "meta_campaign_tracking_contract_missing" };
  }
  if (input.contractStatus !== "configured") {
    return { allowed: false, reason: "meta_campaign_tracking_contract_not_configured" };
  }
  if (input.trackingMode !== "website_funnel") {
    return { allowed: false, reason: "meta_campaign_tracking_mode_not_website" };
  }
  const contractPixelId = clean(input.contractPixelId);
  if (!contractPixelId) {
    return { allowed: false, reason: "meta_campaign_pixel_missing" };
  }
  if (clean(input.currentPixelId) !== contractPixelId) {
    return { allowed: false, reason: "meta_campaign_pixel_drift" };
  }
  return { allowed: true, pixelId: contractPixelId };
}
