import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { inferCampaignIntent } from "@/lib/campaign-intent";
import { ACTIVE_CAMPAIGN_COOKIE } from "@/lib/paywall-access";
import { buildCampaign } from "@/lib/services/campaign-orchestrator";
import type { CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import { normalizeCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { listCampaignsForUser, saveCampaign } from "@/lib/services/campaign-persistence";
import type { FunnelBlueprint } from "@/lib/services/funnel-engine";
import { advancedFunnelSchema, advancedFunnelSectionSchema } from "@/lib/schemas/api";

const strategySchema = z.object({
  location: z.string(),
  audience: z.string(),
  offer: z.string(),
  price_point: z.string().optional(),
  market_type: z.enum(["buyer", "seller", "investor", "approval", "refinance", "other"]).optional(),
  funnel_goal: z.enum(["lead_form", "survey", "book_call"]).optional(),
});

const creativeSchema = z.object({
  hook: z.string(),
  angle: z.enum(["opportunity", "pain", "authority", "curiosity"]),
  format: z.enum(["talking_head", "ugc", "montage"]),
  concept: z.string(),
  visual_direction: z.string(),
});

const copySchema = z.object({
  hook: z.string(),
  primary_text: z.string(),
  script: z.string(),
  headline: z.string(),
  cta: z.string(),
});

const creativeItemSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["static", "video"]).optional(),
  angle: z.string().optional(),
  format: z.enum(["talking_head", "ugc", "montage"]).optional(),
  title: z.string().optional(),
  hook: z.string().optional(),
  overlayText: z.string().optional(),
  primaryText: z.string().optional(),
  headline: z.string().optional(),
  cta: z.string().optional(),
  score: z.number().optional(),
  recommended: z.boolean().optional(),
  concept: z.string().optional(),
  visualDirection: z.string().optional(),
  imagePrompt: z.string().optional(),
  scriptLines: z.array(z.string()).optional(),
  sceneDescriptions: z.array(z.string()).optional(),
  onScreenText: z.array(z.string()).optional(),
  assetRefs: z.object({
    imageUrl: z.string().nullable().optional(),
    videoUrl: z.string().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    voiceUrl: z.string().nullable().optional(),
  }).optional(),
}).partial();

const funnelSectionSchema = advancedFunnelSectionSchema;
const funnelSchema = advancedFunnelSchema;

