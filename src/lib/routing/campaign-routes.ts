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

const DEFAULT_APPROVED_META_RETURN_HOSTS = [
  "agentdealflow.io",
  "app.agentdealflow.io",
  "clicktoscale.io",
  "localhost",
  "www.agentdealflow.io",
  "www.clicktoscale.io",
  "127.0.0.1",
];

function normalizeHost(value: string | null | undefined) {
  const host = (value ?? "").trim().toLowerCase();

  if (!host || host.length > 253 || host.includes("..")) {
    return null;
  }

  return /^[a-z0-9.-]+(?::[0-9]+)?$/.test(host) ? host : null;
}

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return normalizeHost(new URL(value).host);
  } catch {
    return null;
  }
}

function parseHostList(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => normalizeHost(item))
    .filter((item): item is string => Boolean(item));
}

export function getApprovedMetaReturnHosts() {
  return Array.from(
    new Set([
      ...DEFAULT_APPROVED_META_RETURN_HOSTS,
      hostFromUrl(process.env.NEXT_PUBLIC_APP_URL),
      hostFromUrl(process.env.APP_URL),
      hostFromUrl(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
      ...parseHostList(process.env.DEALFLOW_PLATFORM_LAUNCH_DOMAIN),
      ...parseHostList(process.env.DEALFLOW_PLATFORM_FUNNEL_HOSTS),
      ...parseHostList(process.env.META_OAUTH_RETURN_HOSTS),
    ].filter((item): item is string => Boolean(item))),
  );
}

export function sanitizeMetaReturnHost(value: string | null | undefined) {
  const host = normalizeHost(value);
  if (!host) {
    return null;
  }

  const approvedHosts = getApprovedMetaReturnHosts();
  return approvedHosts.includes(host) ? host : null;
}

export function getMetaReturnOrigin(host: string | null | undefined, fallbackUrl: string) {
  const safeHost = sanitizeMetaReturnHost(host) ?? hostFromUrl(fallbackUrl);
  if (!safeHost) {
    return fallbackUrl;
  }

  const protocol = safeHost.startsWith("localhost") || safeHost.startsWith("127.0.0.1")
    ? "http"
    : "https";
  return `${protocol}://${safeHost}`;
}

export function getCampaignIdFromMetaReturnPath(value: string | null | undefined) {
  const safePath = sanitizeMetaReturnPath(value, "/launch");

  try {
    const parsed = new URL(safePath, "https://dealflow.local");
    return parsed.searchParams.get("campaignId");
  } catch {
    return null;
  }
}

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
