export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

type EnvValidation = {
  configured: boolean;
  missing: string[];
};

function requireEnvValue(key: string, value: string | undefined | null) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing required environment variable: ${key}.`);
  }

  return normalized;
}

function validateEnv(required: Array<[string, string | undefined | null]>): EnvValidation {
  const missing = required
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function getSupabaseEnvOrThrow() {
  const env = getSupabaseEnv();

  if (!env) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return env;
}

export function hasSupabaseEnv() {
  return Boolean(getSupabaseEnv());
}

export function getAiEnv() {
  const provider = process.env.AI_PROVIDER ?? "openai";
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const baseUrl =
    process.env.AI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    model,
    baseUrl,
  };
}

export function getAiEnvOrThrow() {
  const env = getAiEnv();

  if (!env) {
    throw new Error(
      "Missing AI environment variables. Set AI_API_KEY or OPENAI_API_KEY before using AI features.",
    );
  }

  return env;
}

export function hasAiEnv() {
  return Boolean(getAiEnv());
}

export function getImageGenerationEnv() {
  const ai = getAiEnv();
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";

  if (!ai) {
    return null;
  }

  return {
    ...ai,
    model: model === "gpt-image-1" ? "gpt-image-1" : "gpt-image-1.5",
    fallbackModel: "gpt-image-1" as const,
  };
}

export function validateImageGenerationEnv() {
  const ai = getAiEnv();

  return validateEnv([
    ["OPENAI_API_KEY", ai?.provider === "openai" ? ai?.apiKey : null],
    ["OPENAI_BASE_URL", ai?.provider === "openai" ? ai?.baseUrl : null],
  ]);
}

export type MediaGenerationProvider = "openai" | "higgsfield" | "higgsfield_marketing_studio";

export function getMediaGenerationProvider(): MediaGenerationProvider {
  const provider = (process.env.MEDIA_GENERATION_PROVIDER ?? "openai").trim().toLowerCase();
  if (provider === "higgsfield_marketing_studio" || provider === "higgsfield-marketing-studio") {
    return "higgsfield_marketing_studio";
  }

  return provider === "higgsfield" ? "higgsfield" : "openai";
}

export function getMediaGenerationFallbackProvider(): MediaGenerationProvider | null {
  const provider = (process.env.MEDIA_GENERATION_FALLBACK_PROVIDER ?? "").trim().toLowerCase();

  if (!provider) {
    return null;
  }

  if (provider === "higgsfield_marketing_studio" || provider === "higgsfield-marketing-studio") {
    return "higgsfield_marketing_studio";
  }

  if (provider === "higgsfield") {
    return "higgsfield";
  }

  return provider === "openai" ? "openai" : null;
}

export function getHiggsfieldEnv() {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  const apiKey = process.env.HF_API_KEY?.trim();
  const apiSecret = process.env.HF_API_SECRET?.trim();
  const baseUrl = process.env.HIGGSFIELD_BASE_URL?.trim() || "https://platform.higgsfield.ai";

  if (!credentials && (!apiKey || !apiSecret)) {
    return null;
  }

  return {
    credentials: credentials || `${apiKey}:${apiSecret}`,
    apiKey: apiKey || null,
    apiSecret: apiSecret || null,
    baseUrl,
    imageModel: process.env.HIGGSFIELD_IMAGE_MODEL?.trim() || "marketing_studio_image",
    videoModel: process.env.HIGGSFIELD_VIDEO_MODEL?.trim() || "marketing_studio_video",
    ugcVideoModel: process.env.HIGGSFIELD_UGC_VIDEO_MODEL?.trim() || "soul_cast",
    videoFallbackModel: process.env.HIGGSFIELD_VIDEO_FALLBACK_MODEL?.trim() || "seedance_2_0",
  };
}

export function getHiggsfieldMarketingStudioEnv() {
  const env = getHiggsfieldEnv();
  const mode = (process.env.HIGGSFIELD_MARKETING_STUDIO_MODE ?? "cli").trim().toLowerCase();

  return {
    ...env,
    imageModel: env?.imageModel ?? process.env.HIGGSFIELD_IMAGE_MODEL?.trim() ?? "marketing_studio_image",
    videoModel: env?.videoModel ?? process.env.HIGGSFIELD_VIDEO_MODEL?.trim() ?? "marketing_studio_video",
    ugcVideoModel: env?.ugcVideoModel ?? process.env.HIGGSFIELD_UGC_VIDEO_MODEL?.trim() ?? "soul_cast",
    videoFallbackModel: env?.videoFallbackModel ?? process.env.HIGGSFIELD_VIDEO_FALLBACK_MODEL?.trim() ?? "seedance_2_0",
    enabled: process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED === "true",
    cliEnabled: process.env.HIGGSFIELD_CLI_ENABLED === "true",
    cliPath: process.env.HIGGSFIELD_CLI_PATH?.trim() || "higgsfield",
    mcpFutureOnly: true,
    mode: mode === "cli" ? "cli" : "api_adapter",
  };
}

export function validateHiggsfieldEnv() {
  const env = getHiggsfieldEnv();

  return validateEnv([
    ["HF_CREDENTIALS or HF_API_KEY/HF_API_SECRET", env?.credentials],
    ["HIGGSFIELD_IMAGE_MODEL", env?.imageModel],
    ["HIGGSFIELD_VIDEO_MODEL", env?.videoModel],
  ]);
}

export function getServiceRoleEnv() {
  const supabase = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabase || !serviceRoleKey) {
    return null;
  }

  return {
    url: supabase.url,
    serviceRoleKey,
  };
}

export function getInternalSystemJobsSecret() {
  return (
    process.env.INTERNAL_SYSTEM_JOBS_SECRET ??
    process.env.CRON_SECRET ??
    ""
  ).trim();
}

export function getInternalSystemJobSecrets() {
  return Array.from(
    new Set(
      [
        process.env.INTERNAL_SYSTEM_JOBS_SECRET,
        process.env.CRON_SECRET,
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

export function getInternalAdminEmails() {
  return (process.env.INTERNAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getBillingAdminOverrideEmails() {
  return (process.env.BILLING_ADMIN_OVERRIDE_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getInternalAdminEmails().includes(email.toLowerCase());
}

export function isBillingAdminOverrideEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getBillingAdminOverrideEmails().includes(email.toLowerCase());
}

export function isBillingAdminOverrideEnabled() {
  return process.env.ALLOW_BILLING_ADMIN_OVERRIDE === "true";
}

export function isBillingCheckoutSafeModeEnabled() {
  return process.env.BILLING_CHECKOUT_SAFE_MODE === "true";
}

export function getQaBillingAcceptanceOverrideEmails() {
  return (process.env.QA_BILLING_ACCEPTANCE_OVERRIDE_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getQaBillingAcceptanceOverrideUserIds() {
  return (process.env.QA_BILLING_ACCEPTANCE_OVERRIDE_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaBillingAcceptanceOverrideOrgIds() {
  return (process.env.QA_BILLING_ACCEPTANCE_OVERRIDE_ORG_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaBillingAcceptanceOverrideCampaignIds() {
  return (process.env.QA_BILLING_ACCEPTANCE_OVERRIDE_CAMPAIGN_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaBillingAcceptanceOverridePlanTiers() {
  return (process.env.QA_BILLING_ACCEPTANCE_OVERRIDE_PLAN_TIERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isQaBillingAcceptanceOverrideEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getQaBillingAcceptanceOverrideEmails().includes(email.toLowerCase());
}

export function isQaBillingAcceptanceOverrideUser(userId?: string | null) {
  if (!userId) {
    return false;
  }

  return getQaBillingAcceptanceOverrideUserIds().includes(userId);
}

export function isQaBillingAcceptanceOverrideOrg(organizationId?: string | null) {
  if (!organizationId) {
    return false;
  }

  return getQaBillingAcceptanceOverrideOrgIds().includes(organizationId);
}

export function isQaBillingAcceptanceOverrideCampaign(campaignId?: string | null) {
  if (!campaignId) {
    return false;
  }

  return getQaBillingAcceptanceOverrideCampaignIds().includes(campaignId);
}

export function isQaBillingAcceptanceOverrideEnabled() {
  return process.env.ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE === "true";
}

export function getQaGenerationCreditOverrideEmails() {
  return (process.env.QA_GENERATION_CREDIT_OVERRIDE_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getQaGenerationCreditOverrideUserIds() {
  return (process.env.QA_GENERATION_CREDIT_OVERRIDE_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaGenerationCreditOverrideOrgIds() {
  return (process.env.QA_GENERATION_CREDIT_OVERRIDE_ORG_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaGenerationCreditOverrideCampaignIds() {
  return (process.env.QA_GENERATION_CREDIT_OVERRIDE_CAMPAIGN_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getQaGenerationCreditOverrideMaxCents() {
  const parsed = Number.parseInt(process.env.QA_GENERATION_CREDIT_OVERRIDE_MAX_CENTS ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isQaGenerationCreditOverrideEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getQaGenerationCreditOverrideEmails().includes(email.toLowerCase());
}

export function isQaGenerationCreditOverrideUser(userId?: string | null) {
  if (!userId) {
    return false;
  }

  return getQaGenerationCreditOverrideUserIds().includes(userId);
}

export function isQaGenerationCreditOverrideOrg(organizationId?: string | null) {
  if (!organizationId) {
    return false;
  }

  return getQaGenerationCreditOverrideOrgIds().includes(organizationId);
}

export function isQaGenerationCreditOverrideCampaign(campaignId?: string | null) {
  if (!campaignId) {
    return false;
  }

  return getQaGenerationCreditOverrideCampaignIds().includes(campaignId);
}

export function isQaGenerationCreditOverrideEnabled() {
  return process.env.ALLOW_QA_GENERATION_CREDIT_OVERRIDE === "true";
}

export function isMetaOffboardingDeletionEnabled() {
  return process.env.ENABLE_META_OFFBOARDING_DELETION === "true";
}

export function isCreativeStorageOffboardingDeletionEnabled() {
  return process.env.ENABLE_CREATIVE_STORAGE_OFFBOARDING_DELETION === "true";
}

export function getMetaEnv() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  const loginConfigId = process.env.META_LOGIN_CONFIG_ID?.trim() || null;
  const apiVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";
  const scopes =
    process.env.META_SCOPES ??
    "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement";
  const executionMode = process.env.META_EXECUTION_MODE ?? "sandbox";

  if (!appId || !appSecret || !redirectUri || !encryptionKey) {
    return null;
  }

  return {
    appId,
    appSecret,
    redirectUri,
    encryptionKey,
    loginConfigId,
    apiVersion,
    scopes,
    executionMode: executionMode === "live" ? "live" : "sandbox",
  };
}

function normalizeEnvHostname(value: string | undefined | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split("/")[0]?.trim().toLowerCase() || null;
  }
}

function getEnvList(value: string | undefined | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getDealFlowPlatformLaunchDomainEnv() {
  const launchDomain = normalizeEnvHostname(process.env.DEALFLOW_PLATFORM_LAUNCH_DOMAIN);
  const configuredHosts = getEnvList(process.env.DEALFLOW_PLATFORM_FUNNEL_HOSTS)
    .map((host) => normalizeEnvHostname(host))
    .filter((host): host is string => Boolean(host));
  const publicAppHost = normalizeEnvHostname(
    process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
  );
  const funnelHosts = Array.from(
    new Set([
      ...configuredHosts,
      ...(publicAppHost ? [publicAppHost] : []),
      ...(launchDomain ? [launchDomain] : []),
    ]),
  );

  return {
    launchDomain,
    funnelHosts,
    domainVerified: process.env.DEALFLOW_PLATFORM_LAUNCH_DOMAIN_VERIFIED === "true",
  };
}

export function getMetaEnvOrThrow() {
  const env = getMetaEnv();

  if (!env) {
    throw new Error(
      "Missing Meta environment variables. Set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, and META_TOKEN_ENCRYPTION_KEY.",
    );
  }

  return env;
}

export function hasMetaEnv() {
  return Boolean(getMetaEnv());
}

export function validateMetaEnv() {
  const env = getMetaEnv();

  return validateEnv([
    ["META_APP_ID", env?.appId],
    ["META_APP_SECRET", env?.appSecret],
    ["META_REDIRECT_URI", env?.redirectUri],
    ["META_TOKEN_ENCRYPTION_KEY", env?.encryptionKey],
  ]);
}

export function getPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  return requireEnvValue(
    "NEXT_PUBLIC_APP_URL",
    configured,
  ).replace(/\/$/, "");
}

function shouldUseStripeTestEnv() {
  return process.env.STRIPE_FORCE_TEST_MODE === "true" && process.env.VERCEL_ENV !== "production";
}

export function getStripeEnv() {
  const useTestEnv = shouldUseStripeTestEnv();
  const secretKey = useTestEnv ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
  const webhookSecret = useTestEnv
    ? process.env.STRIPE_TEST_WEBHOOK_SECRET
    : process.env.STRIPE_WEBHOOK_SECRET;
  const starterPriceId = useTestEnv
    ? process.env.STRIPE_TEST_STARTER_PRICE_ID
    : process.env.STRIPE_STARTER_PRICE_ID;
  const proPriceId = useTestEnv ? process.env.STRIPE_TEST_PRO_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
  const growthPriceId = useTestEnv
    ? process.env.STRIPE_TEST_GROWTH_PRICE_ID
    : process.env.STRIPE_GROWTH_PRICE_ID;
  const performanceBasePriceId = useTestEnv
    ? process.env.STRIPE_TEST_PERFORMANCE_BASE_PRICE_ID
    : process.env.STRIPE_PERFORMANCE_BASE_PRICE_ID;
  const performanceLeadPriceId = useTestEnv
    ? process.env.STRIPE_TEST_PERFORMANCE_LEAD_PRICE_ID
    : process.env.STRIPE_PERFORMANCE_LEAD_PRICE_ID;
  const performanceLeadMeterEventName =
    (useTestEnv
      ? process.env.STRIPE_TEST_PERFORMANCE_LEAD_METER_EVENT_NAME
      : process.env.STRIPE_PERFORMANCE_LEAD_METER_EVENT_NAME) || "dealflow_billable_lead";

  if (!secretKey || !webhookSecret || !starterPriceId || !proPriceId) {
    return null;
  }

  return {
    secretKey,
    webhookSecret,
    starterPriceId,
    proPriceId,
    growthPriceId: growthPriceId ?? null,
    performanceBasePriceId: performanceBasePriceId ?? null,
    performanceLeadPriceId: performanceLeadPriceId ?? null,
    performanceLeadMeterEventName,
  };
}

export function hasStripeEnv() {
  return Boolean(getStripeEnv());
}

export function validateStripeEnv() {
  const env = getStripeEnv();
  const useTestEnv = shouldUseStripeTestEnv();

  return validateEnv([
    [useTestEnv ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY", env?.secretKey],
    [useTestEnv ? "STRIPE_TEST_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET", env?.webhookSecret],
    [useTestEnv ? "STRIPE_TEST_STARTER_PRICE_ID" : "STRIPE_STARTER_PRICE_ID", env?.starterPriceId],
    [useTestEnv ? "STRIPE_TEST_PRO_PRICE_ID" : "STRIPE_PRO_PRICE_ID", env?.proPriceId],
  ]);
}

export function getVideoGenerationEnv() {
  const apiKey = process.env.HEYGEN_API_KEY ?? null;
  const baseUrl = process.env.HEYGEN_BASE_URL ?? "https://api.heygen.com";
  const avatarId = process.env.HEYGEN_AVATAR_ID ?? process.env.ARCADS_AVATAR_ID ?? null;
  const voiceId = process.env.HEYGEN_VOICE_ID ?? process.env.ARCADS_VOICE_ID ?? null;

  if (!apiKey && !avatarId && !voiceId) {
    return null;
  }

  return {
    apiKey,
    baseUrl,
    avatarId,
    voiceId,
  };
}

export function getVideoGenerationEnvOrThrow() {
  const env = getVideoGenerationEnv();

  if (!env) {
    throw new Error(
      "Missing video generation environment variables. Set HEYGEN_API_KEY, HEYGEN_AVATAR_ID, and HEYGEN_VOICE_ID.",
    );
  }

  return env;
}

export function validateVideoGenerationEnv() {
  const env = getVideoGenerationEnv();

  return validateEnv([
    ["HEYGEN_API_KEY", env?.apiKey],
    ["HEYGEN_AVATAR_ID", env?.avatarId],
    ["HEYGEN_VOICE_ID", env?.voiceId],
  ]);
}

export function getVoiceGenerationEnv() {
  const apiKey = process.env.ELEVENLABS_API_KEY ?? null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? null;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

  if (!apiKey && !voiceId) {
    return null;
  }

  return {
    apiKey,
    voiceId,
    modelId,
  };
}

export function getVoiceGenerationEnvOrThrow() {
  const env = getVoiceGenerationEnv();

  if (!env) {
    throw new Error(
      "Missing voice generation environment variables. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.",
    );
  }

  return env;
}

export function validateVoiceGenerationEnv() {
  const env = getVoiceGenerationEnv();

  return validateEnv([
    ["ELEVENLABS_API_KEY", env?.apiKey],
    ["ELEVENLABS_VOICE_ID", env?.voiceId],
  ]);
}

export function getTwilioEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return null;
  }

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    internalLeadSmsEnabled: process.env.INTERNAL_LEAD_SMS_ENABLED === "true",
  };
}

export function hasTwilioEnv() {
  return Boolean(getTwilioEnv());
}
