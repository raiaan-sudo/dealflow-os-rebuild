import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucketMarker = "/storage/v1/object/public/creative-assets/";

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
const providerUrlRows = staticRows.filter((row) => {
  const fileUrl = typeof row.file_url === "string" ? row.file_url : "";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return fileUrl && !fileUrl.includes(bucketMarker) && metadata.storageNormalized !== true;
});
const readyProviderUrlRows = providerUrlRows.filter((row) => row.status === "ready");
const affectedCampaigns = new Set(providerUrlRows.map((row) => row.campaign_id).filter(Boolean));

console.log(JSON.stringify({
  mode: "dry_run",
  checkedRows: rows.length,
  staticGeneratedRows: staticRows.length,
  providerUrlRowsNeedingBackfill: providerUrlRows.length,
  readyProviderUrlRowsNeedingBackfill: readyProviderUrlRows.length,
  affectedCampaignCount: affectedCampaigns.size,
  recommendation: "Backfill by fetching each provider file_url, uploading to creative-assets, updating file_url/thumbnail_url to the durable public URL, and preserving the old URL in metadata.provider_original_url. Run only after owner approval.",
}, null, 2));
