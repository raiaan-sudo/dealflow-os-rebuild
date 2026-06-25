const META_RETURN_PATH_PREFIXES = [
  "/build/creatives",
  "/dashboard",
  "/launch",
  "/launch-success",
  "/launching",
  "/onboarding",
  "/paywall",
  "/preview",
  "/settings",
  "/unlock",
];

function buildCampaignScopedHref(path: string, campaignId?: string | null) {
  if (!campaignId) {
    return path;
  }

  const params = new URLSearchParams();
  params.set("campaignId", campaignId);
  return `${path}?${params.toString()}`;
}

export function buildOnboardingHref(campaignId?: string | null) {
  if (!campaignId) {
    return "/onboarding";
  }

  const params = new URLSearchParams();
  params.set("resume", "1");
  params.set("campaignId", campaignId);
  return `/onboarding?${params.toString()}`;
}

export function buildCreativeStudioHref(campaignId?: string | null) {
  return buildCampaignScopedHref("/build/creatives", campaignId);
}

export function buildPreviewHref(campaignId?: string | null) {
  return buildCampaignScopedHref("/preview", campaignId);
}

export function buildLaunchHref(campaignId?: string | null) {
  return buildCampaignScopedHref("/launch", campaignId);
}

export function buildLaunchingHref(campaignId?: string | null) {
  return buildCampaignScopedHref("/launching", campaignId);
}

export function buildDashboardHref(campaignId?: string | null) {
  return buildCampaignScopedHref("/dashboard", campaignId);
}

export function sanitizeMetaReturnPath(value: string | null | undefined, fallback = "/launch") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  const parsed = new URL(value, "https://dealflow.local");
  const allowed = META_RETURN_PATH_PREFIXES.some(
    (path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`),
  );

  if (!allowed || parsed.pathname.startsWith("/builder") || parsed.pathname.startsWith("/build/funnel")) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
