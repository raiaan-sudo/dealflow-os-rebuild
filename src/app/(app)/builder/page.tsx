import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CampaignBuilderWorkspace } from "@/components/campaign/campaign-builder-workspace";
import { buildCampaignScopedPath, resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { getSelectedAdIdsFromPlan, readCampaignPlanDocument } from "@/lib/services/campaign-plan-document";
import { getAppContext } from "@/lib/services/app-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { getCampaignIntentLabel } from "@/lib/campaign-intent";
import {
  canCreateAdditionalCampaign,
  getCampaignLimitPolicy,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from "@/lib/billing/plans";
import { getBillingSummary } from "@/lib/services/billing-service";
import { listCampaignsForUser } from "@/lib/services/campaign-persistence";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { applyCreativeIntakeReviewContext } from "@/lib/services/campaign-review-context";
import type {
  BuiltCampaign,
  CampaignStrategyInput,
} from "@/lib/services/campaign-orchestrator";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { CreativeIdea, StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { FunnelType } from "@/lib/services/funnel-engine";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  getApprovedCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
  type CreativeIntakeGenerationContext,
} from "@/lib/services/creative-chat-intake-service";

async function loadPersistedReviewState(campaignId: string | null) {
  if (!campaignId) {
    return {
      selectedAdIds: [],
      creativeIntakeContext: null as CreativeIntakeGenerationContext | null,
    };
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return {
      selectedAdIds: [],
      creativeIntakeContext: null as CreativeIntakeGenerationContext | null,
    };
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  const row = (data as { plan?: unknown } | null) ?? null;
  const plan = readCampaignPlanDocument(row?.plan);

  return {
    selectedAdIds: getSelectedAdIdsFromPlan(plan),
    creativeIntakeContext: isCreativeChatIntakeEnabled()
      ? getApprovedCreativeIntakeGenerationContext(plan)
      : null,
  };
}

function buildInitialStrategyFromPlan(
  strategy?: CampaignStrategyInput | null,
  reviewPlan?: CampaignPlan | null,
): CampaignStrategyInput {
  if (reviewPlan) {
    return {
      location: reviewPlan.market,
      audience: reviewPlan.audience,
      offer: reviewPlan.keyOffer,
      price_point: strategy?.price_point ?? "",
      market_type: reviewPlan.intent,
      funnel_goal: "survey",
    };
  }

  if (!strategy) {
    return {
      location: "",
      audience: "",
      offer: "",
      price_point: "",
      market_type: "buyer",
      funnel_goal: "survey",
    };
  }

  return {
    location: strategy.location,
    audience: strategy.audience,
    offer: strategy.offer,
    price_point: strategy.price_point ?? "",
    market_type: strategy.market_type,
    funnel_goal: strategy.funnel_goal ?? "survey",
  };
}

function buildInitialCampaignFromRecord(
  record?: FullCampaignRecord | null,
  reviewPlan?: CampaignPlan | null,
): BuiltCampaign | null {
  if (!record) {
    return null;
  }

  const creativeItems = Array.isArray(record.creatives.items) ? record.creatives.items : [];
  const creatives: CreativeIdea[] =
    (record.creatives.ideas ?? []).length > 0
      ? (record.creatives.ideas ?? []).map((idea) => ({
          hook: idea.hook,
          angle:
            idea.angle === "pain" || idea.angle === "authority" || idea.angle === "curiosity"
              ? idea.angle
              : "opportunity",
          format:
            idea.format === "ugc" || idea.format === "montage"
              ? idea.format
              : "talking_head",
          concept: idea.concept,
          visual_direction: idea.visual_direction,
        }))
      : creativeItems.map((item) => ({
          hook: item.hook || item.overlayText || "",
          angle:
            item.angle === "pain" || item.angle === "authority" || item.angle === "curiosity"
              ? item.angle
              : "opportunity",
          format:
            item.format === "ugc" || item.format === "montage"
              ? item.format
              : "talking_head",
          concept: item.concept || item.title || "",
          visual_direction: item.visualDirection || item.imagePrompt || "",
        }));

  const copy =
    (record.creatives.copy ?? []).length > 0
      ? record.creatives.copy ?? []
      : creativeItems.map((item) => ({
          id: `${item.id}-copy`,
          campaign_id: record.campaign.id,
          hook: item.hook || item.overlayText || "",
          primary_text: item.primaryText || "",
          script: (item.scriptLines || []).join("\n"),
          headline: item.headline || item.title || "",
          cta: item.cta || "",
          created_at: record.campaign.updated_at ?? record.campaign.created_at,
        }));

  return {
    strategy: buildInitialStrategyFromPlan(record.strategy, reviewPlan),
    items: creativeItems,
    creatives,
    copy,
    funnel: {
      funnel_type: record.funnel.funnel_type as FunnelType,
      headline: reviewPlan?.funnel.headline ?? record.funnel.headline,
      subheadline: reviewPlan?.funnel.subheadline ?? record.funnel.subheadline,
      cta: reviewPlan?.funnel.cta ?? record.funnel.cta,
      sections: reviewPlan?.funnel.sections ?? record.funnel.sections ?? [],
      form_fields: record.funnel.form_fields ?? [],
      follow_up_action: record.funnel.follow_up_action,
      optimization_notes: record.funnel.optimization_notes ?? [],
    },
  };
}

function getBuilderNextAction(plan: CampaignPlan, campaignId: string, hasSelectedCreativeSet: boolean) {
  const scoped = (path: string) => buildCampaignScopedPath(path, campaignId);

  if (plan.runtime.metaPushStatus === "published" || plan.runtime.status === "live") {
    return {
      label: "View results",
      href: scoped("/dashboard"),
      detail: "Campaign is live. Watch spend, leads, and the next required action.",
    };
  }

  if (plan.runtime.status === "launch_ready" || plan.runtime.status === "connected") {
    return {
      label: "Go live",
      href: scoped("/launch"),
      detail: "Review billing, Meta, creative, and budget gates before launch.",
    };
  }

  if (plan.runtime.status === "launching") {
    return {
      label: "Check launch",
      href: scoped("/launching"),
      detail: "Launch is in progress. Check the saved launch state before taking action.",
    };
  }

  if (plan.runtime.status === "built" || plan.runtime.status === "preview") {
    if (!hasSelectedCreativeSet) {
      return {
        label: "Choose creatives",
        href: scoped("/build/creatives"),
        detail: "Pick the recommended creative test set. Then the final review opens before launch.",
      };
    }

    return {
      label: "Continue review",
      href: scoped("/preview"),
      detail: "Approve the funnel and selected creative before going live.",
    };
  }

  return {
    label: "Edit funnel draft",
    href: scoped("/builder?mode=edit"),
    detail: "Edit the saved campaign draft, then return to review.",
  };
}

function getBuiltItems(record: FullCampaignRecord) {
  const staticAdCount = record.creatives.staticAds.length;
  const videoAdCount = record.creatives.videoAds.length;
  const selectedFunnel = record.funnel.headline ? "Funnel built" : "Funnel needed";

  return [
    selectedFunnel,
    `${staticAdCount} static creative${staticAdCount === 1 ? "" : "s"}`,
    `${videoAdCount} video concept${videoAdCount === 1 ? "" : "s"}`,
    record.publish.state === "published" ? "Funnel published" : "Funnel not published",
  ];
}

function ActiveCampaignWorkspace({
  record,
  campaignCount,
  planTier,
  billingLaunchOverride,
  hasSelectedCreativeSet,
}: {
  record: FullCampaignRecord;
  campaignCount: number;
  planTier: BillingPlanTier;
  billingLaunchOverride: boolean;
  hasSelectedCreativeSet: boolean;
}) {
  const plan = canonicalCampaignToPlan(record);
  const campaignId = record.campaign.id;
  const nextAction = getBuilderNextAction(plan, campaignId, hasSelectedCreativeSet);
  const limitPolicy = getCampaignLimitPolicy(planTier);
  const billingOverride = billingLaunchOverride;
  const canCreateAnother =
    billingOverride ||
    canCreateAdditionalCampaign({
      planTier,
      activeCampaignCount: campaignCount,
    });
  const statusLabel =
    plan.runtime.metaPushStatus === "published" || plan.runtime.status === "live"
      ? "Live"
      : plan.runtime.status === "launch_ready" || plan.runtime.status === "connected"
        ? "Ready"
        : plan.runtime.status === "built" || plan.runtime.status === "preview"
          ? "In review"
          : "Build needed";
  const builtItems = getBuiltItems(record);
  const activeCampaignCopy = `${campaignCount} active campaign${campaignCount === 1 ? "" : "s"}`;
  const hasUnlimitedCampaignSlots = billingOverride || limitPolicy.includedActiveCampaigns === null;
  const campaignSlotCopy =
    hasUnlimitedCampaignSlots
      ? `${campaignCount} active, unlimited included`
      : `${campaignCount} of ${limitPolicy.includedActiveCampaigns} active`;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4">
      <PageHeader
        eyebrow="Build"
        title="Active campaign workspace"
        description="Your current campaign stays central. Review what is built, see what is blocked, then take the next step."
        guidance={`You have ${activeCampaignCopy}. Launch another only after the current campaign is handled or your plan has another slot.`}
        action={
          <Button asChild size="lg">
            <Link href={nextAction.href}>{nextAction.label}</Link>
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <section className="min-w-0 border-b border-white/8 p-5 sm:p-6 xl:border-b-0 xl:border-r">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={statusLabel === "Live" ? "success" : statusLabel === "Build needed" ? "warning" : "info"}>
                    {statusLabel}
                  </StatusPill>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {getCampaignIntentLabel(plan.intent)}
                  </span>
                </div>
                <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                  {plan.businessName || record.campaign.name}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {nextAction.detail}
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href={`/builder?campaignId=${encodeURIComponent(campaignId)}&mode=edit`}>
                  Edit funnel draft
                </Link>
              </Button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                { label: "Market", value: plan.market || "Not set" },
                { label: "Audience", value: plan.audience || "Not set" },
                { label: "Offer", value: plan.offerSummary || plan.keyOffer || "Not set" },
                {
                  label: "Daily ad spend",
                  value: `$${(plan.runtime.budgetDailyInput ?? Number((plan.monthlyBudget / 30).toFixed(2))).toLocaleString("en-US", { maximumFractionDigits: 2 })}/day`,
                },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-foreground">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {builtItems.map((item) => (
                <div key={item} className="rounded-[16px] border border-emerald-300/15 bg-emerald-300/[0.055] px-4 py-3 text-sm font-medium text-emerald-50">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <aside className="min-w-0 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Campaign slots
            </p>
            <p className="mt-3 text-lg font-semibold">
              {campaignSlotCopy}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {billingOverride
                ? "Billing override includes additional QA campaign slots without opening checkout."
                : planTier === "starter"
                ? "Starter keeps one guided campaign active so the launch path stays focused."
                : "Pro includes unlimited campaign slots. The current campaign remains the primary workspace."}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {canCreateAnother ? (
                <Button asChild variant="secondary">
                  <Link href="/onboarding?new=1">Launch another campaign</Link>
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <Link href="/paywall">Upgrade for another campaign</Link>
                </Button>
              )}
              <div className="rounded-[18px] border border-cyan-300/15 bg-cyan-300/[0.055] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                  Current next step
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{nextAction.label}</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              New campaigns are secondary. Your active campaign stays first until it is reviewed, launched, or measured.
            </p>
          </aside>
        </div>
      </Card>
    </div>
  );
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedCampaignId =
    resolvedSearchParams && typeof resolvedSearchParams.campaignId === "string"
      ? resolvedSearchParams.campaignId
      : null;
  const context = await getAppContext();

  if (!context) {
    redirect("/login?redirectedFrom=%2Fbuilder&reason=expired");
  }

  const resolvedCampaign = await resolveActiveCampaignRecord(requestedCampaignId).catch(() => null);
  const record = resolvedCampaign?.record ?? null;

  if (!record) {
    redirect("/onboarding");
  }

  const tabParam =
    resolvedSearchParams && typeof resolvedSearchParams.tab === "string"
      ? resolvedSearchParams.tab
      : "setup";
  const modeParam =
    resolvedSearchParams && typeof resolvedSearchParams.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const wantsNewCampaign = resolvedSearchParams?.new === "1";
  const wantsEditMode = modeParam === "edit";

  if (wantsNewCampaign) {
    redirect("/onboarding?new=1");
  }

  const [campaigns, billing] = await Promise.all([
    listCampaignsForUser().catch(() => []),
    getBillingSummary().catch(() => null),
  ]);
  const reviewState = await loadPersistedReviewState(record.campaign.id).catch(() => ({
    selectedAdIds: [],
    creativeIntakeContext: null as CreativeIntakeGenerationContext | null,
  }));
  const planTier = normalizeBillingPlanTier(
    billing?.planTier ?? context.organization.plan_tier ?? "starter",
  );
  const campaignCount = Math.max(campaigns.length, record ? 1 : 0);
  const canCreateAnother =
    billing?.launchOverride === true ||
    canCreateAdditionalCampaign({
      planTier,
      activeCampaignCount: campaignCount,
    });

  if (record && !wantsEditMode && (!wantsNewCampaign || !canCreateAnother)) {
    return (
      <ActiveCampaignWorkspace
        record={record}
        campaignCount={campaignCount}
        planTier={planTier}
        billingLaunchOverride={billing?.launchOverride === true}
        hasSelectedCreativeSet={reviewState.selectedAdIds.length > 0}
      />
    );
  }

  const initialTab =
    tabParam === "funnel" || tabParam === "creatives"
      ? tabParam
      : wantsNewCampaign
        ? "setup"
        : record?.campaign.id
        ? "funnel"
        : "setup";
  const setupRecord = wantsNewCampaign ? null : record;
  const reviewPlan =
    setupRecord
      ? applyCreativeIntakeReviewContext(canonicalCampaignToPlan(setupRecord), reviewState.creativeIntakeContext)
      : null;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5">
      <PageHeader
        eyebrow="Build"
        title={wantsNewCampaign ? "Launch another campaign" : "Edit campaign"}
        description={wantsNewCampaign ? "Start a new campaign slot without changing the current active campaign." : "Adjust the active campaign details, then return to review."}
        guidance={wantsNewCampaign ? "New campaigns are secondary to the active launch path." : "Keep edits focused on what blocks review or launch."}
      />
      {!wantsNewCampaign && setupRecord ? (
        <Card className="border-amber-300/20 bg-amber-300/[0.07] p-4">
          <p className="text-sm font-semibold text-amber-100">You are editing a draft.</p>
          <p className="mt-1 text-sm leading-6 text-amber-100/78">
            Saved launch package is unchanged until you save. Use Continue review to inspect the approved funnel and selected creative set.
          </p>
        </Card>
      ) : null}
      <CampaignBuilderWorkspace
        key={setupRecord?.campaign.id ?? "new-campaign"}
        initialStrategy={buildInitialStrategyFromPlan(setupRecord?.strategy, reviewPlan)}
        initialTab={initialTab}
        initialCampaignId={setupRecord?.campaign.id ?? null}
        initialCampaign={buildInitialCampaignFromRecord(setupRecord, reviewPlan)}
        initialStaticAds={(setupRecord?.creatives.staticAds ?? []) as StaticCreativeAsset[]}
        initialCreativeStrategy={setupRecord?.plan.creative_strategy ?? null}
        initialCampaignName={setupRecord?.campaign.name ?? null}
        initialSaved={Boolean(setupRecord?.campaign.id)}
      />
    </div>
  );
}
