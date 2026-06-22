#!/usr/bin/env node

import { createDecipheriv, createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const TARGET = {
  campaignId: "957014e8-870f-40e1-9f71-ea7256b09482",
  organizationId: "42e2ccc8-8515-48c3-b105-df531f82031d",
  expectedAdAccountId: "act_344085034950359",
  expectedPageId: "195428953917127",
  expectedPixelId: "1396310424907119",
  expectedDailyBudgetCents: "3000",
  expectedDestinationHost: "app.agentdealflow.io",
  expectedSpecialAdCategory: "HOUSING",
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decryptSecret(payload, secret) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return asArray(value).map(String).map((item) => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function selectedStaticIdsFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const payload = asRecord(record.campaign_payload);
  const nestedPayload = asRecord(nestedPlan.campaign_payload);

  return unique([
    ...stringArray(record.selected_ad_ids),
    ...stringArray(payload.selected_ad_ids),
    ...stringArray(nestedPlan.selected_ad_ids),
    ...stringArray(nestedPayload.selected_ad_ids),
  ]);
}

function launchRuntimeFromPlan(plan) {
  const record = asRecord(plan);
  const nestedPlan = asRecord(record.plan);
  const rootRuntime = asRecord(record.launch_runtime);
  return Object.keys(rootRuntime).length > 0 ? rootRuntime : asRecord(nestedPlan.launch_runtime);
}

function getDestinationUrlsFromCreative(creative) {
  const spec = asRecord(creative.object_story_spec);
  const linkData = asRecord(spec.link_data);
  const videoData = asRecord(spec.video_data);
  const linkCta = asRecord(linkData.call_to_action);
  const videoCta = asRecord(videoData.call_to_action);
  const linkCtaValue = asRecord(linkCta.value);
  const videoCtaValue = asRecord(videoCta.value);

  return unique([
    typeof linkData.link === "string" ? linkData.link : null,
    typeof linkCtaValue.link === "string" ? linkCtaValue.link : null,
    typeof videoCtaValue.link === "string" ? videoCtaValue.link : null,
  ]);
}

function getPageIdFromCreative(creative) {
  const spec = asRecord(creative.object_story_spec);
  return typeof spec.page_id === "string" ? spec.page_id : null;
}

function pass(checks, name, detail = null) {
  checks.push({ status: "PASS", name, detail });
}

function fail(checks, name, detail = null) {
  checks.push({ status: "FAIL", name, detail });
}

function printChecks(checks) {
  for (const check of checks) {
    console.log(`${check.status.padEnd(4)} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
}

async function querySingle(supabase, label, query) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function graphGet(accessToken, path, fields) {
  const url = new URL(`https://graph.facebook.com/v19.0/${path.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method: "GET" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = body?.error?.code ? ` code=${body.error.code}` : "";
    const type = body?.error?.type ? ` type=${body.error.type}` : "";
    const message = body?.error?.message ?? "Meta request failed";
    throw new Error(`${path}: ${response.status}${code}${type} ${message}`);
  }

  return body;
}

async function main() {
  const supabase = createSupabase();
  const checks = [];

  const campaign = await querySingle(
    supabase,
    "campaign_plans",
    supabase
      .from("campaign_plans")
      .select("id,organization_id,public_slug,plan")
      .eq("id", TARGET.campaignId)
      .maybeSingle(),
  );

  if (!campaign) {
    fail(checks, "Martine campaign exists", TARGET.campaignId);
    printChecks(checks);
    process.exitCode = 1;
    return;
  }

  const runtime = launchRuntimeFromPlan(campaign.plan);
  const runtimeAdIds = stringArray(runtime.ad_ids);
  const runtimeCreativeIds = stringArray(runtime.creative_ids);
  const selectedIds = selectedStaticIdsFromPlan(campaign.plan);

  const marketingAccount = await querySingle(
    supabase,
    "marketing_accounts",
    supabase
      .from("marketing_accounts")
      .select("id,organization_id,status,external_account_id,account_name,access_token_encrypted,connection_metadata,pixel_id")
      .eq("organization_id", TARGET.organizationId)
      .eq("platform", "meta_ads")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (!marketingAccount?.access_token_encrypted) {
    fail(checks, "Martine Meta access token is configured");
    printChecks(checks);
    process.exitCode = 1;
    return;
  }

  const metadata = asRecord(marketingAccount.connection_metadata);
  const selectedAccountId =
    typeof metadata.selected_external_account_id === "string"
      ? metadata.selected_external_account_id
      : marketingAccount.external_account_id;
  const selectedPageId = typeof metadata.selected_page_id === "string" ? metadata.selected_page_id : null;
  const selectedPixelId =
    typeof metadata.selected_pixel_id === "string" ? metadata.selected_pixel_id : marketingAccount.pixel_id;

  selectedAccountId === TARGET.expectedAdAccountId
    ? pass(checks, "Saved Meta ad account matches Martine", selectedAccountId)
    : fail(checks, "Saved Meta ad account matches Martine", String(selectedAccountId));
  selectedPageId === TARGET.expectedPageId
    ? pass(checks, "Saved Meta page matches Martine", selectedPageId)
    : fail(checks, "Saved Meta page matches Martine", String(selectedPageId));
  selectedPixelId === TARGET.expectedPixelId
    ? pass(checks, "Saved Meta pixel matches Martine", selectedPixelId)
    : fail(checks, "Saved Meta pixel matches Martine", String(selectedPixelId));

  const accessToken = decryptSecret(marketingAccount.access_token_encrypted, requireEnv("META_TOKEN_ENCRYPTION_KEY"));

  const [metaCampaign, metaAdSet, ...metaAds] = await Promise.all([
    graphGet(accessToken, String(runtime.campaign_id), "id,name,status,effective_status,configured_status,objective,buying_type,special_ad_categories"),
    graphGet(accessToken, String(runtime.adset_id), "id,name,status,effective_status,configured_status,daily_budget,campaign_id,destination_type,promoted_object,targeting"),
    ...runtimeAdIds.map((adId) =>
      graphGet(accessToken, adId, "id,name,status,effective_status,configured_status,campaign_id,adset_id,creative{id},tracking_specs"),
    ),
  ]);

  const metaCreatives = await Promise.all(
    runtimeCreativeIds.map((creativeId) => graphGet(accessToken, creativeId, "id,name,object_story_spec")),
  );

  metaCampaign.id === String(runtime.campaign_id)
    ? pass(checks, "Meta campaign exists", metaCampaign.id)
    : fail(checks, "Meta campaign exists", String(metaCampaign.id));
  metaAdSet.id === String(runtime.adset_id)
    ? pass(checks, "Meta ad set exists", metaAdSet.id)
    : fail(checks, "Meta ad set exists", String(metaAdSet.id));
  String(metaAdSet.campaign_id) === String(runtime.campaign_id)
    ? pass(checks, "Meta ad set belongs to campaign", String(metaAdSet.campaign_id))
    : fail(checks, "Meta ad set belongs to campaign", String(metaAdSet.campaign_id));

  const specialCategories = stringArray(metaCampaign.special_ad_categories);
  specialCategories.includes(TARGET.expectedSpecialAdCategory)
    ? pass(checks, "Meta campaign has housing special ad category", specialCategories.join(", "))
    : fail(checks, "Meta campaign has housing special ad category", specialCategories.join(", "));

  String(metaAdSet.daily_budget) === TARGET.expectedDailyBudgetCents
    ? pass(checks, "Meta ad set budget matches $30/day", String(metaAdSet.daily_budget))
    : fail(checks, "Meta ad set budget matches $30/day", String(metaAdSet.daily_budget));

  const promotedObject = asRecord(metaAdSet.promoted_object);
  String(promotedObject.pixel_id ?? "") === TARGET.expectedPixelId
    ? pass(checks, "Meta ad set promoted object uses Martine pixel", String(promotedObject.pixel_id))
    : fail(checks, "Meta ad set promoted object uses Martine pixel", String(promotedObject.pixel_id));

  const returnedAdIds = metaAds.map((ad) => String(ad.id));
  const missingAds = runtimeAdIds.filter((adId) => !returnedAdIds.includes(adId));
  missingAds.length === 0 && returnedAdIds.length === 3
    ? pass(checks, "Meta returns exactly three DealFlow runtime ads", returnedAdIds.join(", "))
    : fail(checks, "Meta returns exactly three DealFlow runtime ads", `returned=${returnedAdIds.length} missing=${missingAds.join(",")}`);

  const returnedCreativeIds = metaAds.map((ad) => String(asRecord(ad.creative).id ?? ""));
  const missingCreativeIds = runtimeCreativeIds.filter((creativeId) => !returnedCreativeIds.includes(creativeId));
  missingCreativeIds.length === 0 && returnedCreativeIds.length === 3
    ? pass(checks, "Meta ads use exactly three DealFlow runtime creatives", returnedCreativeIds.join(", "))
    : fail(checks, "Meta ads use exactly three DealFlow runtime creatives", `returned=${returnedCreativeIds.length} missing=${missingCreativeIds.join(",")}`);

  for (const ad of metaAds) {
    String(ad.campaign_id) === String(runtime.campaign_id)
      ? pass(checks, `Meta ad belongs to campaign: ${ad.id}`)
      : fail(checks, `Meta ad belongs to campaign: ${ad.id}`, String(ad.campaign_id));
    String(ad.adset_id) === String(runtime.adset_id)
      ? pass(checks, `Meta ad belongs to ad set: ${ad.id}`)
      : fail(checks, `Meta ad belongs to ad set: ${ad.id}`, String(ad.adset_id));
  }

  const creativePageIds = unique(metaCreatives.map(getPageIdFromCreative));
  creativePageIds.length === 1 && creativePageIds[0] === TARGET.expectedPageId
    ? pass(checks, "Meta creatives use Martine page", creativePageIds[0])
    : fail(checks, "Meta creatives use Martine page", creativePageIds.join(", "));

  const destinationUrls = unique(metaCreatives.flatMap(getDestinationUrlsFromCreative));
  const destinationHosts = unique(
    destinationUrls.map((value) => {
      try {
        return new URL(value).host;
      } catch {
        return "";
      }
    }),
  );
  destinationHosts.includes(TARGET.expectedDestinationHost)
    ? pass(checks, "Meta creative destination points at DealFlow app", destinationUrls.join(", "))
    : fail(checks, "Meta creative destination points at DealFlow app", destinationUrls.join(", "));

  const summary = {
    campaignId: TARGET.campaignId,
    selectedIds,
    runtime: {
      campaignId: runtime.campaign_id ?? null,
      adSetId: runtime.adset_id ?? null,
      creativeIds: runtimeCreativeIds,
      adIds: runtimeAdIds,
    },
    meta: {
      campaign: {
        id: metaCampaign.id,
        status: metaCampaign.status,
        effectiveStatus: metaCampaign.effective_status,
        configuredStatus: metaCampaign.configured_status,
        specialAdCategories: specialCategories,
      },
      adSet: {
        id: metaAdSet.id,
        status: metaAdSet.status,
        effectiveStatus: metaAdSet.effective_status,
        configuredStatus: metaAdSet.configured_status,
        dailyBudget: metaAdSet.daily_budget,
        pixelId: promotedObject.pixel_id ?? null,
      },
      ads: metaAds.map((ad) => ({
        id: ad.id,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        configuredStatus: ad.configured_status,
        creativeId: asRecord(ad.creative).id ?? null,
      })),
      destinationUrls,
    },
    checks: checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] ?? 0) + 1;
      return acc;
    }, {}),
  };

  printChecks(checks);
  console.log(JSON.stringify(summary, null, 2));

  if (checks.some((check) => check.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
