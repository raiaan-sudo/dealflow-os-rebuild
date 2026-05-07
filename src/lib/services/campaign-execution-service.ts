import { formatCurrency } from "@/lib/formatters";
import {
  getCampaignIntentSummary,
  isBuyerLikeCampaignIntent,
  isCommercialCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
} from "@/lib/campaign-intent";
import { ApiError } from "@/lib/api/route";
import { hasMetaEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import { getAppContext } from "@/lib/services/app-context";
import {
  logExecutionFailure,
  logExecutionInfo,
  logExecutionSuccess,
} from "@/lib/services/campaign-execution-log-service";
import {
  createMetaAd,
  createMetaAdSet,
  createMetaCampaign,
  createMetaCreative,
  publishMetaCampaignIfNeeded,
} from "@/lib/services/meta-launch-service";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import { getLaunchReadyCreativeMedia } from "@/lib/services/creative-builder-service";
import type { LaunchReadyCreativeMedia } from "@/lib/types/creative-assets";
import type {
  BuiltMetaAdPayload,
  BuiltMetaAdSetPayload,
  BuiltMetaCampaignPayload,
  CampaignExecution,
  CampaignExecutionAd,
  CampaignExecutionAdSet,
  CampaignExecutionLog,
  CampaignLaunchAsset,
  CampaignLaunchInput,
  CampaignLaunchResult,
  CampaignLaunchObjective,
  CampaignStructureBlueprint,
  ExecutionDetailRecord,
  LaunchValidationResult,
  LaunchableMetaAdAccount,
  MetaLaunchPayload,
  ValidatedLaunchConfig,
} from "@/lib/types/campaign-execution";

export type CampaignObjectStatus = "draft" | "ready" | "published" | "paused";

export type ExecutableCreative = {
  name: string;
  status: CampaignObjectStatus;
  imageUrl: string;
  overlayText: string;
  headline: string;
  body: string;
  aspectRatio: "1:1" | "4:5";
};

export type ExecutableAd = {
  id: string;
  name: string;
  status: CampaignObjectStatus;
  copy: string;
  headline: string;
  creative: string;
  creativeAsset: ExecutableCreative;
  cta: string;
  destinationUrl: string;
};

export type ExecutableAdSet = {
  id: string;
  name: string;
  status: CampaignObjectStatus;
  audience: string;
  targeting: {
    audience: string;
    propertyType: string;
    offer: string;
    location: string;
  };
  location: string;
  budget: string;
  ads: ExecutableAd[];
};

export type ExecutableCampaign = {
  id: string;
  name: string;
  status: CampaignObjectStatus;
  objective: string;
  destinationUrl: string;
  budget: string;
  adSets: ExecutableAdSet[];
};

const DEFAULT_CREATIVE_IMAGE =
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop";

function buildObjectId(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function getObjective(plan: CampaignPlan) {
  if (isSellerCampaignIntent(plan.intent)) {
    return "Seller lead generation";
  }

  if (isInvestorCampaignIntent(plan.intent)) {
    return "Investor lead generation";
  }

  if (isCommercialCampaignIntent(plan.intent)) {
    return "Commercial real estate lead generation";
  }

  return "Lead generation";
}

function getPrimaryAudience(plan: CampaignPlan) {
  return `${plan.audience} looking for ${plan.market} ${plan.propertyType}`.trim();
}

function getRetargetingAudience(plan: CampaignPlan) {
  return `${plan.audience} who engaged with ${plan.keyOffer} but did not convert`.trim();
}

function getExecutionStatus(plan: CampaignPlan): CampaignObjectStatus {
  if (plan.runtime.metaPushStatus === "published") {
    return "published";
  }

  if (plan.runtime.metaPushStatus === "failed") {
    return "paused";
  }

  if (plan.runtime.metaPushStatus === "partial") {
    return "ready";
  }

  if (
    plan.runtime.status === "draft" ||
    plan.runtime.status === "built" ||
    plan.runtime.status === "paywall" ||
    plan.runtime.status === "preview" ||
    plan.runtime.status === "connected" ||
    plan.runtime.status === "live" ||
    plan.runtime.status === "launching" ||
    plan.runtime.status === "active" ||
    plan.runtime.status === "learning" ||
    plan.runtime.status === "optimizing"
  ) {
    return "ready";
  }

  return "draft";
}

function getAdStatus(plan: CampaignPlan, adId: string, campaignStatus: CampaignObjectStatus) {
  if (plan.runtime.pausedAdIds.includes(adId)) {
    return "paused" satisfies CampaignObjectStatus;
  }

  return campaignStatus === "draft" ? "ready" : campaignStatus;
}

function getNormalizedAds(plan: CampaignPlan) {
  const sourceAds = Array.isArray(plan.ads) ? plan.ads : [];
  const normalized = sourceAds
    .filter(Boolean)
    .map((ad, index) => ({
      variant: ad.variant?.trim() || `Primary angle ${index + 1}`,
      overlayText: ad.overlayText?.trim() || ad.headline?.trim() || `${plan.audience} ${plan.keyOffer}`,
      headline:
        ad.headline?.trim() || `${plan.audience} in ${plan.market}: ${plan.keyOffer}`,
      body:
        ad.body?.trim() ||
        `Reach ${plan.audience} looking for ${plan.propertyType} in ${plan.market} with ${plan.keyOffer}.`,
      cta: ad.cta?.trim() || (
        isSellerCampaignIntent(plan.intent)
          ? "Get My Sale Plan"
          : isCommercialCampaignIntent(plan.intent)
            ? "See Matching Spaces"
          : isInvestorCampaignIntent(plan.intent)
            ? "See Available Cash-Flow Deals"
            : "Get My Curated List"
      ),
      image: ad.image?.trim() || DEFAULT_CREATIVE_IMAGE,
    }));

  if (normalized.length >= 3) {
    return normalized;
  }

  const fallbacks = [
    {
      variant: "Primary angle",
      overlayText: `${plan.audience} + ${plan.keyOffer}`,
      headline: `${plan.audience} in ${plan.market}: ${plan.keyOffer}`,
      body: `Reach ${plan.audience} looking for ${plan.propertyType} in ${plan.market} with ${plan.keyOffer}.`,
      cta: isSellerCampaignIntent(plan.intent)
        ? "Get My Sale Plan"
        : isCommercialCampaignIntent(plan.intent)
          ? "See Matching Spaces"
        : isInvestorCampaignIntent(plan.intent)
          ? "See Available Cash-Flow Deals"
          : "Get My Curated List",
      image: DEFAULT_CREATIVE_IMAGE,
    },
    {
      variant: "Follow-up angle",
      overlayText: `Stop missing the best ${plan.market} ${plan.propertyType}`,
      headline: `${plan.propertyType} for ${plan.audience} in ${plan.market}`,
      body: `Show ${plan.audience} a stronger path into ${plan.propertyType} with ${plan.keyOffer}.`,
      cta: isSellerCampaignIntent(plan.intent)
        ? "Get My Home Value Plan"
        : isCommercialCampaignIntent(plan.intent)
          ? "Review Available Options"
        : isInvestorCampaignIntent(plan.intent)
          ? "View Investor Deals"
          : "See Homes That Match Me",
      image: DEFAULT_CREATIVE_IMAGE,
    },
    {
      variant: "Urgency angle",
      overlayText: `Move faster with ${plan.keyOffer}`,
      headline: `${plan.keyOffer} for ${plan.audience}`,
      body: `Keep the message clear, specific, and built around ${plan.propertyType} demand in ${plan.market}.`,
      cta: isSellerCampaignIntent(plan.intent)
        ? "See My Plan"
        : isCommercialCampaignIntent(plan.intent)
          ? "Check Space Fit"
        : isInvestorCampaignIntent(plan.intent)
          ? "Review Deal Flow"
          : "Start Getting Leads",
      image: DEFAULT_CREATIVE_IMAGE,
    },
  ];

  return [...normalized, ...fallbacks].slice(0, 3);
}

export function buildExecutableCampaign(plan: CampaignPlan): ExecutableCampaign {
  const totalBudget = Math.max(plan.monthlyBudget, 0);
  const primaryBudget = Math.round(totalBudget * 0.7);
  const retargetingBudget = Math.max(totalBudget - primaryBudget, 0);
  const campaignStatus = getExecutionStatus(plan);
  const destinationUrl = "/funnel";
  const normalizedAds = getNormalizedAds(plan);

  return {
    id: buildObjectId("campaign", `${plan.market}-${plan.propertyType}-${plan.intent}`),
    name: `${plan.market} ${plan.propertyType} ${getCampaignIntentSummary(plan.intent)}`,
    status: campaignStatus,
    objective: getObjective(plan),
    destinationUrl,
    budget: `${formatCurrency(totalBudget)}/month`,
    adSets: [
      {
        id: buildObjectId("adset", `${plan.market}-primary`),
        name: "Primary acquisition",
        status: campaignStatus === "draft" ? "ready" : campaignStatus,
        audience: getPrimaryAudience(plan),
        targeting: {
          audience: plan.audience,
          propertyType: plan.propertyType,
          offer: plan.keyOffer,
          location: plan.market,
        },
        location: plan.market,
        budget: `${formatCurrency(primaryBudget)}/month`,
        ads: normalizedAds.slice(0, 2).map((ad, index) => ({
          id: buildObjectId("ad", `${plan.market}-primary-${index + 1}`),
          name: `${ad.variant || "Primary"} ${index + 1}`,
          status: getAdStatus(
            plan,
            buildObjectId("ad", `${plan.market}-primary-${index + 1}`),
            campaignStatus,
          ),
          copy: ad.body,
          headline: ad.headline,
          creative: ad.overlayText,
          creativeAsset: {
            name: `${ad.variant || "Primary"} creative`,
            status: getAdStatus(
              plan,
              buildObjectId("ad", `${plan.market}-primary-${index + 1}`),
              campaignStatus,
            ),
            imageUrl: ad.image,
            overlayText: ad.overlayText,
            headline: ad.headline,
            body: ad.body,
            aspectRatio: "4:5",
          },
          cta: ad.cta,
          destinationUrl,
        })),
      },
      {
        id: buildObjectId("adset", `${plan.market}-retargeting`),
        name: "Retargeting follow-up",
        status: campaignStatus === "draft" ? "ready" : campaignStatus,
        audience: getRetargetingAudience(plan),
        targeting: {
          audience: `${plan.audience} retargeting`,
          propertyType: plan.propertyType,
          offer: plan.keyOffer,
          location: plan.market,
        },
        location: plan.market,
        budget: `${formatCurrency(retargetingBudget)}/month`,
        ads: normalizedAds.slice(1, 3).map((ad, index) => ({
          id: buildObjectId("ad", `${plan.market}-retargeting-${index + 1}`),
          name: `Retargeting ${index + 1}`,
          status: getAdStatus(
            plan,
            buildObjectId("ad", `${plan.market}-retargeting-${index + 1}`),
            campaignStatus,
          ),
          copy: `${ad.body} Re-engage people who already showed interest in ${plan.keyOffer}.`,
          headline: ad.headline,
          creative: ad.overlayText,
          creativeAsset: {
            name: `Retargeting creative ${index + 1}`,
            status: getAdStatus(
              plan,
              buildObjectId("ad", `${plan.market}-retargeting-${index + 1}`),
              campaignStatus,
            ),
            imageUrl: ad.image,
            overlayText: ad.overlayText,
            headline: ad.headline,
            body: `${ad.body} Re-engage people who already showed interest in ${plan.keyOffer}.`,
            aspectRatio: "4:5",
          },
          cta: ad.cta,
          destinationUrl,
        })),
      },
    ],
  };
}

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type MarketingAccountRow = Database["public"]["Tables"]["marketing_accounts"]["Row"];

const RECOGNIZED_CREATIVE_FORMATS = new Set(["talking_head", "ugc", "montage"]);
const EXECUTION_CTA_MAP: Record<string, string> = {
  "learn more": "LEARN_MORE",
  "see available homes": "LEARN_MORE",
  "get access now": "LEARN_MORE",
  "access properties now": "LEARN_MORE",
  "click to claim": "LEARN_MORE",
  "check eligibility": "LEARN_MORE",
  "get my home value": "LEARN_MORE",
  "get access": "LEARN_MORE",
};

async function requireExecutionContext(expectedUserId?: string) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for campaign launch.", "unauthorized");
  }

  if (expectedUserId && context.user.id !== expectedUserId) {
    throw new ApiError(403, "Campaign launch user context mismatch.", "forbidden");
  }

  return {
    context,
    supabase,
    userId: context.user.id,
    organizationId: context.organization.id,
  };
}

