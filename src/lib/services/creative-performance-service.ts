import { createClient } from "@/lib/supabase/server";
import type { MetaCampaignSyncSnapshot, MetaEntityStatus } from "@/lib/integrations/meta/types";
import { getAppContext } from "@/lib/services/app-context";
import { recordCreativeIntelligenceFeedback, type CreativeAngle } from "@/lib/services/creative-intelligence-service";
import { buildExecutableCampaign } from "@/lib/services/campaign-execution-service";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { Database } from "@/lib/supabase/types";

type PerformanceSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type PerformanceRow = Database["public"]["Tables"]["creative_performance_snapshots"]["Row"];
type PatternScoreRow = Database["public"]["Tables"]["creative_pattern_scores"]["Row"];

export type CreativeClassification = "winner" | "average" | "loser" | "inconclusive";

export type CreativePerformanceRecord = {
  id: string;
  creativeId: string;
  campaignId: string;
  angle: CreativeAngle;
  hook: string;
  headline: string;
  cta: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number | null;
  status: string;
  classification: CreativeClassification;
  syncedAt: string;
};

export type RankedCreativePerformanceRecord = CreativePerformanceRecord & {
  aiScore: number;
  performanceScore: number;
  combinedScore: number;
};

export type CreativePatternScore = {
  hook: string;
  angle: CreativeAngle;
  offer: string;
  successCount: number;
  failureCount: number;
  inconclusiveCount: number;
  lastSeen: string | null;
  confidenceScore: number;
};

type CreativePerformanceSnapshotInsertRow = {
  organization_id: string;
  user_id: string;
  creative_id: string;
  campaign_id: string;
  angle: CreativeAngle;
  hook: string;
  headline: string;
  cta: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number | null;
  status: string;
  classification: CreativeClassification;
  synced_at: string;
};

export type CreativePerformanceSummary = {
  campaignId: string;
  syncedAt: string;
  winners: CreativePerformanceRecord[];
  underperformers: CreativePerformanceRecord[];
  average: CreativePerformanceRecord[];
  inconclusive: CreativePerformanceRecord[];
  rankedCreatives: RankedCreativePerformanceRecord[];
  testedAngles: Array<{
    angle: CreativeAngle;
    creatives: number;
    winnerCount: number;
    loserCount: number;
  }>;
  learned: string[];
  topPatternScores: CreativePatternScore[];
};

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

function mapPerformanceRow(row: PerformanceRow): CreativePerformanceRecord {
  return {
    id: row.id,
    creativeId: row.creative_id,
    campaignId: row.campaign_id,
    angle: normalizeAngle(row.angle),
    hook: row.hook,
    headline: row.headline,
    cta: row.cta,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    leads: Number(row.leads ?? 0),
    cpl: row.cpl === null ? null : Number(row.cpl),
    status: row.status,
    classification:
      row.classification === "winner" ||
      row.classification === "average" ||
      row.classification === "loser"
        ? row.classification
        : "inconclusive",
    syncedAt: row.synced_at,
  };
}

function mapPatternScoreRow(row: PatternScoreRow): CreativePatternScore {
  return {
    hook: row.hook,
    angle: normalizeAngle(row.angle),
    offer: row.offer,
    successCount: row.success_count,
    failureCount: row.failure_count,
    inconclusiveCount: row.inconclusive_count,
    lastSeen: row.last_seen,
    confidenceScore: Number(row.confidence_score ?? 0.5),
  };
}

function getStatusWeight(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes("ACTIVE")) {
    return 1.2;
  }

  if (normalized.includes("LEARNING")) {
    return 1;
  }

  if (normalized.includes("PAUSED")) {
    return 0.45;
  }

  return 0.8;
}

function classifyCreative(params: {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpl: number | null;
  averageCtr: number;
  averageCpl: number | null;
}) {
  if (params.impressions < 500 || params.spend < 15 || params.clicks < 8) {
    return "inconclusive" satisfies CreativeClassification;
  }

  if (
    params.ctr >= params.averageCtr * 1.15 &&
    (params.averageCpl === null || params.cpl === null || params.cpl <= params.averageCpl * 0.9)
  ) {
    return "winner" satisfies CreativeClassification;
  }

  if (
    params.ctr <= params.averageCtr * 0.82 ||
    (params.averageCpl !== null && params.cpl !== null && params.cpl >= params.averageCpl * 1.18)
  ) {
    return "loser" satisfies CreativeClassification;
  }

  return "average" satisfies CreativeClassification;
}

