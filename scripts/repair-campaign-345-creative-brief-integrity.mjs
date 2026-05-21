import { createClient } from "@supabase/supabase-js";

const CAMPAIGN_ID = "345dcc04-8e87-4ead-b71a-40236e2ef52e";
const ACK = "repair-campaign-345-creative-brief-integrity";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => stringValue(item)).filter(Boolean)))
    : [];
}

function getSelectedStaticIds(plan) {
  const payload = plainObject(plan.campaign_payload);
  return Array.from(new Set([
    ...stringArray(plan.selected_ad_ids),
    ...stringArray(payload.selected_ad_ids),
    stringValue(plan.selected_ad_id),
    stringValue(payload.selected_ad_id),
  ].filter(Boolean)));
}

function getSelectedUgcIds(plan) {
  const payload = plainObject(plan.campaign_payload);
  return Array.from(new Set([
    ...stringArray(plan.selected_ugc_video_ids),
    ...stringArray(payload.selected_ugc_video_ids),
    stringValue(plan.selected_ugc_video_id),
    stringValue(payload.selected_ugc_video_id),
  ].filter(Boolean)));
}

function setSelections(plan, staticIds, ugcIds) {
  const payload = plainObject(plan.campaign_payload);
  const nextPayload = {
    ...payload,
    selected_ad_ids: staticIds,
    selected_ad_id: staticIds[0] ?? null,
    selected_ugc_video_ids: ugcIds,
    selected_ugc_video_id: ugcIds[0] ?? null,
  };

  return {
    ...plan,
    selected_ad_ids: staticIds,
    selected_ad_id: staticIds[0] ?? null,
    selected_ugc_video_ids: ugcIds,
    selected_ugc_video_id: ugcIds[0] ?? null,
    campaign_payload: nextPayload,
  };
}

function selectedStaticCreatives(plan, selectedIds) {
  const byId = new Map((Array.isArray(plan.staticAds) ? plan.staticAds : [])
    .filter((creative) => creative && typeof creative === "object")
    .map((creative) => [stringValue(creative.id), creative])
    .filter(([id]) => Boolean(id)));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function selectedUgcVideos(plan, selectedIds) {
  const byId = new Map((Array.isArray(plan.videoAds) ? plan.videoAds : [])
    .filter((video) => video && typeof video === "object")
    .map((video) => [stringValue(video.id), video])
    .filter(([id]) => Boolean(id)));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function getBrief(plan) {
  const intake = plainObject(plan.creative_chat_intake);
  return plainObject(intake.brief);
}

function staticMismatch(creative, brief) {
  if (!brief.staticBriefHash) {
    return null;
  }
  if (creative.staticBriefHash !== brief.staticBriefHash) {
    return "static_brief_hash_mismatch";
  }
  if (brief.offerHash && creative.offerHash !== brief.offerHash) {
    return "offer_hash_mismatch";
  }
  if (brief.ctaHash && creative.ctaHash !== brief.ctaHash) {
    return "cta_hash_mismatch";
  }
  if (brief.brandHash && creative.brandHash !== brief.brandHash) {
    return "brand_hash_mismatch";
  }
  return null;
}

function ugcMismatch(video, brief) {
  const currentHash = stringValue(brief.ugcScriptHash);
  if (!currentHash) {
    return null;
  }
  return video.ugcScriptHash === currentHash || video.scriptHash === currentHash
    ? null
    : "ugc_script_hash_mismatch";
}

function summarizeRepair(plan) {
  const brief = getBrief(plan);
  const selectedStaticIds = getSelectedStaticIds(plan);
  const selectedUgcIds = getSelectedUgcIds(plan);
  const staticCreatives = selectedStaticCreatives(plan, selectedStaticIds);
  const ugcVideos = selectedUgcVideos(plan, selectedUgcIds);
  const staleStatic = staticCreatives
    .map((creative) => ({ id: creative.id, reason: staticMismatch(creative, brief) }))
    .filter((item) => item.reason);
  const staleUgc = ugcVideos
    .map((video) => ({ id: video.id, reason: ugcMismatch(video, brief) }))
    .filter((item) => item.reason);
  const keepStaticIds = selectedStaticIds.filter((id) => !staleStatic.some((item) => item.id === id));
  const keepUgcIds = selectedUgcIds.filter((id) => !staleUgc.some((item) => item.id === id));

  return {
    targetCampaignId: CAMPAIGN_ID,
    mutatesMeta: false,
    mutatesProvider: false,
    deletesEvidence: false,
    brief: {
      offerTitle: stringValue(brief.offerTitle),
      market: stringValue(brief.market),
      cta: stringValue(brief.cta),
      brand: stringValue(brief.brokerageBrand),
      staticBriefHashPresent: Boolean(brief.staticBriefHash),
      ugcScriptHashPresent: Boolean(brief.ugcScriptHash),
    },
    before: {
      selectedStaticIds,
      selectedUgcIds,
    },
    staleStatic,
    staleUgc,
    after: {
      selectedStaticIds: keepStaticIds,
      selectedUgcIds: keepUgcIds,
    },
    rollback: {
      scope: `campaign_plans.plan selection fields for ${CAMPAIGN_ID} only`,
      action: "Restore pre-apply selected_ad_ids, selected_ad_id, selected_ugc_video_ids, and selected_ugc_video_id from the dry-run output or Supabase PITR. No media evidence rows are deleted.",
    },
  };
}

const apply = process.argv.includes("--apply");
const ackArg = process.argv.find((arg) => arg.startsWith("--ack="));
const ack = ackArg ? ackArg.slice("--ack=".length) : "";

if (apply && ack !== ACK) {
  throw new Error(`Apply requires --ack=${ACK}`);
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await supabase
  .from("campaign_plans")
  .select("id,plan")
  .eq("id", CAMPAIGN_ID)
  .single();

if (error) {
  throw error;
}

const plan = plainObject(data.plan);
const summary = summarizeRepair(plan);

if (!apply) {
  console.log(JSON.stringify({ mode: "dry_run", ...summary }, null, 2));
  process.exit(0);
}

const nextPlan = setSelections(plan, summary.after.selectedStaticIds, summary.after.selectedUgcIds);
const { error: updateError } = await supabase
  .from("campaign_plans")
  .update({ plan: nextPlan })
  .eq("id", CAMPAIGN_ID);

if (updateError) {
  throw updateError;
}

console.log(JSON.stringify({ mode: "apply", ...summary }, null, 2));
