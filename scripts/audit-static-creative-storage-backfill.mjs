import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucketMarker = "/storage/v1/object/public/creative-assets/";
const mode = process.env.STATIC_CREATIVE_STORAGE_BACKFILL_MODE === "apply" ? "apply" : "dry_run";
const applyAck = process.env.STATIC_CREATIVE_STORAGE_BACKFILL_ACK?.trim() ?? "";
const requiredApplyAck = "owner-approved-production-backfill";

if (mode === "apply" && applyAck !== requiredApplyAck) {
  console.error(
    `Backfill apply mode requires STATIC_CREATIVE_STORAGE_BACKFILL_ACK=${requiredApplyAck}.`,
  );
  process.exit(1);
}

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabase
  .from("creative_assets")
  .select("id,campaign_id,creative_id,file_url,thumbnail_url,status,metadata,created_at")
  .eq("generation_method", "image_generation")
  .in("asset_type", ["image_frame", "thumbnail"])
  .limit(5000);

if (error) {
  console.error(`Backfill audit failed: ${error.message}`);
  process.exit(1);
}

const rows = Array.isArray(data) ? data : [];
const staticRows = rows.filter((row) => row.metadata?.source === "static_ad");
const alreadyNormalizedRows = staticRows.filter((row) => {
  const fileUrl = typeof row.file_url === "string" ? row.file_url : "";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return metadata.storageNormalized === true || fileUrl.includes(bucketMarker);
});
const providerUrlRows = staticRows.filter((row) => {
  const fileUrl = typeof row.file_url === "string" ? row.file_url : "";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return fileUrl && !fileUrl.includes(bucketMarker) && metadata.storageNormalized !== true;
});
const readyProviderUrlRows = providerUrlRows.filter((row) => row.status === "ready");
const affectedCampaigns = new Set(providerUrlRows.map((row) => row.campaign_id).filter(Boolean));

console.log(JSON.stringify({
  mode,
  checkedRows: rows.length,
  staticGeneratedRows: staticRows.length,
  alreadyNormalizedRowsSkipped: alreadyNormalizedRows.length,
  providerUrlRowsNeedingBackfill: providerUrlRows.length,
  readyProviderUrlRowsNeedingBackfill: readyProviderUrlRows.length,
  affectedCampaignCount: affectedCampaigns.size,
  mutatesData: false,
  applyCommand: "STATIC_CREATIVE_STORAGE_BACKFILL_MODE=apply STATIC_CREATIVE_STORAGE_BACKFILL_ACK=owner-approved-production-backfill node scripts/audit-static-creative-storage-backfill.mjs",
  applyPlan: "Batch provider URL rows by campaign, fetch through the guarded static creative provider image fetcher, upload to creative-assets, update file_url/thumbnail_url to the durable app-owned URL, set metadata.storageNormalized=true, and preserve the previous URL in metadata.provider_original_url.",
  rollbackPlan: "Rollback each batch by restoring file_url/thumbnail_url from metadata.provider_original_url for only the audited row ids in that batch and removing only the new storage paths listed in the batch log.",
  idempotency: "Already-normalized rows and app-owned creative-assets URLs are skipped.",
  recommendation: "Do not run apply mode against production until the owner approves the exact batch scope and rollback log location.",
}, null, 2));