function getAdInsights(snapshot: MetaCampaignSyncSnapshot) {
  const syncMetadata =
    snapshot.syncMetadata &&
    typeof snapshot.syncMetadata === "object" &&
    !Array.isArray(snapshot.syncMetadata)
      ? (snapshot.syncMetadata as Record<string, unknown>)
      : null;
  const raw = syncMetadata?.ad_insights;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    const impressions = Number(row.impressions ?? 0);
    const clicks = Number(row.clicks ?? 0);

    return {
      adId: String(row.adId ?? ""),
      adName: String(row.adName ?? ""),
      spend: Number(row.spend ?? 0),
      impressions,
      clicks,
      ctr:
        row.ctr !== undefined
          ? Number(row.ctr)
          : clicks / Math.max(impressions, 1),
      leads: Number(row.leads ?? 0),
    };
  });
}

function getAdStatuses(snapshot: MetaCampaignSyncSnapshot): MetaEntityStatus[] {
  const raw = snapshot.adStatuses;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = typeof row.name === "string" ? row.name : "";
    const status = typeof row.status === "string" ? row.status : null;

    if (!id || !status) {
      return [];
    }

    return [
      {
        id,
        name,
        status,
      },
    ];
  });
}

function getSyncMode(snapshot: MetaCampaignSyncSnapshot) {
  return "live";
}

function calculateConfidenceScore(successCount: number, failureCount: number) {
  const total = successCount + failureCount;

  if (total === 0) {
    return 0.5;
  }

  return Number((successCount / total).toFixed(2));
}

function clampScore(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Number(value.toFixed(1))));
}

function buildPerformanceScore(record: CreativePerformanceRecord, summary: {
  averageCtr: number;
  averageCpl: number | null;
}) {
  let score = 5;

  if (record.ctr > 0 && summary.averageCtr > 0) {
    score += ((record.ctr / summary.averageCtr) - 1) * 3.5;
  }

  if (record.cpl !== null && summary.averageCpl !== null && summary.averageCpl > 0) {
    score += ((summary.averageCpl / record.cpl) - 1) * 2.5;
  }

  if (record.classification === "winner") {
    score += 1.5;
  } else if (record.classification === "loser") {
    score -= 1.5;
  }

  return clampScore(score);
}

function buildAiScore(record: CreativePerformanceRecord, patternScores: CreativePatternScore[]) {
  const pattern = patternScores.find(
    (item) => item.hook === record.hook && item.angle === record.angle,
  );

  if (!pattern) {
    return record.classification === "winner" ? 7 : record.classification === "loser" ? 4 : 5.5;
  }

  const score =
    4 +
    pattern.confidenceScore * 4 +
    Math.min(pattern.successCount, 4) * 0.5 -
    Math.min(pattern.failureCount, 4) * 0.35;

  return clampScore(score);
}

function rankCreativePerformanceRecords(
  records: CreativePerformanceRecord[],
  patternScores: CreativePatternScore[],
) {
  const ctrValues = records.map((item) => item.ctr).filter((value) => Number.isFinite(value) && value > 0);
  const cplValues = records
    .map((item) => item.cpl)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const averageCtr =
    ctrValues.length > 0 ? ctrValues.reduce((sum, value) => sum + value, 0) / ctrValues.length : 0;
  const averageCpl =
    cplValues.length > 0 ? cplValues.reduce((sum, value) => sum + value, 0) / cplValues.length : null;

  return records
    .map((record) => {
      const aiScore = buildAiScore(record, patternScores);
      const performanceScore = buildPerformanceScore(record, {
        averageCtr,
        averageCpl,
      });
      const combinedScore = clampScore(aiScore + performanceScore, 0, 20);

      return {
        ...record,
        aiScore,
        performanceScore,
        combinedScore,
      } satisfies RankedCreativePerformanceRecord;
    })
    .sort((left, right) => right.combinedScore - left.combinedScore);
}

