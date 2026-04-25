import { createClient } from "@/lib/supabase/server";
import {
  fillPattern,
  getKnowledgeProfile,
  HIGH_PERFORMING_AD_HOOKS,
} from "@/lib/knowledge/real-estate";
import { getAppContext } from "@/lib/services/app-context";
import type { CampaignAd, CampaignPlan, OnboardingInput } from "@/lib/services/campaign-plan-service";
import type { Database } from "@/lib/supabase/types";

type CreativeIntelligenceRow = Database["public"]["Tables"]["creative_intelligence"]["Row"];
type TargetingIntelligenceRow =
  Database["public"]["Tables"]["targeting_intelligence_patterns"]["Row"];

export type CreativeAngle =
  | "approval"
  | "urgency"
  | "pain"
  | "exclusivity"
  | "speed"
  | "authority";

export type CreativePerformanceTag = "high" | "medium" | "test";
export type CreativeResultTag = "winner" | "average" | "loser";

export type CreativeIntelligenceRecord = {
  id: string;
  organizationId: string | null;
  hook: string;
  angle: CreativeAngle;
  audience: string;
  offer: string | null;
  industry: string;
  format: string;
  notes: string | null;
  performanceTag: CreativePerformanceTag;
  resultTag: CreativeResultTag | null;
  source: string;
};

export type CreativeIntelligenceProfile = {
  patterns: CreativeIntelligenceRecord[];
  commonAngles: CreativeAngle[];
  mostUsedHooks: string[];
  groupedByAngle: Partial<Record<CreativeAngle, CreativeIntelligenceRecord[]>>;
  topAudiences: string[];
  topLocations: string[];
  topTargetingPatterns: string[];
};

const DEFAULT_ANGLE_ORDER: CreativeAngle[] = [
  "approval",
  "urgency",
  "pain",
  "exclusivity",
  "speed",
];

function normalizeAngle(value: unknown): CreativeAngle {
  if (
    value === "approval" ||
    value === "urgency" ||
    value === "pain" ||
    value === "exclusivity" ||
    value === "speed" ||
    value === "authority"
  ) {
    return value;
  }

  return "pain";
}

function normalizePerformanceTag(value: unknown): CreativePerformanceTag {
  return value === "high" || value === "medium" ? value : "test";
}

function normalizeResultTag(value: unknown): CreativeResultTag | null {
  return value === "winner" || value === "average" || value === "loser" ? value : null;
}

function mapRow(row: CreativeIntelligenceRow): CreativeIntelligenceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    hook: row.hook,
    angle: normalizeAngle(row.angle),
    audience: row.audience,
    offer: row.offer,
    industry: row.industry,
    format: row.format,
    notes: row.notes,
    performanceTag: normalizePerformanceTag(row.performance_tag),
    resultTag: normalizeResultTag(row.result_tag),
    source: row.source,
  };
}

function buildSeedRecords(
  input: Pick<OnboardingInput, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">,
): CreativeIntelligenceRecord[] {
  const profile = getKnowledgeProfile(input);
  const seedHooks: CreativeIntelligenceRecord[] = HIGH_PERFORMING_AD_HOOKS.map((hook) => ({
    id: hook.id,
    organizationId: null,
    hook: fillPattern(hook.pattern, profile.context),
    angle: normalizeAngle(hook.adAngle),
    audience: input.audience,
    offer: input.keyOffer,
    industry: "real_estate",
    format: "image_overlay",
    notes: `${hook.label} pattern from structured seed data.`,
    performanceTag: "high" as const,
    resultTag: "winner" as const,
    source: "knowledge_seed",
  }));

  seedHooks.push(
    {
      id: "seed-urgency",
      organizationId: null,
      hook: `Stop missing the best ${input.market} ${input.propertyType}. ${input.keyOffer}.`,
      angle: "urgency",
      audience: input.audience,
      offer: input.keyOffer,
      industry: "real_estate",
      format: "image_overlay",
      notes: "Urgency-first creative for fast-moving inventory.",
      performanceTag: "high",
      resultTag: "winner",
      source: "knowledge_seed",
    },
    {
      id: "seed-exclusivity",
      organizationId: null,
      hook: `${input.audience} can get tighter ${input.propertyType} options in ${input.market} with ${input.keyOffer}.`,
      angle: "exclusivity",
      audience: input.audience,
      offer: input.keyOffer,
      industry: "real_estate",
      format: "image_overlay",
      notes: "Exclusivity-led creative for differentiated access.",
      performanceTag: "medium",
      resultTag: "average",
      source: "knowledge_seed",
    },
  );

  return seedHooks;
}

