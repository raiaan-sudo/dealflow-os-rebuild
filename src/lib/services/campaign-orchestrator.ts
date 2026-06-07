import type { CampaignIntent } from "@/lib/campaign-intent";
import {
  buildCreativeSystem,
  type CanonicalCreativeItem,
  type CreativeIdea,
} from "@/lib/services/creative-engine";
import { normalizeCampaignText } from "@/lib/copy/input-normalization";
import type { AdCopyOutput } from "@/lib/services/copy-engine";
import { generateFunnel, type FunnelBlueprint } from "@/lib/services/funnel-engine";

export type CampaignStrategyInput = {
  location: string;
  audience: string;
  offer: string;
  price_point?: string;
  market_type?: CampaignIntent;
  funnel_goal?: "lead_form" | "survey" | "book_call";
  language_code?: string;
};

export type BuiltCampaign = {
  strategy: CampaignStrategyInput;
  items: CanonicalCreativeItem[];
  creatives: CreativeIdea[];
  copy: AdCopyOutput[];
  funnel: FunnelBlueprint;
};

function normalizeStrategy(input?: CampaignStrategyInput | null): CampaignStrategyInput {
  const {
    location = "",
    audience = "",
    offer = "",
    price_point = "",
    market_type = "buyer",
    funnel_goal = "survey",
  } = input || {};

  return {
    location: normalizeCampaignText({ field: "location", value: (location ?? "").toString() }),
    audience: normalizeCampaignText({ field: "audience", value: (audience ?? "").toString() }),
    offer: normalizeCampaignText({ field: "offer", value: (offer ?? "").toString() }),
    price_point: normalizeCampaignText({ field: "price_point", value: (price_point ?? "").toString() }) || undefined,
    market_type: market_type ?? "buyer",
    funnel_goal: funnel_goal ?? "survey",
  };
}

export function buildCampaign(input?: CampaignStrategyInput | null): BuiltCampaign {
  const strategy = normalizeStrategy(input);
  const creativeSystem = buildCreativeSystem(strategy);
  const items = (creativeSystem.items || []).filter(Boolean);
  const creatives = items.map((item) => ({
    hook: item?.hook || item?.overlayText || "",
    angle: (
      item?.angle === "opportunity" || item?.angle === "guarantee" || item?.angle === "urgency"
        ? "opportunity"
        : item?.angle === "contrarian"
          ? "pain"
          : item?.angle === "authority"
            ? "authority"
            : "curiosity"
    ) as CreativeIdea["angle"],
    format: item?.format || "ugc",
    concept: item?.concept || item?.title || "",
    visual_direction: item?.visualDirection || item?.imagePrompt || "",
  }));
  const copy = items.map((item) => ({
    hook: item?.hook || "",
    primary_text: item?.primaryText || "",
    script: (item?.scriptLines || []).join("\n"),
    headline: item?.headline || item?.title || "",
    cta: item?.cta || "",
  }));
  const funnel = generateFunnel(strategy);

  return {
    strategy,
    items,
    creatives: Array.isArray(creatives) ? creatives : [],
    copy: Array.isArray(copy)
      ? copy.filter(Boolean).map((item) => ({
          hook: item?.hook || "",
          primary_text: item?.primary_text || "",
          script: item?.script || "",
          headline: item?.headline || "",
          cta: item?.cta || "",
        }))
      : [],
    funnel: {
      funnel_type: funnel?.funnel_type || "landing_page_survey",
      headline: funnel?.headline || "",
      subheadline: funnel?.subheadline || "",
      cta: funnel?.cta || "",
      sections: Array.isArray(funnel?.sections) ? funnel.sections : [],
      form_fields: Array.isArray(funnel?.form_fields) ? funnel.form_fields : [],
      follow_up_action: funnel?.follow_up_action || "",
      optimization_notes: Array.isArray(funnel?.optimization_notes) ? funnel.optimization_notes : [],
    },
  };
}