async function getPerformanceContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    return null;
  }

  return { context, supabase: supabase as PerformanceSupabase };
}

function buildLearnedMessages(summary: {
  winners: CreativePerformanceRecord[];
  underperformers: CreativePerformanceRecord[];
  testedAngles: CreativePerformanceSummary["testedAngles"];
}) {
  const learned: string[] = [];
  const topWinner = summary.winners[0];
  const topLoser = summary.underperformers[0];

  if (topWinner && topLoser && topWinner.angle !== topLoser.angle) {
    learned.push(
      `${capitalize(topWinner.angle)} angle is outperforming ${topLoser.angle} angle in this campaign.`,
    );
  }

  if (topWinner) {
    learned.push(
      `${capitalize(topWinner.angle)} hook "${topWinner.hook}" is currently the strongest performer.`,
    );
  }

  if (topLoser) {
    learned.push(
      `The weakest creative is "${topLoser.hook}", so pause or rewrite that angle before scaling.`,
    );
  }

  if (summary.testedAngles.length > 0) {
    const tested = summary.testedAngles.map((item) => item.angle).join(", ");
    learned.push(`Tested angles so far: ${tested}.`);
  }

  return learned.slice(0, 3);
}

export async function recordCreativePerformanceSnapshot(params: {
  plan: CampaignPlan;
  snapshot: MetaCampaignSyncSnapshot;
}) {
  const context = await getPerformanceContext();

  if (!context) {
    return null;
  }

  const { supabase } = context;
  const campaign = buildExecutableCampaign(params.plan);
  const ads = campaign.adSets.flatMap((adSet) => adSet.ads);
  const adStatuses = getAdStatuses(params.snapshot);

  if (ads.length === 0) {
    return null;
  }

  const liveInsights = getAdInsights(params.snapshot);
  const provisional =
    liveInsights.length > 0
      ? ads.map((ad, index) => {
          const status = adStatuses.find((item) => item.id === ad.id)?.status ??
            adStatuses[index]?.status ??
            ad.status;
          const insight = liveInsights.find((item) => item.adId === ad.id) ?? liveInsights[index];
          const spend = Number(insight?.spend ?? 0);
          const impressions = Number(insight?.impressions ?? 0);
          const clicks = Number(insight?.clicks ?? 0);
          const leads = Number(insight?.leads ?? 0);
          const ctr = insight?.ctr ?? clicks / Math.max(impressions, 1);
          const cpl = leads > 0 ? Number((spend / leads).toFixed(2)) : null;

          return {
            ad,
            status,
            spend,
            impressions,
            clicks,
            ctr,
            leads,
            cpl,
          };
        })
      : ads.map((ad, index) => {
          const status = adStatuses.find((item) => item.id === ad.id)?.status ??
            adStatuses[index]?.status ??
            ad.status;

          return {
            ad,
            status,
            spend: 0,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            leads: 0,
            cpl: null,
          };
        });

  const averageCtr =
    provisional.reduce((sum, item) => sum + item.ctr, 0) / Math.max(provisional.length, 1);
  const cplValues = provisional.map((item) => item.cpl).filter((value): value is number => value !== null);
  const averageCpl =
    cplValues.length > 0
      ? cplValues.reduce((sum, value) => sum + value, 0) / cplValues.length
      : null;

  const syncedAt = typeof params.snapshot.syncedAt === "string" ? params.snapshot.syncedAt : new Date().toISOString();

  const rows: CreativePerformanceSnapshotInsertRow[] = provisional.map(
    (item) => ({
      organization_id: context.context.organization.id,
      user_id: context.context.user.id,
      creative_id: item.ad.id,
      campaign_id:
        typeof params.snapshot.metaCampaignId === "string" && params.snapshot.metaCampaignId.length > 0
          ? params.snapshot.metaCampaignId
          : String(params.snapshot.campaignName ?? params.plan.id),
      angle: normalizeAngle(item.ad.name.toLowerCase().includes("approval") ? "approval" : item.ad.creativeAsset.overlayText.toLowerCase().includes("before") ? "urgency" : item.ad.creativeAsset.overlayText.toLowerCase().includes("tired") ? "pain" : "speed"),
      hook: String(item.ad.creative ?? ""),
      headline: String(item.ad.headline ?? ""),
      cta: String(item.ad.cta ?? ""),
      spend: item.spend,
      impressions: item.impressions,
      clicks: item.clicks,
      ctr: Number(item.ctr.toFixed(4)),
      leads: item.leads,
      cpl: item.cpl,
      status: String(item.status),
      classification: classifyCreative({
        spend: item.spend,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.ctr,
        cpl: item.cpl,
        averageCtr,
        averageCpl,
      }),
      synced_at: syncedAt,
    }),
  );

  const { error } = await supabase.from("creative_performance_snapshots").insert(rows as never);

  if (error) {
    throw error;
  }

  for (const row of rows) {
    const existing = await supabase
      .from("creative_pattern_scores")
      .select("*")
      .eq("organization_id", context.context.organization.id)
      .eq("user_id", context.context.user.id)
      .eq("hook", row.hook)
      .eq("angle", row.angle)
      .eq("offer", params.plan.keyOffer)
      .maybeSingle();

    const current = existing.data as PatternScoreRow | null;
    const successCount = (current?.success_count ?? 0) + (row.classification === "winner" ? 1 : 0);
    const failureCount = (current?.failure_count ?? 0) + (row.classification === "loser" ? 1 : 0);
    const inconclusiveCount =
      (current?.inconclusive_count ?? 0) +
      (row.classification === "inconclusive" || row.classification === "average" ? 1 : 0);

    await supabase.from("creative_pattern_scores").upsert(
      {
        organization_id: context.context.organization.id,
        user_id: context.context.user.id,
        hook: row.hook,
        angle: row.angle,
        offer: params.plan.keyOffer,
        success_count: successCount,
        failure_count: failureCount,
        inconclusive_count: inconclusiveCount,
        last_seen: syncedAt,
        confidence_score: calculateConfidenceScore(successCount, failureCount),
      } as never,
      { onConflict: "organization_id,user_id,hook,angle,offer" },
    );
  }

  const winners = rows.filter((row) => row.classification === "winner");
  const losers = rows.filter((row) => row.classification === "loser");
  const average = rows.filter((row) => row.classification === "average");

  if (winners.length > 0) {
    await recordCreativeIntelligenceFeedback({
      plan: params.plan,
      ads: winners.map((row) => ({
        variant: row.angle,
        angle: normalizeAngle(row.angle),
        overlayText: row.hook,
        headline: row.headline,
        body: row.headline,
        cta: row.cta,
        image: params.plan.ads[0]?.image ?? "",
      })),
      resultTag: "winner",
      notes: `Winner attribution captured from live sync at ${params.snapshot.syncedAt}.`,
    });
  }

  if (losers.length > 0) {
    await recordCreativeIntelligenceFeedback({
      plan: params.plan,
      ads: losers.map((row) => ({
        variant: row.angle,
        angle: normalizeAngle(row.angle),
        overlayText: row.hook,
        headline: row.headline,
        body: row.headline,
        cta: row.cta,
        image: params.plan.ads[0]?.image ?? "",
      })),
      resultTag: "loser",
      notes: `Underperforming creative attribution captured from live sync at ${params.snapshot.syncedAt}.`,
    });
  }

  if (average.length > 0) {
    await recordCreativeIntelligenceFeedback({
      plan: params.plan,
      ads: average.map((row) => ({
        variant: row.angle,
        angle: normalizeAngle(row.angle),
        overlayText: row.hook,
        headline: row.headline,
        body: row.headline,
        cta: row.cta,
        image: params.plan.ads[0]?.image ?? "",
      })),
      resultTag: "average",
      notes: `Average creative attribution captured from live sync at ${params.snapshot.syncedAt}.`,
    });
  }

  return getLatestCreativePerformanceSummary();
}

