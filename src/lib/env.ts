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

export function getInternalAdminEmails() {
  return (process.env.INTERNAL_ADMIN_EMAILS ?? "")
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

export function isBillingAdminOverrideEnabled() {
  return process.env.ALLOW_BILLING_ADMIN_OVERRIDE === "true";
}

export function getMetaEnv() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  const scopes = process.env.META_SCOPES ?? "ads_management,ads_read,business_management";
  const executionMode = process.env.META_EXECUTION_MODE ?? "sandbox";

  if (!appId || !appSecret || !redirectUri || !encryptionKey) {
    return null;
  }

  return {
    appId,
    appSecret,
    redirectUri,
    encryptionKey,
    scopes,
    executionMode: executionMode === "live" ? "live" : "sandbox",
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

export function getStripeEnv() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const starterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const growthPriceId = process.env.STRIPE_GROWTH_PRICE_ID;

  if (!secretKey || !webhookSecret || !starterPriceId || !proPriceId || !growthPriceId) {
    return null;
  }

  return {
    secretKey,
    webhookSecret,
    starterPriceId,
    proPriceId,
    growthPriceId,
  };
}

export function hasStripeEnv() {
  return Boolean(getStripeEnv());
}

export function validateStripeEnv() {
  const env = getStripeEnv();

  return validateEnv([
    ["STRIPE_SECRET_KEY", env?.secretKey],
    ["STRIPE_WEBHOOK_SECRET", env?.webhookSecret],
    ["STRIPE_STARTER_PRICE_ID", env?.starterPriceId],
    ["STRIPE_PRO_PRICE_ID", env?.proPriceId],
    ["STRIPE_GROWTH_PRICE_ID", env?.growthPriceId],
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
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    return null;
  }

  return {
    accountSid,
    authToken,
    phoneNumber,
  };
}

export function hasTwilioEnv() {
  return Boolean(getTwilioEnv());
}