function getPerformanceScore(tag: CreativePerformanceTag) {
  if (tag === "high") {
    return 3;
  }

  if (tag === "medium") {
    return 2;
  }

  return 1;
}

function scorePattern(
  record: CreativeIntelligenceRecord,
  input: Pick<OnboardingInput, "audience" | "propertyType" | "keyOffer" | "market">,
) {
  let score = getPerformanceScore(record.performanceTag);
  const audience = input.audience.toLowerCase();
  const offer = input.keyOffer.toLowerCase();
  const propertyType = input.propertyType.toLowerCase();
  const hook = record.hook.toLowerCase();
  const recordAudience = record.audience.toLowerCase();
  const notes = (record.notes ?? "").toLowerCase();

  if (recordAudience.includes(audience) || audience.includes(recordAudience)) {
    score += 4;
  }

  if (record.offer && (offer.includes(record.offer.toLowerCase()) || record.offer.toLowerCase().includes(offer))) {
    score += 4;
  }

  if (hook.includes(propertyType)) {
    score += 2;
  }

  if (hook.includes(input.market.toLowerCase())) {
    score += 1;
  }

  if (notes.includes(input.market.toLowerCase())) {
    score += 2;
  }

  if (record.resultTag === "winner") {
    score += 3;
  }

  if (record.resultTag === "loser") {
    score -= 2;
  }

  return score;
}

