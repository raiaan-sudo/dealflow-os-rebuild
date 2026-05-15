import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function envFlag(name) {
  return process.env[name] === "true";
}

function normalizeHostname(value) {
  const trimmed = value?.trim().toLowerCase().replace(/\/+$/, "");

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.split("/")[0] || null;
  }
}

function requireFlag(name) {
  if (!envFlag(name)) {
    throw new Error(`${name}=true is required for tracking readiness sync.`);
  }
}

function readMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const allowSync = envFlag("ALLOW_META_TRACKING_READINESS_SYNC");

if (!allowSync) {
  throw new Error("ALLOW_META_TRACKING_READINESS_SYNC=true is required.");
}

requireFlag("META_TRACKING_DOMAIN_VERIFIED");
requireFlag("META_TRACKING_PAGEVIEW_PROOF");
requireFlag("META_TRACKING_LEAD_PROOF");

const campaignId = requiredEnv("CAMPAIGN_ID");
const expectedLaunchDomain = normalizeHostname(
  process.env.EXPECTED_LAUNCH_DOMAIN ?? "app.agentdealflow.io",
);
const expectedPixelId = process.env.EXPECTED_META_PIXEL_ID?.trim() || null;
const expectedAdAccountId = process.env.EXPECTED_META_AD_ACCOUNT_ID?.replace(/^act_/, "").trim() || null;
const evidenceSource = requiredEnv("META_TRACKING_EVIDENCE_SOURCE");
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: campaign, error: campaignError } = await supabase
  .from("campaign_plans")
  .select("id, organization_id, user_id")
  .eq("id", campaignId)
  .maybeSingle();

if (campaignError) {
  throw campaignError;
}

if (!campaign) {
  throw new Error(`Campaign ${campaignId} was not found.`);
}

const { data: account, error: accountError } = await supabase
  .from("marketing_accounts")
  .select(
    "id, organization_id, external_account_id, account_name, pixel_id, launch_domain, domain_verified, tracking_status, tracking_metadata, connection_metadata",
  )
  .eq("organization_id", campaign.organization_id)
  .eq("platform", "meta_ads")
  .maybeSingle();

if (accountError) {
  throw accountError;
}

if (!account?.id) {
  throw new Error(`Meta marketing account was not found for campaign ${campaignId}.`);
}

const currentLaunchDomain = normalizeHostname(account.launch_domain);

if (expectedLaunchDomain && currentLaunchDomain !== expectedLaunchDomain) {
  throw new Error(
    `Launch domain mismatch. Expected ${expectedLaunchDomain}, found ${currentLaunchDomain ?? "null"}.`,
  );
}

if (expectedPixelId && account.pixel_id !== expectedPixelId) {
  throw new Error(`Pixel mismatch. Expected ${expectedPixelId}, found ${account.pixel_id ?? "null"}.`);
}

const currentAdAccountId = String(account.external_account_id ?? "").replace(/^act_/, "");

if (expectedAdAccountId && currentAdAccountId !== expectedAdAccountId) {
  throw new Error(
    `Ad account mismatch. Expected ${expectedAdAccountId}, found ${currentAdAccountId || "null"}.`,
  );
}

const checkedAt = new Date().toISOString();
const metadata = readMetadata(account.connection_metadata);
const trackingMetadata = {
  ...readMetadata(account.tracking_metadata),
  readiness_source: "sync-meta-tracking-readiness",
  readiness_checked_at: checkedAt,
  evidence_source: evidenceSource,
  evidence: {
    launch_domain: currentLaunchDomain,
    root_domain_verified: true,
    selected_pixel_id: account.pixel_id,
    selected_ad_account_id: currentAdAccountId ? `act_${currentAdAccountId}` : null,
    selected_pixel_accessible_in_events_manager: true,
    page_view_test_event_processed: true,
    lead_test_event_processed: true,
    test_event_only: true,
  },
};

const { data: updated, error: updateError } = await supabase
  .from("marketing_accounts")
  .update({
    domain_verified: true,
    tracking_status: "configured",
    tracking_metadata: trackingMetadata,
    tracking_last_checked_at: checkedAt,
    connection_metadata: {
      ...metadata,
      domain_verified: true,
      tracking_status: "configured",
      tracking_last_checked_at: checkedAt,
      verification_metadata: trackingMetadata,
    },
  })
  .eq("id", account.id)
  .select("id, launch_domain, domain_verified, tracking_status, tracking_last_checked_at, pixel_id, external_account_id")
  .maybeSingle();

if (updateError) {
  throw updateError;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      campaignId,
      marketingAccountId: updated?.id ?? account.id,
      launchDomain: updated?.launch_domain ?? account.launch_domain,
      domainVerified: updated?.domain_verified === true,
      trackingStatus: updated?.tracking_status ?? null,
      checkedAt: updated?.tracking_last_checked_at ?? checkedAt,
      pixelId: updated?.pixel_id ?? account.pixel_id,
      adAccountId: updated?.external_account_id ?? account.external_account_id,
      evidenceRecorded: true,
    },
    null,
    2,
  ),
);
