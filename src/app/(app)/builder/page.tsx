import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CampaignBuilderWorkspace } from "@/components/campaign/campaign-builder-workspace";
import {
  buildCampaignScopedPath,
  getPaywallAccessState,
  requirePreviewCompletion,
  resolveActiveCampaignRecord,
} from "@/lib/paywall-access";
import { isAuthBypassEnabled } from "@/lib/env";
import { getAppContext } from "@/lib/services/app-context";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  BuiltCampaign,
  CampaignStrategyInput,
} from "@/lib/services/campaign-orchestrator";
import type { CreativeIdea, StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { FunnelType } from "@/lib/services/funnel-engine";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

function buildInitialStrategyFromPlan(
  strategy?: CampaignStrategyInput | null,
): CampaignStrategyInput {
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

function buildInitialCampaignFromRecord(record?: FullCampaignRecord | null): BuiltCampaign | null {
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
    strategy: buildInitialStrategyFromPlan(record.strategy),
    items: creativeItems,
    creatives,
    copy,
    funnel: {
      funnel_type: record.funnel.funnel_type as FunnelType,
      headline: record.funnel.headline,
      subheadline: record.funnel.subheadline,
      cta: record.funnel.cta,
      sections: record.funnel.sections ?? [],
      form_fields: record.funnel.form_fields ?? [],
      follow_up_action: record.funnel.follow_up_action,
      optimization_notes: record.funnel.optimization_notes ?? [],
    },
  };
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedCampaignId =
    resolvedSearchParams && typeof resolvedSearchParams.campaignId === "string"
      ? resolvedSearchParams.campaignId
      : null;
  const context = await getAppContext();

  if (!context) {
    if (isAuthBypassEnabled()) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Setup"
            title="Build your campaign"
            description="Auth bypass is on (BYPASS_AUTH). Sign in to load the builder with a real workspace."
          />
          <EmptyState
            title="No workspace session"
            description="Turn off BYPASS_AUTH or open /login, then return to the builder."
          />
        </div>
      );
    }
    redirect("/login?redirectedFrom=%2Fbuilder&reason=expired");
  }

  const access = await requirePreviewCompletion(requestedCampaignId);
  const resolvedCampaign = await resolveActiveCampaignRecord(
    requestedCampaignId ?? access.activeCampaignId,
  ).catch(() => null);
  const record = resolvedCampaign?.record ?? null;

  if (!record && !access.activeCampaignId && !requestedCampaignId) {
    redirect("/dashboard");
  }

  const tabParam =
    resolvedSearchParams && typeof resolvedSearchParams.tab === "string"
      ? resolvedSearchParams.tab
      : "setup";
  const initialTab =
    tabParam === "funnel" || tabParam === "creatives"
      ? tabParam
      : record?.campaign.id
        ? "funnel"
        : "setup";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Build your campaign"
        description="Enter the essentials, build the campaign, and move to preview when the plan looks right."
        guidance="Use the left side to shape the campaign. The right side stays in sync so you can see the launch package as it forms."
      />
      <CampaignBuilderWorkspace
        initialStrategy={buildInitialStrategyFromPlan(record?.strategy)}
        initialTab={initialTab}
        initialCampaignId={record?.campaign.id ?? null}
        initialCampaign={buildInitialCampaignFromRecord(record)}
        initialStaticAds={(record?.creatives.staticAds ?? []) as StaticCreativeAsset[]}
        initialCreativeStrategy={record?.plan.creative_strategy ?? null}
        initialCampaignName={record?.campaign.name ?? null}
        initialSaved={Boolean(record?.campaign.id)}
      />
    </div>
  );
}
