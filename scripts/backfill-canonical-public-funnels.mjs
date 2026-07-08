#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has("--apply");
const dryRun = args.has("--dry-run") || !apply;
const CURRENT_PUBLIC_FUNNEL_PRESET_VERSION = "dealflow-public-v1";
const CANONICAL_PUBLIC_FORM_ID = "lead-form";
const BANNED_PUBLIC_SECTION_TYPES = new Set([
  "faq",
  "process",
  "market_snapshot",
  "objections",
  "form",
  "closing_cta",
  "vsl",
  "image",
]);

function getArg(name) {
  const equalArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) {
    return equalArg.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const slugArg = getArg("--slug");
const campaignIdArg = getArg("--campaign-id");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (apply && process.env.ALLOW_PUBLIC_FUNNEL_BACKFILL_APPLY !== "true") {
  console.error("Refusing --apply without ALLOW_PUBLIC_FUNNEL_BACKFILL_APPLY=true.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function getString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function truncate(text, maxLength) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}.` : normalized;
}

const LEGACY_PUBLIC_COPY_PATTERNS = [
  /delivered through a tighter property selection process/i,
  /homeowners ready to list/i,
  /who want a cleaner next step for their houses/i,
  /primary cta:/i,
];

function containsLegacyPublicCopy(text) {
  return LEGACY_PUBLIC_COPY_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanPublicCopy(text, fallback, maxLength) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const candidate = normalized
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !containsLegacyPublicCopy(sentence))
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  const cleaned = candidate || fallback;

  return truncate(cleaned, maxLength);
}

function getSections(row) {
  const snapshot = asRecord(row.published_snapshot) ?? asRecord(row.staged_snapshot) ?? asRecord(row.plan) ?? {};
  const snapshotFunnel = asRecord(snapshot.funnel);
  const plan = asRecord(row.plan) ?? {};
  const planFunnel = asRecord(plan.funnel);
  const sections = Array.isArray(snapshotFunnel?.sections)
    ? snapshotFunnel.sections
    : Array.isArray(planFunnel?.sections)
      ? planFunnel.sections
      : [];

  return sections.map(asRecord).filter(Boolean);
}

function getSectionTypes(row) {
  return getSections(row)
    .map((section) => getString(section.type))
    .filter(Boolean);
}

function buildCanonicalPublicFunnel(row) {
  const plan = asRecord(row.plan) ?? {};
  const snapshot = asRecord(row.published_snapshot) ?? asRecord(row.staged_snapshot) ?? {};
  const snapshotPlan = asRecord(snapshot.plan) ?? {};
  const funnel = asRecord(snapshot.funnel) ?? asRecord(plan.funnel) ?? {};
  const businessName =
    getString(snapshotPlan.business_name) ||
    getString(plan.business_name) ||
    getString(snapshot.name) ||
    "Campaign";
  const market =
    getString(snapshotPlan.market) ||
    getString(plan.market) ||
    getString(asRecord(snapshot.strategy)?.location) ||
    "your local market";
  const rawOffer =
    getString(snapshotPlan.offer_summary) ||
    getString(snapshotPlan.offer) ||
    getString(plan.offer_summary) ||
    getString(plan.key_offer) ||
    getString(funnel.headline) ||
    "a clearer next step";
  const offer = cleanPublicCopy(rawOffer, "a clearer next step", 120);
  const cta = getString(funnel.cta, "Get My Options");
  const fields = Array.isArray(funnel.form_fields)
    ? funnel.form_fields.map(String)
    : ["name", "email", "phone"];
  const formFields = Array.from(new Set([
    "name",
    ...(fields.some((field) => field.toLowerCase().includes("email")) ? ["email"] : []),
    ...(fields.some((field) => field.toLowerCase().includes("phone")) ? ["phone"] : []),
  ])).slice(0, 3);

  if (formFields.length < 2) {
    formFields.push("email");
  }

  return {
    presetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    campaignId: row.id,
    organizationId: row.organization_id ?? null,
    slug: row.public_slug,
    campaignName: businessName,
    businessName,
    market,
    offer,
    hero: {
      eyebrow: businessName,
      headline: cleanPublicCopy(getString(funnel.headline, `${offer} in ${market}`), `${offer} in ${market}`, 180),
      subheadline: cleanPublicCopy(
        getString(
          funnel.subheadline,
          `Get a simple, local plan built around ${market}, your timeline, and the next move that makes sense for you.`,
        ),
        `Get a simple, local plan built around ${market}, your timeline, and the next move that makes sense for you.`,
        420,
      ),
      primaryCta: cta,
    },
    trust: {
      items: [{ label: market }, { label: "Free review" }, { label: "No obligation" }],
    },
    offerCard: {
      headline: offer,
      description: `Tell us where to send the details and ${businessName} will follow up with the next step for ${market}.`,
      bullets: [
        "Understand your best next step before making a decision.",
        "See the local context that matters for your situation.",
        "Get a direct follow-up without pressure or obligation.",
      ],
    },
    valueStack: {
      headline: "What you get",
      metrics: [
        { value: "100%", label: "Free" },
        { value: "1:1", label: "Local follow-up" },
        { value: "Fast", label: "Clear next step" },
      ],
      bullets: [
        "Understand your best next step before making a decision.",
        "See the local context that matters for your situation.",
        "Get a direct follow-up without pressure or obligation.",
      ],
    },
    qualification: {
      headline: "How it works",
      steps: [
        { title: "Share your details", body: "Send your name, email, and phone so the team can match the request to the right follow-up." },
        { title: "Get your options", body: `Receive the relevant ${market} context tied to your goal, timeline, and situation.` },
        { title: "Decide the next step", body: "Move forward only if the recommendation makes sense. There is no obligation to proceed." },
      ],
    },
    expectations: {
      headline: "Privacy and expectations",
      bullets: [
        "Your information is used only to respond to this request.",
        "SMS is only sent when you explicitly check the consent box.",
        "You can ask to stop follow-up at any time.",
      ],
    },
    form: {
      id: CANONICAL_PUBLIC_FORM_ID,
      title: "Tell us where to send your options",
      cta,
      fields: formFields,
    },
    tracking: {},
  };
}

function validateCanonicalPublicFunnel(funnel) {
  const required = [
    funnel.presetVersion === CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    Boolean(funnel.campaignId),
    Boolean(funnel.slug),
    Boolean(funnel.hero?.headline),
    Boolean(funnel.hero?.subheadline),
    Boolean(funnel.hero?.primaryCta),
    funnel.form?.id === CANONICAL_PUBLIC_FORM_ID,
    Array.isArray(funnel.form?.fields) && funnel.form.fields.length >= 2,
  ];

  return required.every(Boolean);
}

let query = supabase
  .from("campaign_plans")
  .select("id, organization_id, public_slug, publish_state, plan, staged_snapshot, published_snapshot")
  .eq("publish_state", "published")
  .not("public_slug", "is", null)
  .order("id", { ascending: true })
  .limit(250);

if (slugArg) {
  query = query.eq("public_slug", slugArg);
}

if (campaignIdArg) {
  query = query.eq("id", campaignIdArg);
}

const { data, error } = await query;

if (error) {
  console.error(`Backfill read failed: ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];
const report = rows.map((row) => {
  const publishedSnapshot = row.published_snapshot && typeof row.published_snapshot === "object"
    ? row.published_snapshot
    : null;
  const plan = row.plan && typeof row.plan === "object" ? row.plan : null;
  const currentSectionTypes = getSectionTypes(row);
  const blockedSectionTypes = Array.from(new Set(currentSectionTypes.filter((type) => BANNED_PUBLIC_SECTION_TYPES.has(type)))).sort();
  const canonicalPublicFunnel = buildCanonicalPublicFunnel(row);

  return {
    id: row.id,
    slug: row.public_slug,
    currentSectionTypes,
    blockedSectionTypes,
    hasPlanPublicFunnel: Boolean(plan?.publicFunnel),
    hasPublishedSnapshotPublicFunnel: Boolean(publishedSnapshot?.publicFunnel),
    canonicalModelValidates: validateCanonicalPublicFunnel(canonicalPublicFunnel),
    canonicalPublicFunnel,
  };
});

const needingBackfill = report.filter((item) => !item.hasPlanPublicFunnel || !item.hasPublishedSnapshotPublicFunnel);

console.log(JSON.stringify({
  mode: dryRun ? "dry-run" : "apply",
  inspected: rows.length,
  needingBackfill: needingBackfill.length,
  cacheNote: "Public /f/[slug] has a 60 second Next revalidate window. After apply, wait 60 seconds or redeploy/revalidate the affected slug before screenshot proof.",
  records: needingBackfill.map(({ canonicalPublicFunnel, ...item }) => ({
    ...item,
    diffSummary: {
      writesPlanPublicFunnel: !item.hasPlanPublicFunnel,
      writesPublishedSnapshotPublicFunnel: !item.hasPublishedSnapshotPublicFunnel,
      presetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    },
  })),
}, null, 2));

if (dryRun) {
  process.exit(0);
}

const failures = [];
for (const item of needingBackfill) {
  if (!item.canonicalModelValidates) {
    failures.push({ id: item.id, slug: item.slug, reason: "canonical model validation failed" });
    continue;
  }

  const row = rows.find((candidate) => candidate.id === item.id);
  const nextPlan = {
    ...(asRecord(row?.plan) ?? {}),
    publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    publicFunnel: item.canonicalPublicFunnel,
  };
  const nextPublishedSnapshot = row?.published_snapshot && typeof row.published_snapshot === "object"
    ? {
        ...row.published_snapshot,
        publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
        publicFunnel: item.canonicalPublicFunnel,
      }
    : row?.published_snapshot;
  const nextStagedSnapshot = row?.staged_snapshot && typeof row.staged_snapshot === "object"
    ? {
        ...row.staged_snapshot,
        publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
        publicFunnel: item.canonicalPublicFunnel,
      }
    : row?.staged_snapshot;

  const { error } = await supabase
    .from("campaign_plans")
    .update({
      plan: nextPlan,
      published_snapshot: nextPublishedSnapshot,
      staged_snapshot: nextStagedSnapshot,
    })
    .eq("id", item.id);

  if (error) {
    failures.push({ id: item.id, slug: item.slug, reason: error.message });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  applied: needingBackfill.length,
  presetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
  postBackfillRevalidation: {
    publicFunnelRevalidateSeconds: 60,
    affectedSlugs: needingBackfill.map((item) => item.slug),
    instruction: "Wait at least 60 seconds, then verify each /f/[slug] URL. If an on-demand revalidation endpoint is added later, call it per affected slug.",
  },
}, null, 2));