function toMinorUnits(value: number) {
  return Math.round(value * 100);
}

function getMetaBudgetCapCents() {
  const configured = Number.parseInt(process.env.META_DAILY_BUDGET_CAP_CENTS ?? "100", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 100) : 100;
}

function getMetadataString(row: MarketingAccountRow | MetaConnectionRecord | null, key: string) {
  const metadata = row?.connection_metadata;
  const value =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)[key]
      : null;

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getMetaAccountPixelId(row: MarketingAccountRow | MetaConnectionRecord | null) {
  return (
    (typeof row?.pixel_id === "string" && row.pixel_id.trim().length > 0
      ? row.pixel_id.trim()
      : null) ?? getMetadataString(row, "pixel_id")
  );
}

function normalizeLaunchDomain(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase().replace(/\/+$/, "");

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.split("/")[0] || null;
  }
}

function destinationMatchesLaunchDomain(destinationUrl: string, launchDomain: string | null) {
  if (!launchDomain) {
    return false;
  }

  try {
    const destinationHost = new URL(destinationUrl).hostname.toLowerCase();
    const normalizedLaunchDomain = normalizeLaunchDomain(launchDomain);
    return Boolean(
      normalizedLaunchDomain &&
        (destinationHost === normalizedLaunchDomain ||
          destinationHost.endsWith(`.${normalizedLaunchDomain}`)),
    );
  } catch {
    return false;
  }
}

