export const META_PIXEL_CONSENT_COOKIE = "dealflow_meta_pixel_consent";

export function getMetaPixelConsentPolicyVersion(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.META_PIXEL_CONSENT_POLICY_VERSION?.trim() ?? "";
  return /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : null;
}

export function isMetaPixelTrackingAllowed(params: {
  cookieValue?: string | null;
  env?: Record<string, string | undefined>;
}) {
  const env = params.env ?? process.env;
  const policyVersion = getMetaPixelConsentPolicyVersion(env);

  return Boolean(
    env.ALLOW_META_PIXEL_EVENTS === "true" &&
      policyVersion &&
      params.cookieValue === `granted:${policyVersion}`,
  );
}
