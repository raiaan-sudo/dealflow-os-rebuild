import profile from "../../../config/release/approved-launch-profile.v1.json";

export const APPROVED_LAUNCH_PROFILE = Object.freeze(profile);

export type ApprovedProvider = keyof typeof profile.providers;

export function approvedProviderMode(provider: ApprovedProvider) {
  return APPROVED_LAUNCH_PROFILE.providers[provider];
}

export function isMetaProviderIncluded() {
  return approvedProviderMode("meta") === "included";
}

export function assertMetaProviderIncluded() {
  if (!isMetaProviderIncluded()) {
    throw new Error("meta_provider_excluded_from_approved_launch_profile");
  }
}