function getMetaTrackingPreflightErrors(
  metaAccount: MarketingAccountRow | MetaConnectionRecord | null,
  destinationUrl: string,
) {
  const errors: string[] = [];
  const launchDomain =
    (typeof metaAccount?.launch_domain === "string" && metaAccount.launch_domain.trim().length > 0
      ? metaAccount.launch_domain.trim()
      : null) ?? getMetadataString(metaAccount, "launch_domain");
  const metadata =
    metaAccount?.connection_metadata &&
    typeof metaAccount.connection_metadata === "object" &&
    !Array.isArray(metaAccount.connection_metadata)
      ? (metaAccount.connection_metadata as Record<string, unknown>)
      : {};
  const domainVerified =
    metaAccount?.domain_verified === true ||
    metadata.domain_verified === true;

  if (!getMetaAccountPixelId(metaAccount)) {
    errors.push("Selected Meta ad account is missing a configured pixel.");
  }

  if (!launchDomain) {
    errors.push("Selected Meta ad account is missing a launch domain.");
  } else if (!domainVerified) {
    errors.push("Selected Meta launch domain is not verified.");
  } else if (!destinationMatchesLaunchDomain(destinationUrl, launchDomain)) {
    errors.push("Destination URL must use the verified Meta launch domain.");
  }

  return errors;
}

function buildMetaName(baseName: string, campaignId: string, stage: string) {
  return `${baseName} | DF-${campaignId.slice(0, 8)}-${stage}`.trim();
}

function inferCountryCode(location: string) {
  const normalized = location.toLowerCase();

  if (
    /\btoronto\b|\bontario\b|\bvancouver\b|\bcalgary\b|\bedmonton\b|\bmontreal\b|\bcanada\b/.test(
      normalized,
    )
  ) {
    return "CA";
  }

  return "US";
}

function getAgeRange(marketType?: FullCampaignRecord["strategy"]["market_type"]) {
  if (marketType === "commercial") {
    return { min: 28, max: 65 };
  }

  if (marketType === "investor") {
    return { min: 28, max: 60 };
  }

  if (marketType === "seller") {
    return { min: 32, max: 68 };
  }

  return { min: 24, max: 54 };
}

function normalizeExecutionCta(cta?: string | null) {
  if (!cta) {
    return "LEARN_MORE";
  }

  const normalized = cta.trim().toLowerCase();
  const directMatch = EXECUTION_CTA_MAP[normalized];

  if (directMatch) {
    return directMatch;
  }

  if (normalized.includes("eligib")) {
    return "APPLY_NOW";
  }

  if (normalized.includes("access") || normalized.includes("claim")) {
    return "SIGN_UP";
  }

  if (normalized.includes("call") || normalized.includes("book")) {
    return "BOOK_TRAVEL";
  }

  return "LEARN_MORE";
}

function normalizeObjective(objective: CampaignLaunchObjective) {
  if (objective === "TRAFFIC") {
    return "OUTCOME_TRAFFIC";
  }

  if (objective === "CONVERSIONS") {
    return "OUTCOME_SALES";
  }

  return "OUTCOME_LEADS";
}

