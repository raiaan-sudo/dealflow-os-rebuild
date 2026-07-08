import {
  BANNED_PUBLIC_SECTION_TYPES,
  CANONICAL_PUBLIC_FORM_ID,
  CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
} from "@/lib/public-funnel/constants";
import {
  logBlockedLegacyPublicSections,
  logCanonicalPublicFunnelBuilt,
  logCanonicalPublicFunnelInvalid,
} from "@/lib/public-funnel/public-funnel-events";
import {
  safeParseCanonicalPublicFunnel,
  validateCanonicalPublicFunnel,
} from "@/lib/public-funnel/schema";
import type {
  CanonicalPublicFunnel,
  CanonicalPublicFunnelBuildResult,
  CanonicalPublicFunnelFormField,
} from "@/lib/public-funnel/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRecord(value: unknown, key: string) {
  return asRecord(asRecord(value)?.[key]);
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function getStringFrom(paths: Array<unknown>, fallback = "") {
  for (const value of paths) {
    const text = getString(value);
    if (text) {
      return text;
    }
  }

  return fallback;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function compactText(values: unknown[], fallback: string[]) {
  const items = Array.from(
    new Set(
      values
        .flatMap((value) => getArray(value))
        .map((item) => getString(item))
        .filter(Boolean),
    ),
  );

  return (items.length > 0 ? items : fallback).slice(0, fallback.length);
}

function truncate(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}.` : normalized;
}

const LEGACY_PUBLIC_COPY_PATTERNS = [
  /delivered through a tighter property selection process/i,
  /homeowners ready to list/i,
  /who want a cleaner next step for their houses/i,
  /primary cta:/i,
] as const;

function containsLegacyPublicCopy(text: string) {
  return LEGACY_PUBLIC_COPY_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanPublicCopy(text: string, fallback: string, maxLength: number) {
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

function readSections(record: unknown) {
  const root = asRecord(record);
  const funnel = getRecord(root, "funnel");
  const plan = getRecord(root, "plan");
  const planFunnel = getRecord(plan, "funnel");
  const sections = getArray(funnel?.sections).length > 0
    ? getArray(funnel?.sections)
    : getArray(planFunnel?.sections);

  return sections
    .map((section) => asRecord(section))
    .filter((section): section is Record<string, unknown> => Boolean(section));
}

function collectAllowedSectionContent(record: unknown, allowedTypes: string[]) {
  return readSections(record)
    .filter((section) => allowedTypes.includes(getString(section.type)))
    .flatMap((section) => getArray(section.content))
    .map((item) => getString(item))
    .filter(Boolean);
}

function collectBlockedSectionTypes(record: unknown) {
  const banned = new Set<string>(BANNED_PUBLIC_SECTION_TYPES);

  return readSections(record)
    .map((section) => getString(section.type))
    .filter((type) => banned.has(type));
}

function normalizeFormFields(value: unknown): CanonicalPublicFunnelFormField[] {
  const fields = getArray(value).map((item) => getString(item).toLowerCase());
  const normalized: CanonicalPublicFunnelFormField[] = ["name"];

  if (fields.some((field) => field.includes("email")) || !fields.some((field) => field.includes("phone"))) {
    normalized.push("email");
  }

  if (fields.some((field) => field.includes("phone")) || normalized.length < 3) {
    normalized.push("phone");
  }

  return Array.from(new Set(normalized)).slice(0, 3);
}

function readMetaPixelId(record: unknown) {
  const root = asRecord(record);
  const tracking = getRecord(root, "tracking");
  return getString(tracking?.metaPixelId) || null;
}

function readExistingPublicFunnel(record: unknown) {
  const root = asRecord(record);
  const plan = getRecord(root, "plan");
  const publish = getRecord(root, "publish");

  return root?.publicFunnel ?? plan?.publicFunnel ?? publish?.publicFunnel ?? null;
}

export function buildCanonicalPublicFunnelResult(record: unknown): CanonicalPublicFunnelBuildResult {
  const root = asRecord(record);
  const campaign = getRecord(root, "campaign");
  const strategy = getRecord(root, "strategy");
  const plan = getRecord(root, "plan");
  const funnel = getRecord(root, "funnel");
  const publish = getRecord(root, "publish");

  const campaignId = getStringFrom([campaign?.id, root?.id], "unknown-campaign");
  const organizationId = getStringFrom([campaign?.organization_id, root?.organizationId, root?.organization_id], "");
  const campaignName = getStringFrom([campaign?.name, plan?.business_name, plan?.businessName], "Campaign");
  const businessName = getStringFrom([plan?.business_name, plan?.businessName, campaignName], campaignName);
  const market = getStringFrom([plan?.market, strategy?.location, campaign?.location], "your local market");
  const rawOffer = getStringFrom(
    [plan?.offer_summary, plan?.offerSummary, plan?.offer, plan?.keyOffer, strategy?.offer, funnel?.headline],
    "a clearer next step",
  );
  const offer = cleanPublicCopy(rawOffer, "a clearer next step", 120);
  const slug = getStringFrom([publish?.slug, root?.public_slug, plan?.public_slug], campaignId);
  const cta = getStringFrom([funnel?.cta, plan?.cta], "Get My Options");
  const headline = cleanPublicCopy(
    getStringFrom([funnel?.headline], `${offer} in ${market}`),
    `${offer} in ${market}`,
    180,
  );
  const subheadline = cleanPublicCopy(
    getStringFrom(
      [funnel?.subheadline, plan?.summary, plan?.targeting_summary, plan?.targetingSummary],
      `Get a simple, local plan built around ${market}, your timeline, and the next move that makes sense for you.`,
    ),
    `Get a simple, local plan built around ${market}, your timeline, and the next move that makes sense for you.`,
    420,
  );
  const allowedBenefits = collectAllowedSectionContent(record, ["benefits", "trust_bar", "proof_metrics"]);
  const painPoints = compactText([plan?.pain_points, plan?.painPoints], [
    "Understand your best next step before making a decision.",
    "See the local context that matters for your situation.",
    "Get a direct follow-up without pressure or obligation.",
  ]);
  const valueBullets = (allowedBenefits.length > 0 ? allowedBenefits : painPoints).slice(0, 5);
  const blockedSectionTypes = collectBlockedSectionTypes(record);
  const fields = normalizeFormFields(funnel?.form_fields ?? funnel?.formFields);

  const funnelModel: CanonicalPublicFunnel = {
    presetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    campaignId,
    organizationId: organizationId || null,
    slug,
    campaignName,
    businessName,
    market,
    offer,
    hero: {
      eyebrow: businessName,
      headline,
      subheadline,
      primaryCta: cta,
    },
    trust: {
      items: [
        { label: market },
        { label: "Free review" },
        { label: "No obligation" },
      ],
    },
    offerCard: {
      headline: offer,
      description: `Tell us where to send the details and ${businessName} will follow up with the next step for ${market}.`,
      bullets: painPoints.slice(0, 3),
    },
    valueStack: {
      headline: "What you get",
      metrics: [
        { value: "100%", label: "Free" },
        { value: "1:1", label: "Local follow-up" },
        { value: "Fast", label: "Clear next step" },
      ],
      bullets: valueBullets,
    },
    qualification: {
      headline: "How it works",
      steps: [
        {
          title: "Share your details",
          body: "Send your name, email, and phone so the team can match the request to the right follow-up.",
        },
        {
          title: "Get your options",
          body: `Receive the relevant ${market} context tied to your goal, timeline, and situation.`,
        },
        {
          title: "Decide the next step",
          body: "Move forward only if the recommendation makes sense. There is no obligation to proceed.",
        },
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
      fields,
    },
    tracking: {
      metaPixelId: readMetaPixelId(record),
    },
  };

  const parsed = validateCanonicalPublicFunnel(funnelModel);

  logBlockedLegacyPublicSections({ campaignId, slug, blockedSectionTypes });
  logCanonicalPublicFunnelBuilt({
    campaignId,
    slug,
    presetVersion: parsed.presetVersion,
  });

  return {
    funnel: parsed,
    blockedSectionTypes,
  };
}

export function buildCanonicalPublicFunnel(record: unknown) {
  return buildCanonicalPublicFunnelResult(record).funnel;
}

export function getValidatedPublicFunnel(record: unknown) {
  const existing = readExistingPublicFunnel(record);
  const parsed = safeParseCanonicalPublicFunnel(existing);

  if (parsed.success) {
    return parsed.data;
  }

  if (existing) {
    const root = asRecord(record);
    const campaign = getRecord(root, "campaign");
    const publish = getRecord(root, "publish");
    logCanonicalPublicFunnelInvalid({
      campaignId: getString(campaign?.id) || null,
      slug: getString(publish?.slug) || null,
      reason: parsed.error.issues[0]?.message ?? "invalid canonical public funnel",
    });
  }

  return null;
}

export function attachCanonicalPublicFunnel<T extends Record<string, unknown>>(record: T) {
  const { funnel } = buildCanonicalPublicFunnelResult(record);

  return {
    ...record,
    publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
    publicFunnel: funnel,
  };
}
