import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/services/app-context";
import type { Database } from "@/lib/supabase/types";

type TargetingSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type TargetingRow = Database["public"]["Tables"]["targeting_intelligence_patterns"]["Row"];

export type TargetingPatternInsight = {
  audience: string;
  location: string;
  targetingPattern: string;
  confidenceScore: number;
  performanceScore: number;
  leads: number;
  ctr: number;
  cpl: number | null;
  wins: number;
  losses: number;
  lastSeen: string | null;
};

export type TargetingIntelligenceProfile = {
  topAudienceSegments: TargetingPatternInsight[];
  topLocations: TargetingPatternInsight[];
  topPatterns: TargetingPatternInsight[];
  recommendedAudience: string | null;
  recommendedLocation: string | null;
  recommendedTargetingPattern: string | null;
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);

  if (filtered.length === 0) {
    return null;
  }

  return Number(average(filtered).toFixed(2));
}

function calculatePerformanceScore(row: {
  wins: number;
  losses: number;
  ctr: number;
  leads: number;
  cpl: number | null;
}) {
  let score = row.wins * 3;
  score -= row.losses * 2.5;
  score += Math.min(row.leads, 25) * 0.8;
  score += row.ctr * 100 * 2;

  if (row.cpl !== null) {
    score += Math.max(0, 40 - row.cpl);
  }

  if (row.leads === 0) {
    score -= 10;
  }

  return Number(score.toFixed(2));
}

async function getTargetingContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    return null;
  }

  return { context, supabase: supabase as TargetingSupabase };
}

function mapPatternRow(row: TargetingRow): TargetingPatternInsight {
  return {
    audience: row.audience,
    location: row.location,
    targetingPattern: row.targeting_pattern,
    confidenceScore: Number(row.confidence_score ?? 0.5),
    performanceScore: calculatePerformanceScore({
      wins: row.success_count ?? 0,
      losses: row.failure_count ?? 0,
      ctr: Number(row.ctr ?? 0),
      leads: Number(row.leads ?? 0),
      cpl: row.cpl === null ? null : Number(row.cpl),
    }),
    leads: Number(row.leads ?? 0),
    ctr: Number(row.ctr ?? 0),
    cpl: row.cpl === null ? null : Number(row.cpl),
    wins: row.success_count ?? 0,
    losses: row.failure_count ?? 0,
    lastSeen: row.last_seen,
  };
}

function aggregateByKey(
  rows: TargetingPatternInsight[],
  getKey: (row: TargetingPatternInsight) => string,
  buildRow: (key: string, rowsForKey: TargetingPatternInsight[]) => TargetingPatternInsight,
) {
  const grouped = rows.reduce<Record<string, TargetingPatternInsight[]>>((accumulator, row) => {
    const key = getKey(row);
    accumulator[key] = [...(accumulator[key] ?? []), row];
    return accumulator;
  }, {});

  return Object.entries(grouped).map(([key, items]) => buildRow(key, items));
}

export async function getTargetingIntelligenceProfile(): Promise<TargetingIntelligenceProfile | null> {
  const context = await getTargetingContext();

  if (!context) {
    return null;
  }

  const { data, error } = await context.supabase
    .from("targeting_intelligence_patterns")
    .select("*")
    .eq("organization_id", context.context.organization.id)
    .eq("user_id", context.context.user.id)
    .order("confidence_score", { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) {
    return null;
  }

  const rows = (data as TargetingRow[]).map(mapPatternRow);

  const topPatterns = [...rows]
    .sort((left, right) => right.performanceScore - left.performanceScore)
    .slice(0, 5);

  const topAudienceSegments = aggregateByKey(
    rows,
    (row) => row.audience,
    (audience, items) => ({
      audience,
      location: items[0]?.location ?? "",
      targetingPattern: items[0]?.targetingPattern ?? audience,
      confidenceScore: Number(average(items.map((item) => item.confidenceScore)).toFixed(2)),
      performanceScore: Number(average(items.map((item) => item.performanceScore)).toFixed(2)),
      leads: items.reduce((sum, item) => sum + item.leads, 0),
      ctr: Number(average(items.map((item) => item.ctr)).toFixed(4)),
      cpl: averageNullable(items.map((item) => item.cpl)),
      wins: items.reduce((sum, item) => sum + item.wins, 0),
      losses: items.reduce((sum, item) => sum + item.losses, 0),
      lastSeen: items
        .map((item) => item.lastSeen)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    }),
  )
    .sort((left, right) => right.performanceScore - left.performanceScore)
    .slice(0, 5);

  const topLocations = aggregateByKey(
    rows,
    (row) => row.location,
    (location, items) => ({
      audience: items[0]?.audience ?? "",
      location,
      targetingPattern: items[0]?.targetingPattern ?? location,
      confidenceScore: Number(average(items.map((item) => item.confidenceScore)).toFixed(2)),
      performanceScore: Number(average(items.map((item) => item.performanceScore)).toFixed(2)),
      leads: items.reduce((sum, item) => sum + item.leads, 0),
      ctr: Number(average(items.map((item) => item.ctr)).toFixed(4)),
      cpl: averageNullable(items.map((item) => item.cpl)),
      wins: items.reduce((sum, item) => sum + item.wins, 0),
      losses: items.reduce((sum, item) => sum + item.losses, 0),
      lastSeen: items
        .map((item) => item.lastSeen)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    }),
  )
    .sort((left, right) => right.performanceScore - left.performanceScore)
    .slice(0, 5);

  return {
    topAudienceSegments,
    topLocations,
    topPatterns,
    recommendedAudience: topAudienceSegments[0]?.audience ?? null,
    recommendedLocation: topLocations[0]?.location ?? null,
    recommendedTargetingPattern: topPatterns[0]?.targetingPattern ?? null,
  };
}