function normalizeOptimizationGoal(config: ValidatedLaunchConfig) {
  if (config.objective === "TRAFFIC") {
    return "LINK_CLICKS";
  }

  if (config.objective === "CONVERSIONS") {
    return "OFFSITE_CONVERSIONS";
  }

  if (config.pixelId) {
    return "OFFSITE_CONVERSIONS";
  }

  return "LINK_CLICKS";
}

function toAbsoluteLaunchUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Destination URL must be a valid absolute URL.", "invalid_destination_url");
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new ApiError(400, "Destination URL must use http or https.", "invalid_destination_url");
  }

  return url.toString();
}

function buildLaunchAssets(record: FullCampaignRecord): CampaignLaunchAsset[] {
  return (record.creatives.ideas || []).filter(Boolean).map((creative, index) => {
    const copy = record.creatives.copy[index] ?? record.creatives.copy[0];

    return {
      id: creative?.id || copy?.id || `launch-asset-${index + 1}`,
      creativeId: creative?.id || "",
      copyId: copy?.id ?? record.creatives.copy[0]?.id ?? "",
      hook: (creative?.hook ?? "").trim(),
      angle: creative?.angle || "",
      format: creative?.format || "",
      concept: (creative?.concept ?? "").trim(),
      visualDirection: (creative?.visual_direction ?? "").trim(),
      primaryText: (copy?.primary_text ?? "").trim(),
      script: (copy?.script ?? "").trim(),
      headline: (copy?.headline ?? "").trim(),
      cta: (copy?.cta ?? "").trim(),
    };
  });
}

function buildCampaignBlueprint(
  record: FullCampaignRecord,
  config: ValidatedLaunchConfig,
): CampaignStructureBlueprint {
  return {
    name: `${record.campaign.name} | ${record.strategy.location || "Meta Launch"}`.trim(),
    objective: config.objective,
    destinationUrl: config.destinationUrl,
    adSetName: `${record.campaign.name} | Core audience`,
    marketType: record.strategy.market_type,
    audience: record.strategy.audience,
    location: record.strategy.location,
    offer: record.strategy.offer,
    assets: buildLaunchAssets(record),
  };
}

async function getOwnedMetaAdAccount(
  supabase: SupabaseClient,
  organizationId: string,
  metaAdAccountId: string,
) {
  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("id", metaAdAccountId)
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MarketingAccountRow | null) ?? null;
}

function mapLaunchConfigFromExecution(execution: CampaignExecution): CampaignLaunchInput {
  return {
    campaign_id: execution.campaign_id ?? undefined,
    meta_ad_account_id: execution.meta_ad_account_id ?? undefined,
    objective: (execution.objective as CampaignLaunchObjective | null) ?? "LEADS",
    destination_url: execution.destination_url ?? "",
    budget_type: execution.budget_type === "lifetime" ? "lifetime" : "daily",
    daily_budget: execution.daily_budget ?? undefined,
    lifetime_budget: execution.lifetime_budget ?? undefined,
    start_immediately: false,
    form_type: "landing_page",
  };
}

async function updateExecutionRecord(
  supabase: SupabaseClient,
  executionId: string,
  payload: Database["public"]["Tables"]["campaign_executions"]["Update"],
) {
  const { error } = await supabase
    .from("campaign_executions")
    .update(payload as never)
    .eq("id", executionId);

  if (error) {
    throw error;
  }
}

async function updateExecutionAdSetRecord(
  supabase: SupabaseClient,
  adSetExecutionId: string,
  payload: Database["public"]["Tables"]["campaign_execution_ad_sets"]["Update"],
) {
  const { error } = await supabase
    .from("campaign_execution_ad_sets")
    .update(payload as never)
    .eq("id", adSetExecutionId);

  if (error) {
    throw error;
  }
}

async function updateExecutionAdRecord(
  supabase: SupabaseClient,
  adExecutionId: string,
  payload: Database["public"]["Tables"]["campaign_execution_ads"]["Update"],
) {
  const { error } = await supabase
    .from("campaign_execution_ads")
    .update(payload as never)
    .eq("id", adExecutionId);

  if (error) {
    throw error;
  }
}

