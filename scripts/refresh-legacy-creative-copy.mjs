#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

nextEnv.loadEnvConfig(process.cwd());

export const CONFIRMATION = "REFRESH_LEGACY_CREATIVE_COPY";
export const CANONICAL_FUNNEL_VERSION = "real_estate_lead_quiz_v1";

const LEGACY_HEADLINE = "View homes that actually match your criteria";
const LEGACY_CTA = "Get List";
const LEGACY_BODY_MARKERS = [
  "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas.",
  "Get List",
];

const LEGACY_EXACT_STRINGS = [
  LEGACY_HEADLINE,
  LEGACY_CTA,
  "Quick capture",
  "100% free",
  "Local real estate advisor",
  "matched to your criteria",
];

const COPY_STANDARDS = {
  buyer: {
    headline: "Get Your Free Custom Home List",
    cta: "Get My List",
    body: "Get a personalized list of homes matched to your budget, location, and timeline.",
  },
  seller: {
    headline: "Find Out What Your Home Could Sell For",
    cta: "Get My Home Value",
    body: "Get a personalized home value review based on your property, timeline, and local market.",
  },
  downsizing: {
    headline: "Thinking About Downsizing?",
    cta: "Get My Downsizing Plan",
    body: "Get a clear plan for selling your current home and finding the right next place.",
  },
  upsizing: {
    headline: "Ready to Upsize?",
    cta: "Get My Custom List",
    body: "Find homes that fit your next chapter, budget, and timeline.",
  },
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    campaignId: null,
    proofRunId: null,
    confirm: null,
    includeFunnelFields: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--include-funnel-fields") args.includeFunnelFields = true;
    else if (arg.startsWith("--campaign-id=")) args.campaignId = arg.slice("--campaign-id=".length).trim() || null;
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length).trim() || null;
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length).trim() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const modes = [args.dryRun, args.apply].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error("Choose exactly one mode: --dry-run or --apply.");
  }

  if (!args.proofRunId) {
    throw new Error("Missing required --proof-run-id=<id>.");
  }

  if (args.apply && args.confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}.`);
  }

  return args;
}

function requireServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textIncludes(value, needle) {
  return safeText(value).toLowerCase().includes(needle.toLowerCase());
}

function hasLegacyBody(value) {
  const text = safeText(value);
  return LEGACY_BODY_MARKERS.some((legacy) => textIncludes(text, legacy));
}

function hasLegacyHeadline(value) {
  return textIncludes(value, LEGACY_HEADLINE);
}

function isLegacyCta(value) {
  return safeText(value).toLowerCase() === LEGACY_CTA.toLowerCase();
}

function hasLegacySupportCopy(value) {
  const text = safeText(value);
  return textIncludes(text, LEGACY_HEADLINE) || hasLegacyBody(text);
}

function collectSelectedCreativeIds(plan) {
  const ids = new Set();
  const sources = [
    plan?.selected_ad_id,
    plan?.selected_ad_ids,
    plan?.campaign_payload?.selected_ad_id,
    plan?.campaign_payload?.selected_ad_ids,
    plan?.plan?.selected_ad_id,
    plan?.plan?.selected_ad_ids,
    plan?.plan?.campaign_payload?.selected_ad_id,
    plan?.plan?.campaign_payload?.selected_ad_ids,
  ];

  for (const source of sources) {
    if (typeof source === "string" && source.trim()) {
      ids.add(source.trim());
    } else if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === "string" && item.trim()) {
          ids.add(item.trim());
        }
      }
    }
  }

  return [...ids].sort();
}

function inferCampaignIntent(plan) {
  const haystack = JSON.stringify({
    intent: plan?.intent,
    market_type: plan?.market_type,
    planIntent: plan?.plan?.intent,
    planMarketType: plan?.plan?.market_type,
    strategy: plan?.strategy,
    primaryGoal: plan?.primary_goal ?? plan?.plan?.primary_goal,
    offer: plan?.offer ?? plan?.plan?.offer,
    audience: plan?.audience ?? plan?.plan?.audience,
    funnel: plan?.funnel,
  }).toLowerCase();

  if (/downsizing|downsize|right next place/.test(haystack)) return "downsizing";
  if (/upsizing|upsize|next chapter|move-up|move up/.test(haystack)) return "upsizing";
  if (/seller|home value|valuation|sell|selling|homeowners|property value/.test(haystack)) return "seller";

  return "buyer";
}

function replacementForPlan(plan) {
  return COPY_STANDARDS[inferCampaignIntent(plan)] ?? COPY_STANDARDS.buyer;
}

function refreshCampaignAd(ad, path, replacement) {
  if (!isPlainObject(ad)) {
    return { value: ad, changes: [] };
  }

  const next = { ...ad };
  const changes = [];

  const fieldRules = [
    { field: "headline", shouldReplace: hasLegacyHeadline, nextValue: replacement.headline },
    { field: "cta", shouldReplace: isLegacyCta, nextValue: replacement.cta },
    { field: "body", shouldReplace: hasLegacyBody, nextValue: replacement.body },
    { field: "primaryText", shouldReplace: hasLegacyBody, nextValue: replacement.body },
    { field: "description", shouldReplace: hasLegacyBody, nextValue: replacement.body },
  ];

  for (const rule of fieldRules) {
    const previous = next[rule.field];
    if (typeof previous === "string" && rule.shouldReplace(previous)) {
      next[rule.field] = rule.nextValue;
      changes.push({
        path: `${path}.${rule.field}`,
        oldValue: previous,
        newValue: rule.nextValue,
      });
    }
  }

  return { value: changes.length ? next : ad, changes };
}

function refreshFunnelFields(funnel, path, replacement) {
  if (!isPlainObject(funnel)) {
    return { value: funnel, changes: [], changed: false };
  }

  const next = { ...funnel };
  const changes = [];

  const stringRules = [
    { field: "headline", shouldReplace: hasLegacyHeadline, nextValue: replacement.headline },
    { field: "title", shouldReplace: hasLegacyHeadline, nextValue: replacement.headline },
    { field: "cta", shouldReplace: isLegacyCta, nextValue: replacement.cta },
    { field: "primaryCTA", shouldReplace: isLegacyCta, nextValue: replacement.cta },
    { field: "buttonLabel", shouldReplace: isLegacyCta, nextValue: replacement.cta },
    { field: "submitLabel", shouldReplace: isLegacyCta, nextValue: replacement.cta },
    { field: "subheadline", shouldReplace: hasLegacySupportCopy, nextValue: replacement.body },
    { field: "body", shouldReplace: hasLegacySupportCopy, nextValue: replacement.body },
    { field: "support", shouldReplace: hasLegacySupportCopy, nextValue: replacement.body },
    { field: "description", shouldReplace: hasLegacySupportCopy, nextValue: replacement.body },
  ];

  for (const rule of stringRules) {
    const previous = next[rule.field];
    if (typeof previous === "string" && rule.shouldReplace(previous)) {
      next[rule.field] = rule.nextValue;
      changes.push({
        path: `${path}.${rule.field}`,
        oldValue: previous,
        newValue: rule.nextValue,
      });
    }
  }

  if (Array.isArray(next.headlines)) {
    const nextHeadlines = next.headlines.map((headline, index) => {
      if (typeof headline === "string" && hasLegacyHeadline(headline)) {
        changes.push({
          path: `${path}.headlines[${index}]`,
          oldValue: headline,
          newValue: replacement.headline,
        });
        return replacement.headline;
      }
      return headline;
    });
    if (changes.some((change) => change.path.startsWith(`${path}.headlines[`))) {
      next.headlines = nextHeadlines;
    }
  }

  return { value: changes.length ? next : funnel, changes, changed: changes.length > 0 };
}

function refreshFunnelPaths(value, path, replacement) {
  if (Array.isArray(value)) {
    let changed = false;
    const changes = [];
    const nextArray = value.map((item, index) => {
      const result = refreshFunnelPaths(item, `${path}[${index}]`, replacement);
      if (result.changed) changed = true;
      changes.push(...result.changes);
      return result.value;
    });

    return { value: changed ? nextArray : value, changes, changed };
  }

  if (!isPlainObject(value)) {
    return { value, changes: [], changed: false };
  }

  let changed = false;
  const changes = [];
  const nextObject = { ...value };

  for (const [key, child] of Object.entries(value)) {
    if (key === "legacyCreativeRefresh" || key === "legacyFunnelFieldRefresh") {
      continue;
    }

    if (key === "funnel") {
      const result = refreshFunnelFields(child, `${path}.${key}`, replacement);
      changes.push(...result.changes);
      if (result.changed) {
        nextObject[key] = result.value;
        changed = true;
      }
      continue;
    }

    if (key === "ads") {
      continue;
    }

    const result = refreshFunnelPaths(child, `${path}.${key}`, replacement);
    changes.push(...result.changes);
    if (result.changed) {
      nextObject[key] = result.value;
      changed = true;
    }
  }

  return { value: changed ? nextObject : value, changes, changed };
}

function refreshAdsArrays(value, path, replacement) {
  if (Array.isArray(value)) {
    let changed = false;
    const changes = [];
    const nextArray = value.map((item, index) => {
      const result = refreshAdsArrays(item, `${path}[${index}]`, replacement);
      if (result.changed) changed = true;
      changes.push(...result.changes);
      return result.value;
    });

    return { value: changed ? nextArray : value, changes, changed };
  }

  if (!isPlainObject(value)) {
    return { value, changes: [], changed: false };
  }

  let changed = false;
  const changes = [];
  const nextObject = { ...value };

  for (const [key, child] of Object.entries(value)) {
    if (key === "legacyCreativeRefresh") {
      continue;
    }

    if (key === "ads" && Array.isArray(child)) {
      const nextAds = child.map((ad, index) => {
        const result = refreshCampaignAd(ad, `${path}.${key}[${index}]`, replacement);
        changes.push(...result.changes);
        if (result.changes.length) changed = true;
        return result.value;
      });
      if (changed) nextObject[key] = nextAds;
      continue;
    }

    const result = refreshAdsArrays(child, `${path}.${key}`, replacement);
    if (result.changed) {
      nextObject[key] = result.value;
      changed = true;
    }
    changes.push(...result.changes);
  }

  return { value: changed ? nextObject : value, changes, changed };
}

function buildAuditEntry({ proofRunId, refreshedAt, changes, previousAudit }) {
  const previousValues = changes.map((change) => ({
    path: change.path,
    old_value: change.oldValue,
    new_value: change.newValue,
  }));
  const history = [];

  if (isPlainObject(previousAudit)) {
    history.push({
      ...previousAudit,
      history: undefined,
    });
    if (Array.isArray(previousAudit.history)) {
      history.push(...previousAudit.history);
    }
  }

  return {
    refreshed_from_legacy_copy: true,
    refresh_reason: "historical_creative_copy_refresh",
    proof_run_id: proofRunId,
    refreshed_at: refreshedAt,
    canonical_funnel_version: CANONICAL_FUNNEL_VERSION,
    affected_fields: changes.map((change) => change.path),
    previous_values: previousValues,
    ...(history.length ? { history } : {}),
  };
}

function withAuditTrail(value, changes, params) {
  if (!isPlainObject(value) || changes.length === 0) {
    return value;
  }

  return {
    ...value,
    legacyCreativeRefresh: buildAuditEntry({
      ...params,
      previousAudit: value.legacyCreativeRefresh,
      changes,
    }),
  };
}

function buildFunnelFieldAuditEntry({ proofRunId, refreshedAt, changes, previousAudit }) {
  const previousValues = changes.map((change) => ({
    path: change.path,
    old_value: change.oldValue,
    new_value: change.newValue,
  }));
  const history = [];

  if (isPlainObject(previousAudit)) {
    history.push({
      ...previousAudit,
      history: undefined,
    });
    if (Array.isArray(previousAudit.history)) {
      history.push(...previousAudit.history);
    }
  }

  return {
    refreshed_from_legacy_funnel_fields: true,
    refresh_reason: "historical_funnel_field_refresh",
    proof_run_id: proofRunId,
    refreshed_at: refreshedAt,
    canonical_funnel_version: CANONICAL_FUNNEL_VERSION,
    affected_fields: changes.map((change) => change.path),
    previous_values: previousValues,
    ...(history.length ? { history } : {}),
  };
}

function withFunnelFieldAuditTrail(value, changes, params) {
  if (!isPlainObject(value) || changes.length === 0) {
    return value;
  }

  return {
    ...value,
    legacyFunnelFieldRefresh: buildFunnelFieldAuditEntry({
      ...params,
      previousAudit: value.legacyFunnelFieldRefresh,
      changes,
    }),
  };
}

export function buildLegacyCreativeCopyRefresh(row, options) {
  const refreshedAt = options.refreshedAt ?? new Date().toISOString();
  const originalPlan = isPlainObject(row.plan) ? row.plan : {};
  const replacement = replacementForPlan(originalPlan);
  const selectedBefore = collectSelectedCreativeIds(originalPlan);
  const planResult = refreshAdsArrays(originalPlan, "plan", replacement);
  const auditedPlan = withAuditTrail(planResult.value, planResult.changes, {
    proofRunId: options.proofRunId,
    refreshedAt,
  });
  const funnelPlanResult = options.includeFunnelFields
    ? refreshFunnelPaths(auditedPlan, "plan", replacement)
    : { value: auditedPlan, changes: [], changed: false };
  const nextPlan = withFunnelFieldAuditTrail(funnelPlanResult.value, funnelPlanResult.changes, {
    proofRunId: options.proofRunId,
    refreshedAt,
  });
  const selectedAfter = collectSelectedCreativeIds(nextPlan);

  const snapshotResults = {};
  for (const field of ["staged_snapshot", "published_snapshot"]) {
    const snapshot = row[field];
    const adResult = refreshAdsArrays(snapshot, field, replacement);
    const auditedSnapshot = withAuditTrail(adResult.value, adResult.changes, {
      proofRunId: options.proofRunId,
      refreshedAt,
    });
    const funnelResult = options.includeFunnelFields
      ? refreshFunnelPaths(auditedSnapshot, field, replacement)
      : { value: auditedSnapshot, changes: [], changed: false };
    snapshotResults[field] = {
      value: withFunnelFieldAuditTrail(funnelResult.value, funnelResult.changes, {
        proofRunId: options.proofRunId,
        refreshedAt,
      }),
      changes: [...adResult.changes, ...funnelResult.changes],
      adChanges: adResult.changes,
      funnelFieldChanges: funnelResult.changes,
      changed: adResult.changed || funnelResult.changed,
    };
  }

  const changes = [
    ...planResult.changes,
    ...funnelPlanResult.changes,
    ...snapshotResults.staged_snapshot.changes,
    ...snapshotResults.published_snapshot.changes,
  ];
  const funnelFieldChanges = [
    ...funnelPlanResult.changes,
    ...snapshotResults.staged_snapshot.funnelFieldChanges,
    ...snapshotResults.published_snapshot.funnelFieldChanges,
  ];

  return {
    campaignId: row.id,
    publishState: row.publish_state ?? null,
    publicSlug: row.public_slug ?? null,
    launchStatus: row.launch_status ?? null,
    intent: inferCampaignIntent(originalPlan),
    replacement,
    changed: changes.length > 0,
    changes,
    adChanges: [
      ...planResult.changes,
      ...snapshotResults.staged_snapshot.adChanges,
      ...snapshotResults.published_snapshot.adChanges,
    ],
    funnelFieldChanges,
    selectedCreativeIdsUnchanged: JSON.stringify(selectedBefore) === JSON.stringify(selectedAfter),
    selectedCreativeIdsBefore: selectedBefore,
    selectedCreativeIdsAfter: selectedAfter,
    stagedSnapshotWouldChange: snapshotResults.staged_snapshot.changes.length > 0,
    publishedSnapshotWouldChange: snapshotResults.published_snapshot.changes.length > 0,
    nextRow: {
      plan: nextPlan,
      staged_snapshot: snapshotResults.staged_snapshot.value,
      published_snapshot: snapshotResults.published_snapshot.value,
    },
  };
}

async function fetchCampaignRows(supabase, campaignId) {
  let query = supabase
    .from("campaign_plans")
    .select("id,organization_id,partner_id,public_slug,publish_state,launch_status,plan,staged_snapshot,published_snapshot")
    .order("created_at", { ascending: false });

  if (campaignId) {
    query = query.eq("id", campaignId);
  }

  const rows = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`campaign_plans scan failed: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) {
      break;
    }
  }

  return rows;
}