function analyzePatterns(records: CreativeIntelligenceRecord[]): CreativeIntelligenceProfile {
  const groupedByAngle = records.reduce<Partial<Record<CreativeAngle, CreativeIntelligenceRecord[]>>>(
    (accumulator, record) => {
      accumulator[record.angle] = [...(accumulator[record.angle] ?? []), record];
      return accumulator;
    },
    {},
  );

  const commonAngles = Object.entries(groupedByAngle)
    .sort((left, right) => right[1]!.length - left[1]!.length)
    .map(([angle]) => normalizeAngle(angle));

  const mostUsedHooks = [...new Set(records.map((record) => record.hook))].slice(0, 6);

  return {
    patterns: records,
    commonAngles,
    mostUsedHooks,
    groupedByAngle,
    topAudiences: [...new Set(records.map((record) => record.audience))].slice(0, 4),
    topLocations: records
      .map((record) => {
        const match = (record.notes ?? "").match(/targeting (.+?)\./i);
        return match?.[1]?.split(" in ")[1]?.trim() ?? null;
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 4),
    topTargetingPatterns: records
      .map((record) => {
        const match = (record.notes ?? "").match(/targeting (.+?)\./i);
        return match?.[1]?.trim() ?? null;
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 4),
  };
}

export async function getCreativeIntelligenceProfile(
  input: Pick<OnboardingInput, "intent" | "audience" | "propertyType" | "keyOffer" | "market" | "mechanism">,
) {
  const fallback = analyzePatterns(buildSeedRecords(input));

  try {
    const supabase = await createClient();

    if (!supabase) {
      return fallback;
    }

    let organizationId: string | null = null;
    let userId: string | null = null;

    try {
      const context = await getAppContext();
      organizationId = context?.organization.id ?? null;
      userId = context?.user.id ?? null;
    } catch {
      organizationId = null;
      userId = null;
    }

    const { data, error } = await supabase
      .from("creative_intelligence")
      .select("*")
      .eq("industry", "real_estate")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error || !data) {
      return fallback;
    }

    const rows = (data as CreativeIntelligenceRow[]).filter((row) => {
      if (row.organization_id === null) {
        return true;
      }

      return row.organization_id === organizationId && row.user_id === userId;
    });

    if (rows.length === 0) {
      return fallback;
    }

    const targetingRowsResult =
      organizationId && userId
        ? await supabase
            .from("targeting_intelligence_patterns")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("user_id", userId)
            .order("confidence_score", { ascending: false })
            .limit(10)
        : { data: [], error: null };

    const ranked = rows
      .map(mapRow)
      .sort((left, right) => scorePattern(right, input) - scorePattern(left, input));

    const selected: CreativeIntelligenceRecord[] = [];
    const seenAngles = new Set<CreativeAngle>();

    for (const angle of DEFAULT_ANGLE_ORDER) {
      const match = ranked.find((record) => record.angle === angle && !seenAngles.has(record.angle));

      if (match) {
        selected.push(match);
        seenAngles.add(match.angle);
      }
    }

    for (const record of ranked) {
      if (selected.length >= 5) {
        break;
      }

      if (seenAngles.has(record.angle)) {
        continue;
      }

      selected.push(record);
      seenAngles.add(record.angle);
    }

    const profile = analyzePatterns(selected.length > 0 ? selected : ranked.slice(0, 5));
    const targetingRows =
      ((targetingRowsResult.data ?? []) as TargetingIntelligenceRow[]).filter(Boolean);

    return {
      ...profile,
      topAudiences:
        targetingRows.length > 0
          ? [...new Set(targetingRows.map((row) => row.audience))].slice(0, 4)
          : profile.topAudiences,
      topLocations:
        targetingRows.length > 0
          ? [...new Set(targetingRows.map((row) => row.location))].slice(0, 4)
          : profile.topLocations,
      topTargetingPatterns:
        targetingRows.length > 0
          ? [...new Set(targetingRows.map((row) => row.targeting_pattern))].slice(0, 4)
          : profile.topTargetingPatterns,
    };
  } catch {
    return fallback;
  }
}

function mapResultToPerformanceTag(resultTag: CreativeResultTag): CreativePerformanceTag {
  if (resultTag === "winner") {
    return "high";
  }

  if (resultTag === "average") {
    return "medium";
  }

  return "test";
}

function inferAngle(ad: CampaignAd): CreativeAngle {
  const source = `${ad.variant} ${ad.overlayText} ${ad.headline}`.toLowerCase();

  if (source.includes("approval") || source.includes("credit")) {
    return "approval";
  }

  if (source.includes("exclusive") || source.includes("off-market")) {
    return "exclusivity";
  }

  if (source.includes("fast") || source.includes("before") || source.includes("limited")) {
    return "urgency";
  }

  if (source.includes("tired") || source.includes("wasting") || source.includes("wrong")) {
    return "pain";
  }

  return "speed";
}

export async function recordCreativeIntelligenceFeedback(params: {
  plan: CampaignPlan;
  ads: CampaignAd[];
  resultTag: CreativeResultTag;
  notes: string;
}) {
  try {
    const supabase = await createClient();
    const context = await getAppContext();

    if (!supabase || !context || params.ads.length === 0) {
      return;
    }

    const rows: Database["public"]["Tables"]["creative_intelligence"]["Insert"][] = params.ads.map(
      (ad) => ({
        organization_id: context.organization.id,
        user_id: context.user.id,
        hook: ad.overlayText,
        angle: normalizeAngle(ad.angle ?? inferAngle(ad)),
        audience: params.plan.audience,
        offer: params.plan.keyOffer,
        industry: "real_estate",
        format: "image_overlay",
        notes: params.notes,
        performance_tag: mapResultToPerformanceTag(params.resultTag),
        result_tag: params.resultTag,
        source: "feedback_loop",
      }),
    );

    await supabase.from("creative_intelligence").insert(rows as never);
  } catch {
    return;
  }
}