export async function listMetaAdAccountsForLaunch(
  userId: string,
): Promise<LaunchableMetaAdAccount[]> {
  const { supabase, organizationId } = await requireExecutionContext(userId);
  const { data, error } = await supabase
    .from("marketing_accounts")
    .select("id, account_name, external_account_id, status, connected_at")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .order("connected_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as LaunchableMetaAdAccount[] | null) ?? [];
}

export async function validateCampaignForLaunch(
  campaignId: string,
  userId: string,
  launchInput: CampaignLaunchInput,
): Promise<LaunchValidationResult> {
  const { supabase, organizationId } = await requireExecutionContext(userId);
  const errors: string[] = [];

  if (!hasMetaEnv()) {
    errors.push("Meta Ads configuration is missing on the server.");
  }

  const campaign = await getCampaignById(campaignId).catch(() => null);

  if (!campaign) {
    return {
      ok: false,
      errors: ["Campaign not found."],
      campaign: null,
      config: null,
      metaAccount: null,
    };
  }

  if (!campaign.strategy.location?.trim()) {
    errors.push("Campaign is missing a launch location.");
  }

  if (!campaign.strategy.audience?.trim()) {
    errors.push("Campaign is missing an audience definition.");
  }

  if (!campaign.strategy.offer?.trim()) {
    errors.push("Campaign is missing an offer.");
  }

  if (campaign.creatives.ideas.length < 1) {
    errors.push("Campaign must include at least one creative.");
  }

  if (campaign.creatives.copy.length < 1) {
    errors.push("Campaign must include at least one copy asset.");
  }

  if (!campaign.funnel) {
    errors.push("Campaign must include a funnel blueprint.");
  }

  const selectedMetaAdAccountId = launchInput.meta_ad_account_id?.trim() || null;

  if (!selectedMetaAdAccountId) {
    errors.push("A Meta ad account selection is required.");
  }

  const metaAccount = selectedMetaAdAccountId
    ? await getOwnedMetaAdAccount(supabase, organizationId, selectedMetaAdAccountId)
    : null;

  if (!metaAccount) {
    errors.push("Selected Meta ad account could not be found.");
  }

  if (metaAccount && metaAccount.status !== "connected") {
    errors.push("Selected Meta ad account is not connected.");
  }

  if (metaAccount && !metaAccount.external_account_id) {
    errors.push("Selected Meta ad account is missing an external account ID.");
  }

  if (metaAccount && !metaAccount.access_token_encrypted) {
    errors.push("Selected Meta ad account is missing a valid access token.");
  }

  let destinationUrl = "";
  const rawDestinationUrl = launchInput.destination_url?.trim() || "";

  try {
    destinationUrl = toAbsoluteLaunchUrl(rawDestinationUrl);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Destination URL is invalid.");
  }

  const budgetType = launchInput.budget_type === "lifetime" ? "lifetime" : "daily";
  const dailyBudget = budgetType === "daily" ? Number(launchInput.daily_budget ?? 0) : null;
  const lifetimeBudget =
    budgetType === "lifetime" ? Number(launchInput.lifetime_budget ?? 0) : null;

  if (budgetType === "daily" && (!dailyBudget || dailyBudget <= 0)) {
    errors.push("Daily budget must be greater than zero.");
  }

  if (budgetType === "lifetime" && (!lifetimeBudget || lifetimeBudget <= 0)) {
    errors.push("Lifetime budget must be greater than zero.");
  }

  const budgetCapCents = getMetaBudgetCapCents();

  if (budgetType === "daily" && dailyBudget && toMinorUnits(dailyBudget) > budgetCapCents) {
    errors.push(`Daily budget must be ${budgetCapCents} cents or lower for beta launch safety.`);
  }

  if (budgetType === "lifetime" && lifetimeBudget && toMinorUnits(lifetimeBudget) > budgetCapCents) {
    errors.push(`Lifetime budget must be ${budgetCapCents} cents or lower for beta launch safety.`);
  }

  const selectedPixelId = launchInput.pixel_id?.trim() || getMetaAccountPixelId(metaAccount);

  if (launchInput.objective === "CONVERSIONS" && !selectedPixelId) {
    errors.push("Conversions objective requires a Meta pixel ID.");
  }

  if (metaAccount && destinationUrl) {
    errors.push(...getMetaTrackingPreflightErrors(metaAccount, destinationUrl));
  }

  const assets = buildLaunchAssets(campaign);

  assets.forEach((asset, index) => {
    const label = `Ad ${index + 1}`;

    if (!asset.hook) {
      errors.push(`${label} is missing a hook.`);
    }

    if (!asset.primaryText) {
      errors.push(`${label} is missing primary text.`);
    }

    if (!asset.headline) {
      errors.push(`${label} is missing a headline.`);
    }

    if (!asset.cta) {
      errors.push(`${label} is missing a CTA.`);
    }

    const assetFormat = asset.format ?? "";

    if (!RECOGNIZED_CREATIVE_FORMATS.has(assetFormat)) {
      errors.push(`${label} uses an unsupported creative format.`);
    }
  });

  const config: ValidatedLaunchConfig = {
    campaignId,
    metaAdAccountId: launchInput.meta_ad_account_id,
    objective: launchInput.objective,
    destinationUrl,
    budgetType,
    dailyBudget,
    lifetimeBudget,
    startImmediately: false,
    ctaType: normalizeExecutionCta(launchInput.cta_type ?? campaign.funnel?.cta ?? assets[0]?.cta),
    pixelId: selectedPixelId,
    formType: launchInput.form_type === "instant_form" ? "instant_form" : "landing_page",
  };

  if (errors.length > 0 || !metaAccount) {
    return {
      ok: false,
      errors,
      campaign,
      config,
      metaAccount,
    };
  }

  return {
    ok: true,
    campaign,
    config,
    metaAccount,
    blueprint: buildCampaignBlueprint(campaign, config),
  };
}

export function buildMetaCampaignPayload(
  campaignRecord: FullCampaignRecord,
  config: ValidatedLaunchConfig,
): BuiltMetaCampaignPayload {
  return {
    name: buildMetaName(
      `${campaignRecord.campaign.name} | ${campaignRecord.strategy.location || "Autopilot"}`.trim(),
      campaignRecord.campaign.id,
      "campaign",
    ),
    objective: normalizeObjective(config.objective ?? "LEADS"),
    status: "PAUSED",
    special_ad_categories: ["HOUSING"],
  };
}

export function buildMetaAdSetPayloads(
  campaignRecord: FullCampaignRecord,
  config: ValidatedLaunchConfig,
): BuiltMetaAdSetPayload[] {
  const ageRange = getAgeRange(campaignRecord.strategy.market_type);
  const interests = [
    { id: "seed_interest_real_estate", name: "real estate" },
    { id: "seed_interest_house_hunting", name: "house hunting" },
    { id: "seed_interest_home_ownership", name: "home ownership" },
    { id: "seed_interest_mortgage_loans", name: "mortgage loans" },
    { id: "seed_interest_zillow", name: "Zillow" },
    { id: "seed_interest_realtor", name: "Realtor.com" },
  ];

  return [
    {
      name: buildMetaName(
        `${campaignRecord.campaign.name} | Core audience`,
        campaignRecord.campaign.id,
        "adset",
      ),
      billing_event: "IMPRESSIONS",
      optimization_goal: normalizeOptimizationGoal(config),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ...(config.budgetType === "daily"
        ? { daily_budget: toMinorUnits(config.dailyBudget ?? 0) }
        : { lifetime_budget: toMinorUnits(config.lifetimeBudget ?? 0) }),
      targeting: {
        geo_locations: {
          countries: [inferCountryCode(campaignRecord.strategy.location)],
          custom_locations: [
            {
              address_string: campaignRecord.strategy.location,
              radius: 25,
              distance_unit: "mile",
            },
          ],
        },
        age_min: ageRange.min,
        age_max: ageRange.max,
        interests,
      },
      promoted_object: config.pixelId
        ? {
            pixel_id: config.pixelId,
            custom_event_type: config.objective === "CONVERSIONS" ? "PURCHASE" : "LEAD",
          }
        : undefined,
      status: "PAUSED",
    },
  ];
}

export function buildMetaAdPayloads(
  campaignRecord: FullCampaignRecord,
  config: ValidatedLaunchConfig,
  mediaAssets: LaunchReadyCreativeMedia[] = [],
): BuiltMetaAdPayload[] {
  return buildLaunchAssets(campaignRecord).map((asset) => ({
    ...(() => {
      const matchedMedia = mediaAssets.find(
        (media) =>
          (media.creativeId && media.creativeId === asset.creativeId) ||
          (media.copyId && media.copyId === asset.copyId),
      );

      return {
        asset,
        mediaUrl: matchedMedia?.thumbnailUrl ?? matchedMedia?.fileUrl ?? null,
      };
    })(),
  })).map(({ asset, mediaUrl }, index) => ({
    asset,
    creativePayload: {
      name: buildMetaName(
        `${campaignRecord.campaign.name} | Creative ${index + 1}`,
        campaignRecord.campaign.id,
        `creative-${index + 1}`,
      ),
      object_story_spec: {
        page_id: "",
        link_data: {
          message: asset.primaryText,
          name: asset.headline,
          ...(mediaUrl ? { picture: mediaUrl } : {}),
          link: config.destinationUrl,
          call_to_action: {
            type: config.ctaType,
            value: {
              link: config.destinationUrl,
            },
          },
        },
      },
    },
    adPayload: {
      name: buildMetaName(
        `${campaignRecord.campaign.name} | Ad ${index + 1}`,
        campaignRecord.campaign.id,
        `ad-${index + 1}`,
      ),
      status: "PAUSED",
    },
  }));
}

export async function createCampaignExecutionRecord(
  campaignId: string,
  userId: string,
  config: CampaignLaunchInput,
) {
  const { supabase, organizationId } = await requireExecutionContext(userId);
  const selectedMetaAdAccountId = config.meta_ad_account_id?.trim();

  if (!selectedMetaAdAccountId) {
    throw new ApiError(400, "A Meta ad account selection is required.", "meta_account_missing");
  }

  const metaAccount = await getOwnedMetaAdAccount(supabase, organizationId, selectedMetaAdAccountId);

  if (!metaAccount) {
    throw new ApiError(400, "Selected Meta ad account could not be found.", "meta_account_missing");
  }

  const payload: Database["public"]["Tables"]["campaign_executions"]["Insert"] = {
    user_id: userId,
    campaign_id: campaignId,
    meta_connection_id: metaAccount.id,
    meta_ad_account_id: metaAccount.id,
    execution_status: "pending",
    launch_mode: "autopilot",
    objective: config.objective,
    destination_url: config.destination_url,
    budget_type: config.budget_type,
    daily_budget: config.daily_budget ?? null,
    lifetime_budget: config.lifetime_budget ?? null,
  };

  const { data, error } = await supabase
    .from("campaign_executions")
    .insert(payload as never)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ApiError(500, "Execution record could not be created.", "execution_create_failed");
  }

  return data as CampaignExecution;
}