function summarizePlan(result) {
  return {
    campaign_id: result.campaignId,
    public_slug: result.publicSlug,
    publish_state: result.publishState,
    launch_status: result.launchStatus,
    detected_intent: result.intent,
    selected_creative_ids_unchanged: result.selectedCreativeIdsUnchanged,
    selected_creative_ids: result.selectedCreativeIdsBefore,
    staged_snapshot_would_change: result.stagedSnapshotWouldChange,
    published_snapshot_would_change: result.publishedSnapshotWouldChange,
    affected_paths: result.changes.map((change) => change.path),
    affected_ad_paths: result.adChanges.map((change) => change.path),
    affected_funnel_field_paths: result.funnelFieldChanges.map((change) => change.path),
    proposed_updates: result.changes.map((change) => ({
      path: change.path,
      old_value: change.oldValue,
      new_value: change.newValue,
    })),
  };
}

async function applyRefreshes(supabase, results) {
  let mutationCount = 0;

  for (const result of results) {
    const { error } = await supabase
      .from("campaign_plans")
      .update({
        plan: result.nextRow.plan,
        staged_snapshot: result.nextRow.staged_snapshot,
        published_snapshot: result.nextRow.published_snapshot,
      })
      .eq("id", result.campaignId);

    if (error) {
      throw new Error(`campaign_plans update failed for ${result.campaignId}: ${error.message}`);
    }

    mutationCount += 1;
  }

  return mutationCount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = requireServiceRoleClient();
  const rows = await fetchCampaignRows(supabase, args.campaignId);
  const refreshedAt = new Date().toISOString();
  const results = rows
    .map((row) => buildLegacyCreativeCopyRefresh(row, {
      proofRunId: args.proofRunId,
      refreshedAt,
      includeFunnelFields: args.includeFunnelFields,
    }))
    .filter((result) => result.changed);

  const blockedSelectionChanges = results.filter((result) => !result.selectedCreativeIdsUnchanged);
  if (blockedSelectionChanges.length > 0) {
    throw new Error(`Selected creative IDs would change for: ${blockedSelectionChanges.map((result) => result.campaignId).join(", ")}`);
  }

  const mutationCount = args.apply ? await applyRefreshes(supabase, results) : 0;

  const output = {
    mode: args.apply ? "apply" : "dry-run",
    proof_run_id: args.proofRunId,
    include_funnel_fields: args.includeFunnelFields,
    total_scanned_campaigns: rows.length,
    affected_campaigns: results.length,
    mutation_count: mutationCount,
    campaigns: results.map(summarizePlan),
    safety_summary: {
      dry_run_does_not_mutate: args.dryRun,
      apply_requires_confirmation: true,
      table_target: "campaign_plans",
      creative_assets_touched: false,
      selected_creative_ids_changed: false,
      legacy_creative_audit_history_touched: false,
      funnel_fields_included: args.includeFunnelFields,
      provider_calls: false,
      system_jobs_queued: false,
      meta_mutation: false,
      public_funnel_renderer_touched: false,
    },
    apply_command: `npm run refresh:legacy-creative-copy -- --apply${args.includeFunnelFields ? " --include-funnel-fields" : ""} --proof-run-id=${args.proofRunId} --confirm=${CONFIRMATION}`,
  };

  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