export async function getLatestCreativePerformanceSummary() {
  const context = await getPerformanceContext();

  if (!context) {
    return null;
  }

  let latestRow: { synced_at: string; campaign_id: string } | null = null;

  try {
    const latest = await context.supabase
      .from("creative_performance_snapshots")
      .select("synced_at,campaign_id")
      .eq("organization_id", context.context.organization.id)
      .eq("user_id", context.context.user.id)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    latestRow = latest.data as { synced_at: string; campaign_id: string } | null;
  } catch {
    latestRow = null;
  }

  if (!latestRow) {
    return null;
  }

  return buildCreativePerformanceSummaryForSnapshot(context, latestRow.campaign_id, latestRow.synced_at);
}

export async function getCreativePerformanceSummaryForCampaign(campaignId: string) {
  const context = await getPerformanceContext();

  if (!context) {
    return null;
  }

  let latestRow: { synced_at: string; campaign_id: string } | null = null;

  try {
    const latest = await context.supabase
      .from("creative_performance_snapshots")
      .select("synced_at,campaign_id")
      .eq("organization_id", context.context.organization.id)
      .eq("user_id", context.context.user.id)
      .eq("campaign_id", campaignId)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    latestRow = latest.data as { synced_at: string; campaign_id: string } | null;
  } catch {
    latestRow = null;
  }

  if (!latestRow) {
    return null;
  }

  return buildCreativePerformanceSummaryForSnapshot(context, latestRow.campaign_id, latestRow.synced_at);
}