export async function listExecutionsForCampaign(campaignId: string, userId: string) {
  const { supabase } = await requireExecutionContext(userId);

  const campaign = await getCampaignById(campaignId).catch(() => null);

  if (!campaign) {
    throw new ApiError(404, "Campaign not found.", "not_found");
  }

  let results: CampaignExecution[] = [];

  try {
    const { data } = await supabase
      .from("campaign_executions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    results = Array.isArray(data) ? (data as CampaignExecution[]) : [];
  } catch {
    results = [];
  }

  return results;
}

export async function getExecutionById(executionId: string): Promise<{
  execution: CampaignExecution;
  adSets: CampaignExecutionAdSet[];
  ads: CampaignExecutionAd[];
  logs: CampaignExecutionLog[];
} | null> {
  const { supabase, userId } = await requireExecutionContext();
  const { data: execution, error } = await supabase
    .from("campaign_executions")
    .select("*")
    .eq("id", executionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!execution) {
    return null;
  }

  const [adSetsResult, adsResult, logsResult] = await Promise.all([
    supabase
      .from("campaign_execution_ad_sets")
      .select("*")
      .eq("execution_id", executionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaign_execution_ads")
      .select("*")
      .eq("execution_id", executionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaign_execution_logs")
      .select("*")
      .eq("execution_id", executionId)
      .order("created_at", { ascending: true }),
  ]);
  const adSets = Array.isArray(adSetsResult.data)
    ? (adSetsResult.data as CampaignExecutionAdSet[])
    : [];
  const ads = Array.isArray(adsResult.data)
    ? (adsResult.data as CampaignExecutionAd[])
    : [];
  const logs = Array.isArray(logsResult.data)
    ? (logsResult.data as CampaignExecutionLog[])
    : [];

  return {
    execution: execution as CampaignExecution,
    adSets,
    ads,
    logs,
  };
}

export async function launchCampaignExecution(executionId: string): Promise<CampaignLaunchResult> {
  const { supabase, userId, organizationId } = await requireExecutionContext();
  const detail = await getExecutionById(executionId);

  if (!detail) {
    throw new ApiError(404, "Execution not found.", "not_found");
  }

  const execution = detail.execution;

  if (!execution.campaign_id) {
    throw new ApiError(400, "Execution is missing a campaign ID.", "campaign_id_missing");
  }
  const launchInput = mapLaunchConfigFromExecution(execution);

  await updateExecutionRecord(supabase, executionId, {
    execution_status: "validating",
    started_at: new Date().toISOString(),
    error_message: null,
  });
  await logExecutionInfo(supabase, executionId, "validation_started", "Launch validation started.");

  const validation = await validateCampaignForLaunch(execution.campaign_id, userId, launchInput);

  if (!validation.ok) {
    const validationErrors = validation.errors ?? ["Launch validation failed."];

    await logExecutionFailure(
      supabase,
      executionId,
      "validation_failed",
      "Launch validation failed.",
      { errors: validationErrors } as Json,
    );
    await updateExecutionRecord(supabase, executionId, {
      execution_status: "failed",
      error_message: validationErrors.join(" "),
      completed_at: new Date().toISOString(),
    });

    const failedDetail = await getExecutionById(executionId);

    if (!failedDetail) {
      throw new ApiError(500, "Execution detail could not be reloaded.", "execution_reload_failed");
    }

    return {
      execution: failedDetail.execution,
      adSets: failedDetail.adSets,
      ads: failedDetail.ads,
      logs: failedDetail.logs,
      metaCampaignId: failedDetail.execution.meta_campaign_external_id,
      validationErrors: validation.errors,
    };
  }

  await logExecutionSuccess(
    supabase,
    executionId,
    "validation_passed",
    "Campaign and launch config validated.",
  );

  const blueprint = validation.blueprint;
  const validatedCampaign = validation.campaign;
  const validatedConfig = validation.config;

  if (!validatedCampaign || !validatedConfig) {
    throw new ApiError(
      500,
      "Validated launch data is incomplete.",
      "launch_validation_incomplete",
    );
  }

  const blueprintName = blueprint?.name ?? validatedCampaign.campaign.name;

  const campaignPayload = buildMetaCampaignPayload(validatedCampaign, validatedConfig);
  const adSetPayloads = buildMetaAdSetPayloads(validatedCampaign, validatedConfig);
  const launchReadyMedia = await getLaunchReadyCreativeMedia(
    validatedCampaign.campaign.id,
    userId,
  ).catch(() => []);
  const adPayloads = buildMetaAdPayloads(
    validatedCampaign,
    validatedConfig,
    launchReadyMedia,
  );
  const metaPayload: MetaLaunchPayload = {
    campaign: campaignPayload as unknown as Record<string, Json | string | number | boolean | null>,
    adSets: adSetPayloads as unknown as Array<Record<string, Json | string | number | boolean | null>>,
    ads: adPayloads,
  };

  await logExecutionInfo(
    supabase,
    executionId,
    "campaign_payload_built",
    "Meta launch payloads built.",
    metaPayload as Json,
  );
  await logExecutionInfo(
    supabase,
    executionId,
    "creative_asset_state",
    launchReadyMedia.length > 0
      ? "Launch-ready creative media assets were attached where available."
      : "No launch-ready media assets available. Meta launch will continue with link-data creatives only.",
    {
      launchReadyMediaCount: launchReadyMedia.length,
    } as Json,
  );

  await updateExecutionRecord(supabase, executionId, {
    execution_status: "launching",
    objective: validatedConfig.objective,
    destination_url: validatedConfig.destinationUrl,
    budget_type: validatedConfig.budgetType,
    daily_budget: validatedConfig.dailyBudget,
    lifetime_budget: validatedConfig.lifetimeBudget,
  });

  if (!validatedConfig.metaAdAccountId) {
    throw new ApiError(
      500,
      "Validated launch config is missing a Meta ad account ID.",
      "launch_meta_account_missing",
    );
  }

  const metaAccount = (await getOwnedMetaAdAccount(
    supabase,
    organizationId,
    validatedConfig.metaAdAccountId,
  )) as MetaConnectionRecord | null;

  if (!metaAccount) {
    throw new ApiError(404, "Meta ad account could not be reloaded.", "meta_account_missing");
  }

  const createdAdSetIds: string[] = [];
  const createdAdIds: string[] = [];
  let createdCampaignId: string | null = null;
  const nonBlockingErrors: string[] = [];

  try {
    const createdCampaign = await createMetaCampaign({
      connection: metaAccount,
      payload: campaignPayload,
    });

    createdCampaignId = createdCampaign.id;

    await updateExecutionRecord(supabase, executionId, {
      meta_campaign_external_id: createdCampaign.id,
    });
    await logExecutionSuccess(
      supabase,
      executionId,
      "meta_campaign_created",
      "Meta campaign created.",
      { campaignId: createdCampaign.id, campaignName: blueprintName } as Json,
    );

    for (const adSetPayload of adSetPayloads) {
      const { data: adSetExecutionRaw, error: adSetInsertError } = await supabase
        .from("campaign_execution_ad_sets")
        .insert({
          execution_id: executionId,
          name: adSetPayload.name,
          audience_payload: adSetPayload.targeting as unknown as Json,
          budget_payload: {
            budget_type: validatedConfig.budgetType,
            daily_budget: validatedConfig.dailyBudget,
            lifetime_budget: validatedConfig.lifetimeBudget,
          } as unknown as Json,
          status: "creating",
        } as never)
        .select("*")
        .single();

      if (adSetInsertError || !adSetExecutionRaw) {
        throw adSetInsertError ?? new ApiError(500, "Ad set execution record could not be created.");
      }

      const adSetExecution = adSetExecutionRaw as CampaignExecutionAdSet;
      const createdAdSet = await createMetaAdSet({
        connection: metaAccount,
        campaignId: createdCampaign.id,
        payload: adSetPayload,
      });

      createdAdSetIds.push(createdAdSet.id);
      await updateExecutionAdSetRecord(supabase, adSetExecution.id, {
        meta_ad_set_external_id: createdAdSet.id,
        status: "created",
      });
      await logExecutionSuccess(
        supabase,
        executionId,
        "meta_ad_set_created",
        "Meta ad set created.",
        { adSetId: createdAdSet.id, name: adSetPayload.name } as Json,
      );

      for (const adPayload of adPayloads) {
        const { data: adExecutionRaw, error: adInsertError } = await supabase
          .from("campaign_execution_ads")
          .insert({
            execution_id: executionId,
            ad_set_execution_id: adSetExecution.id,
            creative_name: adPayload.creativePayload.name,
            headline: adPayload.asset.headline,
            primary_text: adPayload.asset.primaryText,
            cta: adPayload.asset.cta,
            destination_url: validatedConfig.destinationUrl,
            format: adPayload.asset.format,
            status: "creating",
            raw_payload: {
              creative: adPayload.creativePayload,
              ad: adPayload.adPayload,
              concept: adPayload.asset.concept,
              visual_direction: adPayload.asset.visualDirection,
            } as unknown as Json,
          } as never)
          .select("*")
          .single();

        if (adInsertError || !adExecutionRaw) {
          throw adInsertError ?? new ApiError(500, "Ad execution record could not be created.");
        }

        const adExecution = adExecutionRaw as CampaignExecutionAd;

        try {
          const creative = await createMetaCreative({
            connection: metaAccount,
            payload: adPayload.creativePayload,
          });
          await logExecutionSuccess(
            supabase,
            executionId,
            "meta_creative_created",
            "Meta creative created.",
            { creativeId: creative.id, creativeName: adPayload.creativePayload.name } as Json,
          );

          const ad = await createMetaAd({
            connection: metaAccount,
            adSetId: createdAdSet.id,
            creativeId: creative.id,
            payload: adPayload.adPayload,
          });

          createdAdIds.push(ad.id);

          await updateExecutionAdRecord(supabase, adExecution.id, {
            meta_ad_external_id: ad.id,
            status: "created",
            raw_payload: {
              creative: adPayload.creativePayload,
              ad: adPayload.adPayload,
              creative_id: creative.id,
            } as unknown as Json,
          });
          await logExecutionSuccess(
            supabase,
            executionId,
            "meta_ad_created",
            "Meta ad created.",
            { adId: ad.id, headline: adPayload.asset.headline } as Json,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Meta ad creation failed.";
          nonBlockingErrors.push(message);
          await updateExecutionAdRecord(supabase, adExecution.id, {
            status: "failed",
            raw_payload: {
              creative: adPayload.creativePayload,
              ad: adPayload.adPayload,
              error: message,
            } as unknown as Json,
          });
          await logExecutionFailure(
            supabase,
            executionId,
            "meta_ad_failed",
            message,
            { headline: adPayload.asset.headline } as Json,
          );
        }
      }
    }

    if (createdAdIds.length === 0) {
      throw new ApiError(
        502,
        "No Meta ads were created successfully. Launch was stopped.",
        "meta_ads_missing",
      );
    }

    const publishResult = await publishMetaCampaignIfNeeded({
      connection: metaAccount,
      startImmediately: false,
      campaignId: createdCampaign.id,
      adSetIds: createdAdSetIds,
      adIds: createdAdIds,
    });

    await logExecutionSuccess(
      supabase,
      executionId,
      "publish_completed",
      publishResult.published
        ? "Campaign objects were activated in Meta."
        : "Campaign objects were created in paused state.",
      publishResult as unknown as Json,
    );

    await updateExecutionRecord(supabase, executionId, {
      execution_status: nonBlockingErrors.length > 0 ? "partially_failed" : "launched",
      completed_at: new Date().toISOString(),
      error_message: nonBlockingErrors.length > 0 ? nonBlockingErrors.join(" ") : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign launch failed.";
    const terminalStatus =
      createdCampaignId || createdAdSetIds.length > 0 || createdAdIds.length > 0
        ? "partially_failed"
        : "failed";

    await logExecutionFailure(
      supabase,
      executionId,
      "launch_failed",
      message,
      {
        campaignId: createdCampaignId,
        adSetIds: createdAdSetIds,
        adIds: createdAdIds,
      } as Json,
    );
    await updateExecutionRecord(supabase, executionId, {
      execution_status: terminalStatus,
      meta_campaign_external_id: createdCampaignId,
      completed_at: new Date().toISOString(),
      error_message: message,
    });
  }

  const finalDetail = await getExecutionById(executionId);

  if (!finalDetail) {
    throw new ApiError(500, "Execution detail could not be loaded after launch.", "execution_reload_failed");
  }

  return {
    execution: finalDetail.execution,
    adSets: finalDetail.adSets,
    ads: finalDetail.ads,
    logs: finalDetail.logs,
    metaCampaignId: finalDetail.execution.meta_campaign_external_id,
    validationErrors: [],
  };
}

export async function executeFullAutopilotLaunch(
  campaignId: string,
  userId: string,
  config: CampaignLaunchInput,
) {
  const { supabase } = await requireExecutionContext(userId);
  const execution = await createCampaignExecutionRecord(campaignId, userId, config);
  await logExecutionInfo(
    supabase,
    execution.id,
    "execution_created",
    "Execution record created for autopilot launch.",
    {
      campaignId,
      metaAdAccountId: config.meta_ad_account_id,
      launchMode: "autopilot",
    } as Json,
  );
  return launchCampaignExecution(execution.id);
}