const saveCampaignSchema = z.object({
  campaignId: z.string().optional(),
  name: z.string().optional(),
  location: z.string().optional(),
  audience: z.string().optional(),
  offer: z.string().optional(),
  price_point: z.string().optional(),
  market_type: z.enum(["buyer", "seller", "investor", "approval", "refinance", "other"]).optional(),
  funnel_goal: z.enum(["lead_form", "survey", "book_call"]).optional(),
  plan: z.object({
    intent: z.string().optional(),
    market: z.string().optional(),
    audience: z.string().optional(),
    creative_strategy: z.object({
      campaignCategory: z.enum(["buyer", "seller", "investor", "precon", "luxury"]).optional(),
      triggerCondition: z.string().optional(),
      internalTension: z.string().optional(),
      mechanism: z.string().optional(),
      proofStyle: z.string().optional(),
      ctaStyle: z.string().optional(),
      visualLogic: z.array(z.string()).optional(),
      overlayStyle: z.array(z.string()).optional(),
      complianceNotes: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
  funnel: funnelSchema.partial().optional(),
  creatives: z.array(creativeSchema.partial()).optional(),
  campaign: z.object({
    strategy: strategySchema.partial(),
    items: z.array(creativeItemSchema).optional(),
    creatives: z.array(creativeSchema.partial()).optional(),
    copy: z.array(copySchema.partial()).optional(),
    funnel: funnelSchema.partial().optional(),
  }).partial().optional(),
}).passthrough();

function normalizeCampaignPayload(body: z.infer<typeof saveCampaignSchema>) {
  const strategy: CampaignStrategyInput = {
    location: body.campaign?.strategy?.location ?? body.location ?? "",
    audience: body.campaign?.strategy?.audience ?? body.audience ?? "",
    offer: body.campaign?.strategy?.offer ?? body.offer ?? "",
    price_point: body.campaign?.strategy?.price_point ?? body.price_point ?? "",
    market_type: inferCampaignIntent({
      intent: body.campaign?.strategy?.market_type ?? body.market_type ?? body.plan?.intent,
      marketType: body.campaign?.strategy?.market_type ?? body.market_type ?? body.plan?.intent,
      offer: body.campaign?.strategy?.offer ?? body.offer,
      audience: body.campaign?.strategy?.audience ?? body.audience ?? body.plan?.audience,
    }),
    funnel_goal: body.campaign?.strategy?.funnel_goal ?? body.funnel_goal ?? "survey",
  };

  const built = buildCampaign(strategy);
  const items = Array.isArray(body.campaign?.items)
    ? body.campaign.items.map((item, index) => ({
        id: item.id ?? `creative-item-${index}`,
        kind: item.kind ?? "static",
        angle: item.angle ?? "opportunity",
        format: item.format ?? "ugc",
        title: item.title ?? item.headline ?? `Creative ${index + 1}`,
        hook: item.hook ?? item.overlayText ?? "",
        overlayText: item.overlayText ?? item.hook ?? "",
        primaryText: item.primaryText ?? "",
        headline: item.headline ?? item.title ?? "",
        cta: item.cta ?? "Book My Strategy Call",
        score: item.score ?? 0,
        recommended: item.recommended ?? index === 0,
        concept: item.concept ?? "",
        visualDirection: item.visualDirection ?? "",
        imagePrompt: item.imagePrompt ?? "",
        scriptLines: item.scriptLines ?? [],
        sceneDescriptions: item.sceneDescriptions ?? [],
        onScreenText: item.onScreenText ?? [],
        assetRefs: {
          imageUrl: item.assetRefs?.imageUrl ?? null,
          videoUrl: item.assetRefs?.videoUrl ?? null,
          thumbnailUrl: item.assetRefs?.thumbnailUrl ?? null,
          voiceUrl: item.assetRefs?.voiceUrl ?? null,
        },
      }))
    : built.items;
  const normalizedSections: FunnelBlueprint["sections"] = (
    body.campaign?.funnel?.sections ??
    body.funnel?.sections ??
    built.funnel.sections
  ).map((section, index) => ({
    id: section.id ?? `${section.type}-${index + 1}`,
    type: section.type,
    variant: section.variant ?? "default",
    title: section.title,
    content: section.content,
    visible: section.visible ?? true,
    style: {
      spacing: section.style?.spacing ?? "comfortable",
      width: section.style?.width ?? "full",
      align: section.style?.align ?? "left",
      theme: section.style?.theme ?? "light",
    },
    media: section.media
      ? {
          kind: section.media.kind ?? "image",
          url: section.media.url,
          assetId: section.media.assetId,
          label: section.media.label,
          caption: section.media.caption,
          thumbnailAssetId: section.media.thumbnailAssetId,
          thumbnailUrl: section.media.thumbnailUrl,
        }
      : null,
  }));

  return {
    campaignId: body.campaignId,
    name: body.name || `${strategy.location || "Untitled"} ${strategy.offer || "Campaign"}`.trim() || "Untitled Campaign",
    campaign: {
      ...built,
      items,
      strategy: built.strategy,
      creatives: Array.isArray(body.campaign?.creatives)
        ? body.campaign.creatives.map((creative, index) => ({
            hook: creative.hook ?? built.creatives[index]?.hook ?? "",
            angle: creative.angle ?? built.creatives[index]?.angle ?? "opportunity",
            format: creative.format ?? built.creatives[index]?.format ?? "talking_head",
            concept: creative.concept ?? built.creatives[index]?.concept ?? "",
            visual_direction: creative.visual_direction ?? built.creatives[index]?.visual_direction ?? "",
          }))
        : built.creatives,
      copy: Array.isArray(body.campaign?.copy)
        ? body.campaign.copy.map((item, index) => ({
            hook: item.hook ?? built.copy[index]?.hook ?? "",
            primary_text: item.primary_text ?? built.copy[index]?.primary_text ?? "",
            script: item.script ?? built.copy[index]?.script ?? "",
            headline: item.headline ?? built.copy[index]?.headline ?? "",
            cta: item.cta ?? built.copy[index]?.cta ?? "",
          }))
        : built.copy,
      funnel: {
        ...built.funnel,
        ...body.funnel,
        ...body.campaign?.funnel,
        headline: body.campaign?.funnel?.headline ?? body.funnel?.headline ?? built.funnel.headline,
        subheadline: body.campaign?.funnel?.subheadline ?? body.funnel?.subheadline ?? built.funnel.subheadline,
        cta: body.campaign?.funnel?.cta ?? body.funnel?.cta ?? built.funnel.cta,
        sections: normalizedSections,
        form_fields: body.campaign?.funnel?.form_fields ?? body.funnel?.form_fields ?? built.funnel.form_fields,
        follow_up_action: body.campaign?.funnel?.follow_up_action ?? body.funnel?.follow_up_action ?? built.funnel.follow_up_action,
        optimization_notes: body.campaign?.funnel?.optimization_notes ?? body.funnel?.optimization_notes ?? built.funnel.optimization_notes,
      },
    },
    plan: {
      intent: inferCampaignIntent({
        intent: body.plan?.intent ?? strategy.market_type,
        marketType: strategy.market_type,
        offer: strategy.offer,
        audience: strategy.audience,
      }),
      market: body.plan?.market ?? strategy.location ?? "",
      audience: body.plan?.audience ?? strategy.audience ?? "",
      offer: strategy.offer ?? "",
      creative_strategy: body.plan?.creative_strategy
        ? normalizeCreativeStrategy(body.plan.creative_strategy, {
            intent: strategy.market_type ?? "buyer",
            audience: strategy.audience,
            propertyType: "",
            keyOffer: strategy.offer,
            mechanism: body.plan.creative_strategy.mechanism ?? "",
            primaryGoal: body.plan?.market ?? strategy.location ?? "",
            painPoints: body.plan.creative_strategy.internalTension
              ? [body.plan.creative_strategy.internalTension]
              : [],
          })
        : undefined,
    },
    funnel: {
      ...built.funnel,
      ...body.funnel,
      ...body.campaign?.funnel,
      sections: normalizedSections,
    },
    creatives: Array.isArray(body.campaign?.creatives) ? body.campaign.creatives : built.creatives,
    copy: Array.isArray(body.campaign?.copy) ? body.campaign.copy : built.copy,
  };
}

export async function GET() {
  try {
    return apiSuccess(await listCampaignsForUser());
  } catch (error) {
    return handleApiError(error, "Campaign list");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, saveCampaignSchema);

    if (!body || Object.keys(body).length === 0) {
      throw new ApiError(400, "Campaign body is required.", "validation_error");
    }

    const normalizedPayload = normalizeCampaignPayload(body);
    const savedCampaign = await saveCampaign(normalizedPayload);
    const response = apiSuccess(savedCampaign, { status: 200 });

    if (typeof savedCampaign.campaignId === "string" && savedCampaign.campaignId.length > 0) {
      response.cookies.set(ACTIVE_CAMPAIGN_COOKIE, savedCampaign.campaignId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    return handleApiError(error, "Campaign save");
  }
}