async function buildCreativePerformanceSummaryForSnapshot(
  context: NonNullable<Awaited<ReturnType<typeof getPerformanceContext>>>,
  campaignId: string,
  syncedAt: string,
) {
  let records: CreativePerformanceRecord[] = [];
  let topPatternScores: CreativePatternScore[] = [];

  try {
    const [rowsResult, scoresResult] = await Promise.all([
      context.supabase
        .from("creative_performance_snapshots")
        .select("*")
        .eq("organization_id", context.context.organization.id)
        .eq("user_id", context.context.user.id)
        .eq("campaign_id", campaignId)
        .eq("synced_at", syncedAt)
        .order("spend", { ascending: false }),
      context.supabase
        .from("creative_pattern_scores")
        .select("*")
        .eq("organization_id", context.context.organization.id)
        .eq("user_id", context.context.user.id)
        .order("confidence_score", { ascending: false })
        .limit(6),
    ]);

    records = (Array.isArray(rowsResult.data) ? (rowsResult.data as PerformanceRow[]) : []).map(
      mapPerformanceRow,
    );
    topPatternScores = (
      Array.isArray(scoresResult.data) ? (scoresResult.data as PatternScoreRow[]) : []
    ).map(mapPatternScoreRow);
  } catch {
    records = [];
    topPatternScores = [];
  }

  const winners = records.filter((record) => record.classification === "winner");
  const underperformers = records.filter((record) => record.classification === "loser");
  const average = records.filter((record) => record.classification === "average");
  const inconclusive = records.filter((record) => record.classification === "inconclusive");
  const rankedCreatives = rankCreativePerformanceRecords(records, topPatternScores);
  const testedAngles = Object.entries(
    records.reduce<Record<string, { creatives: number; winnerCount: number; loserCount: number }>>(
      (accumulator, record) => {
        const current = accumulator[record.angle] ?? {
          creatives: 0,
          winnerCount: 0,
          loserCount: 0,
        };
        accumulator[record.angle] = {
          creatives: current.creatives + 1,
          winnerCount: current.winnerCount + (record.classification === "winner" ? 1 : 0),
          loserCount: current.loserCount + (record.classification === "loser" ? 1 : 0),
        };
        return accumulator;
      },
      {},
    ),
  ).map(([angle, stats]) => ({
    angle: normalizeAngle(angle),
    ...stats,
  }));

  return {
    campaignId,
    syncedAt,
    winners,
    underperformers,
    average,
    inconclusive,
    rankedCreatives,
    testedAngles,
    learned: buildLearnedMessages({ winners, underperformers, testedAngles }),
    topPatternScores,
  } satisfies CreativePerformanceSummary;
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
