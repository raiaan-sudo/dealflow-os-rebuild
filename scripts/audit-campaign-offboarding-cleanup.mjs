#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function argValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!match || match === name) return null;
  return match.slice(prefix.length).trim() || null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))] : [];
}

function addMetaObject(objects, seen, type, id, source) {
  const normalized = typeof id === "string" && id.trim() ? id.trim() : null;
  if (!normalized) return;
  const key = `${type}:${normalized}`;
  if (seen.has(key)) return;
  seen.add(key);
  objects.push({ type, idPrefix: normalized.slice(0, 8), source });
}

function collectMetaObjects(plan) {
  const record = asRecord(plan);
  const runtime = asRecord(record.runtime);
  const launchRuntime = asRecord(record.launch_runtime);
  const objects = [];
  const seen = new Set();

  addMetaObject(objects, seen, "campaign", runtime.campaignId, "runtime.campaignId");
  addMetaObject(objects, seen, "campaign", launchRuntime.campaign_id, "launch_runtime.campaign_id");
  addMetaObject(objects, seen, "adset", runtime.adSetId, "runtime.adSetId");
  addMetaObject(objects, seen, "adset", launchRuntime.adset_id, "launch_runtime.adset_id");
  for (const id of stringArray(runtime.metaAdSetIds)) addMetaObject(objects, seen, "adset", id, "runtime.metaAdSetIds");
  addMetaObject(objects, seen, "ad", runtime.adId, "runtime.adId");
  addMetaObject(objects, seen, "ad", launchRuntime.ad_id, "launch_runtime.ad_id");
  for (const id of stringArray(runtime.metaAdIds)) addMetaObject(objects, seen, "ad", id, "runtime.metaAdIds");
  addMetaObject(objects, seen, "creative", launchRuntime.creative_id, "launch_runtime.creative_id");
  for (const id of stringArray(runtime.metaCreativeIds)) addMetaObject(objects, seen, "creative", id, "runtime.metaCreativeIds");

  return objects;
}

function storagePathFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url);
    const bucket = encodeURIComponent("creative-assets");
    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
    const prefix = parsed.pathname.startsWith(publicPrefix)
      ? publicPrefix
      : parsed.pathname.startsWith(signedPrefix)
        ? signedPrefix
        : null;
    return prefix ? decodeURIComponent(parsed.pathname.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

async function main() {
  const campaignId = argValue("--campaign-id");
  const organizationId = argValue("--organization-id");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let query = supabase
    .from("campaign_plans")
    .select("id,organization_id,user_id,plan,launch_status,publish_state")
    .limit(campaignId ? 1 : 100);

  if (campaignId) query = query.eq("id", campaignId);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data: campaigns, error: campaignError } = await query;
  if (campaignError) throw new Error(`campaign_plans: ${campaignError.message}`);

  const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);
  const { data: assets, error: assetError } = campaignIds.length > 0
    ? await supabase
      .from("creative_assets")
      .select("id,campaign_id,file_url,thumbnail_url,metadata,asset_type")
      .in("campaign_id", campaignIds)
    : { data: [], error: null };

  if (assetError) throw new Error(`creative_assets: ${assetError.message}`);

  const assetsByCampaign = new Map();
  for (const asset of assets ?? []) {
    const list = assetsByCampaign.get(asset.campaign_id) ?? [];
    list.push(asset);
    assetsByCampaign.set(asset.campaign_id, list);
  }

  const inventory = (campaigns ?? []).map((campaign) => {
    const metaObjects = collectMetaObjects(campaign.plan);
    const campaignAssets = assetsByCampaign.get(campaign.id) ?? [];
    const storagePaths = new Set();
    for (const asset of campaignAssets) {
      const metadata = asRecord(asset.metadata);
      for (const path of [
        typeof metadata.storagePath === "string" ? metadata.storagePath : null,
        typeof metadata.thumbnailStoragePath === "string" ? metadata.thumbnailStoragePath : null,
        storagePathFromUrl(asset.file_url),
        storagePathFromUrl(asset.thumbnail_url),
      ]) {
        if (path) storagePaths.add(path);
      }
    }

    const blockedReasons = [];
    if (!campaign.organization_id) blockedReasons.push("organization_missing");
    if (!campaign.user_id) blockedReasons.push("user_missing");
    if (metaObjects.length > 0 && !metaObjects.some((object) => object.type === "campaign")) {
      blockedReasons.push("meta_campaign_id_missing");
    }

    return {
      campaignId: campaign.id,
      organizationId: campaign.organization_id,
      launchStatus: campaign.launch_status,
      publishState: campaign.publish_state,
      metaObjectCount: metaObjects.length,
      metaObjectTypes: metaObjects.reduce((acc, object) => {
        acc[object.type] = (acc[object.type] ?? 0) + 1;
        return acc;
      }, {}),
      appOwnedAssetCount: campaignAssets.length,
      appOwnedStoragePathCount: storagePaths.size,
      blockedReasons,
    };
  });

  console.log(JSON.stringify({
    mode: "dry_run",
    campaignCount: inventory.length,
    metaDeletionEnabled: process.env.ENABLE_META_OFFBOARDING_DELETION === "true",
    creativeStorageDeletionEnabled: process.env.ENABLE_CREATIVE_STORAGE_OFFBOARDING_DELETION === "true",
    inventory,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
