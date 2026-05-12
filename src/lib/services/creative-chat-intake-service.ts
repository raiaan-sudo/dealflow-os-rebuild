import { z } from "zod";
import type { Json } from "@/lib/supabase/types";
import {
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
  type CampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { CampaignIntent } from "@/lib/campaign-intent";

export const CREATIVE_CHAT_INTAKE_VERSION = 1;
export const CREATIVE_CHAT_INTAKE_PLAN_KEY = "creative_chat_intake";

export type CreativeIntakeTargetAudience =
  | "sellers"
  | "buyers"
  | "first_time_buyers"
  | "investors"
  | "expired_listings"
  | "custom";

export type CreativeIntakeOffer =
  | "free_home_valuation"
  | "buyer_consultation"
  | "credit_preapproval_help"
  | "listing_consultation"
  | "custom";

export type CreativeIntakeBrand =
  | "remax"
  | "royal_lepage"
  | "exp"
  | "keller_williams"
  | "custom";

export type CreativeIntakeStyle =
  | "ugc"
  | "bold_poster_ad"
  | "luxury"
  | "local_expert"
  | "simple_direct_response";

export type CreativeIntakeApprovalStatus = "draft" | "approved" | "revision_requested";

export type CreativeIntakeAnswers = {
  targetAudience?: CreativeIntakeTargetAudience;
  customAudience?: string | null;
  offer?: CreativeIntakeOffer;
  customOffer?: string | null;
  brokerageBrand?: CreativeIntakeBrand;
  customBrokerageBrand?: string | null;
  market?: string | null;
  creativeStyle?: CreativeIntakeStyle;
  constraints?: string | null;
  cta?: string | null;
  platformPlacement?: string | null;
  propertyType?: string | null;
};

export type CreativeIntakeBrief = {
  targetAudience: string;
  offer: string;
  market: string;
  brokerageBrand: string;
  propertyType: string;
  creativeStyle: string;
  platformPlacement: string;
  cta: string;
  mustUseCopy: string[];
  complianceNotes: string[];
  softenedClaims: string[];
  completion: {
    complete: boolean;
    missing: string[];
  };
};

export type CreativeIntakePromptVersion = {
  revisionNumber: number;
  generatedPrompt: string;
  negativePrompt: string;
  sanitizedPreview: string;
  createdAt: string;
};

export type CreativeIntakeMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  createdAt: string;
};

export type CreativeIntakeRevisionSnapshot = {
  revisionNumber: number;
  approvalStatus: CreativeIntakeApprovalStatus;
  brief: CreativeIntakeBrief | null;
  promptVersion: CreativeIntakePromptVersion | null;
  createdAt: string;
  approvedAt?: string | null;
};

export type CreativeChatIntakeState = {
  version: number;
  conversationId: string;
  campaignId: string;
  approvalStatus: CreativeIntakeApprovalStatus;
  revisionNumber: number;
  answers: CreativeIntakeAnswers;
  brief: CreativeIntakeBrief | null;
  promptVersion: CreativeIntakePromptVersion | null;
  messages: CreativeIntakeMessage[];
  previousRevisions?: CreativeIntakeRevisionSnapshot[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
};

export type CreativeIntakeCampaignDefaults = {
  campaignId: string;
  market?: string | null;
  audience?: string | null;
  offer?: string | null;
  propertyType?: string | null;
  campaignType?: CampaignIntent | string | null;
  cta?: string | null;
  brand?: string | null;
};

const targetAudienceLabels: Record<CreativeIntakeTargetAudience, string> = {
  sellers: "Sellers",
  buyers: "Buyers",
  first_time_buyers: "First-time buyers",
  investors: "Investors",
  expired_listings: "Expired listings",
  custom: "Custom audience",
};

const offerLabels: Record<CreativeIntakeOffer, string> = {
  free_home_valuation: "Free home valuation",
  buyer_consultation: "Buyer consultation",
  credit_preapproval_help: "Credit or pre-approval help",
  listing_consultation: "Listing consultation",
  custom: "Custom offer",
};

const brandLabels: Record<CreativeIntakeBrand, string> = {
  remax: "RE/MAX",
  royal_lepage: "Royal LePage",
  exp: "eXp",
  keller_williams: "Keller Williams",
  custom: "Custom brokerage brand",
};

const styleLabels: Record<CreativeIntakeStyle, string> = {
  ugc: "UGC native social",
  bold_poster_ad: "Bold direct-response layout composed by DealFlow",
  luxury: "Luxury real estate",
  local_expert: "Local expert",
  simple_direct_response: "Simple direct-response",
};

export const creativeIntakeAnswersSchema = z.object({
  targetAudience: z.enum(["sellers", "buyers", "first_time_buyers", "investors", "expired_listings", "custom"]).optional(),
  customAudience: z.string().max(220).nullable().optional(),
  offer: z.enum(["free_home_valuation", "buyer_consultation", "credit_preapproval_help", "listing_consultation", "custom"]).optional(),
  customOffer: z.string().max(260).nullable().optional(),
  brokerageBrand: z.enum(["remax", "royal_lepage", "exp", "keller_williams", "custom"]).optional(),
  customBrokerageBrand: z.string().max(160).nullable().optional(),
  market: z.string().max(160).nullable().optional(),
  creativeStyle: z.enum(["ugc", "bold_poster_ad", "luxury", "local_expert", "simple_direct_response"]).optional(),
  constraints: z.string().max(800).nullable().optional(),
  cta: z.string().max(80).nullable().optional(),
  platformPlacement: z.string().max(120).nullable().optional(),
  propertyType: z.string().max(160).nullable().optional(),
});

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function nowIso() {
  return new Date().toISOString();
}

function messageId() {
  return crypto.randomUUID();
}

export function isCreativeChatIntakeEnabled() {
  return (
    process.env.CREATIVE_CHAT_INTAKE_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_CREATIVE_CHAT_INTAKE === "true"
  );
}

function resolveAnswerLabel<T extends string>(
  value: T | undefined,
  labels: Record<T, string>,
  customValue?: string | null,
  fallback?: string | null,
) {
  if (value === "custom" && safeText(customValue)) {
    return safeText(customValue);
  }

  if (value && labels[value]) {
    return labels[value];
  }

  return safeText(fallback) || "";
}

function splitConstraints(value: string) {
  return value
    .split(/[.;\n]+/)
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, 8);
}

export function softenRegulatedClaims(value: string) {
  let text = safeText(value);
  const softenedClaims: string[] = [];

  if (!text) {
    return { text, softenedClaims };
  }

  const replacements: Array<[RegExp, string, string]> = [
    [
      /\bguaranteed\s+approval\s+for\s+([0-9]{3}\+?)\s+credit\b/gi,
      "options may be available for buyers with $1 credit",
      "Softened credit approval guarantee.",
    ],
    [
      /\bapproved\s+with\s+([0-9]{3}\+?)\s+credit\b/gi,
      "see if you may qualify with $1 credit",
      "Softened credit approval claim.",
    ],
    [
      /\bguaranteed\s+approval\b/gi,
      "see what you may qualify for",
      "Softened guaranteed approval language.",
    ],
  ];

  for (const [pattern, replacement, note] of replacements) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      softenedClaims.push(note);
    }
  }

  return { text, softenedClaims };
}

export function buildCreativeIntakeBrief(
  answers: CreativeIntakeAnswers,
  defaults: CreativeIntakeCampaignDefaults,
): CreativeIntakeBrief {
  const offerRaw = resolveAnswerLabel(answers.offer, offerLabels, answers.customOffer, defaults.offer);
  const ctaRaw = safeText(answers.cta) || safeText(defaults.cta) || "See My Options";
  const constraints = safeText(answers.constraints);
  const softenedOffer = softenRegulatedClaims(offerRaw);
  const softenedCta = softenRegulatedClaims(ctaRaw);
  const softenedConstraints = softenRegulatedClaims(constraints);
  const market = safeText(answers.market) || safeText(defaults.market);
  const targetAudience = resolveAnswerLabel(
    answers.targetAudience,
    targetAudienceLabels,
    answers.customAudience,
    defaults.audience,
  );
  const brokerageBrand = resolveAnswerLabel(
    answers.brokerageBrand,
    brandLabels,
    answers.customBrokerageBrand,
    defaults.brand,
  );
  const creativeStyle = answers.creativeStyle ? styleLabels[answers.creativeStyle] : "";
  const propertyType = safeText(answers.propertyType) || safeText(defaults.propertyType) || "real estate";
  const platformPlacement = safeText(answers.platformPlacement) || "Meta feed and story placements";
  const missing = [
    targetAudience ? null : "target_audience",
    softenedOffer.text ? null : "offer",
    market ? null : "market",
    brokerageBrand ? null : "brokerage_brand",
    creativeStyle ? null : "creative_style",
  ].filter((item): item is string => Boolean(item));

  return {
    targetAudience,
    offer: softenedOffer.text,
    market,
    brokerageBrand,
    propertyType,
    creativeStyle,
    platformPlacement,
    cta: softenedCta.text,
    mustUseCopy: splitConstraints(softenedConstraints.text).filter((item) => !/disclaim|not guarantee|subject to/i.test(item)),
    complianceNotes: [
      ...splitConstraints(softenedConstraints.text).filter((item) => /disclaim|not guarantee|subject to|may qualify|approval|credit/i.test(item)),
      ...softenedOffer.softenedClaims,
      ...softenedCta.softenedClaims,
      ...softenedConstraints.softenedClaims,
    ].slice(0, 10),
    softenedClaims: [
      ...softenedOffer.softenedClaims,
      ...softenedCta.softenedClaims,
      ...softenedConstraints.softenedClaims,
    ],
    completion: {
      complete: missing.length === 0,
      missing,
    },
  };
}

export function buildCreativeIntakePromptVersion(
  brief: CreativeIntakeBrief,
  revisionNumber: number,
): CreativeIntakePromptVersion {
  const generatedPrompt = [
    "TEXT-FREE BACKGROUND ASSET ONLY.",
    "Create realistic premium real-estate source photography for DealFlow to compose into a finished ad later.",
    `Market: ${brief.market}.`,
    `Audience: ${brief.targetAudience}.`,
    `Offer context: ${brief.offer}.`,
    `Brokerage or brand direction: ${brief.brokerageBrand}.`,
    `Property focus: ${brief.propertyType}.`,
    `Creative style: ${brief.creativeStyle}.`,
    `Placement: ${brief.platformPlacement}.`,
    "Use visual context, lighting, environment, and subject choice to imply the offer; do not render the final ad.",
    "DealFlow will render the actual headline, CTA, proof chips, badges, labels, and layout after generation.",
    "Do not include readable text, pseudo text, typography, logos, watermarks, UI, dashboards, charts, tables, listing sheets, flyers, brochures, posters, CTA buttons, captions, forms, price cards, or finished-ad layouts.",
    brief.complianceNotes.length > 0
      ? `Compliance guidance: avoid hard guarantees and keep the visual supportive of this softened claim context: ${brief.complianceNotes.join("; ")}.`
      : null,
  ].filter(Boolean).join(" ");
  const negativePrompt = [
    "text",
    "letters",
    "numbers",
    "gibberish typography",
    "logo text",
    "watermark",
    "finished ad",
    "flyer",
    "brochure",
    "poster",
    "dashboard",
    "UI screenshot",
    "chart",
    "table",
    "listing sheet",
    "CTA button",
    "fake caption",
    "fake price",
    "fake form fields",
  ].join("; ");

  return {
    revisionNumber,
    generatedPrompt,
    negativePrompt,
    sanitizedPreview: [
      `${brief.creativeStyle} background for ${brief.targetAudience} in ${brief.market}`,
      `Offer: ${brief.offer}`,
      `Brand direction: ${brief.brokerageBrand}`,
      `CTA DealFlow will render: ${brief.cta}`,
    ].join(" | "),
    createdAt: nowIso(),
  };
}

export function createCreativeIntakeState(params: {
  campaignId: string;
  defaults: CreativeIntakeCampaignDefaults;
  answers?: CreativeIntakeAnswers;
}): CreativeChatIntakeState {
  const answers = creativeIntakeAnswersSchema.parse(params.answers ?? {});
  const brief = buildCreativeIntakeBrief(answers, params.defaults);
  const timestamp = nowIso();

  return {
    version: CREATIVE_CHAT_INTAKE_VERSION,
    conversationId: crypto.randomUUID(),
    campaignId: params.campaignId,
    approvalStatus: "draft",
    revisionNumber: 0,
    answers,
    brief,
    promptVersion: null,
    messages: buildMessagesFromAnswers(answers),
    createdAt: timestamp,
    updatedAt: timestamp,
    approvedAt: null,
  };
}

function buildMessagesFromAnswers(answers: CreativeIntakeAnswers): CreativeIntakeMessage[] {
  const timestamp = nowIso();
  const entries = [
    ["Who are you targeting?", resolveAnswerLabel(answers.targetAudience, targetAudienceLabels, answers.customAudience)],
    ["What offer are you promoting?", resolveAnswerLabel(answers.offer, offerLabels, answers.customOffer)],
    ["What brokerage or brand should this match?", resolveAnswerLabel(answers.brokerageBrand, brandLabels, answers.customBrokerageBrand)],
    ["What city or market is this for?", safeText(answers.market)],
    ["What creative style do you want?", answers.creativeStyle ? styleLabels[answers.creativeStyle] : ""],
    ["Any must-have copy or compliance constraints?", safeText(answers.constraints)],
  ].filter(([, answer]) => Boolean(answer));

  return entries.flatMap(([question, answer]) => [
    {
      id: messageId(),
      role: "assistant" as const,
      content: question,
      createdAt: timestamp,
    },
    {
      id: messageId(),
      role: "user" as const,
      content: answer,
      createdAt: timestamp,
    },
  ]);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readCreativeChatIntakeFromPlan(planValue: unknown): CreativeChatIntakeState | null {
  const plan = readCampaignPlanDocument(planValue);
  const raw = asObject(plan[CREATIVE_CHAT_INTAKE_PLAN_KEY]);

  if (!raw || raw.version !== CREATIVE_CHAT_INTAKE_VERSION || typeof raw.campaignId !== "string") {
    return null;
  }

  return raw as CreativeChatIntakeState;
}

export function isCreativeIntakeApproved(planValue: unknown) {
  const intake = readCreativeChatIntakeFromPlan(planValue);
  return Boolean(
    intake?.approvalStatus === "approved" &&
    intake.brief?.completion.complete === true &&
    intake.promptVersion?.generatedPrompt,
  );
}

export function mergeCreativeChatIntakeIntoPlan(
  planValue: unknown,
  intake: CreativeChatIntakeState,
): CampaignPlanDocument {
  const plan = readCampaignPlanDocument(planValue);

  return mergeCampaignPlanDocument(plan, {
    [CREATIVE_CHAT_INTAKE_PLAN_KEY]: intake as unknown as Json,
  });
}

export async function persistCreativeChatIntake(params: {
  supabase: {
    from(table: "campaign_plans"): {
      select(columns: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: { plan?: unknown; user_id?: string | null; organization_id?: string | null } | null; error: Error | null }>;
        };
      };
    };
  };
  campaignId: string;
  userId: string;
  organizationId: string;
  defaults: CreativeIntakeCampaignDefaults;
  answers?: CreativeIntakeAnswers;
  action: "save_answers" | "approve" | "revise";
  revisionMessage?: string | null;
}) {
  const { data, error } = await params.supabase
    .from("campaign_plans")
    .select("plan,user_id,organization_id")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || (data.user_id !== params.userId && data.organization_id !== params.organizationId)) {
    throw new Error("Campaign not found.");
  }

  const existing = readCreativeChatIntakeFromPlan(data.plan);
  const mergedAnswers = {
    ...(existing?.answers ?? {}),
    ...(params.answers ?? {}),
  };
  const brief = buildCreativeIntakeBrief(mergedAnswers, params.defaults);
  const revisionNumber = params.action === "revise"
    ? (existing?.revisionNumber ?? 0) + 1
    : existing?.revisionNumber ?? 0;
  const timestamp = nowIso();
  const approved = params.action === "approve";
  const promptVersion = approved
    ? buildCreativeIntakePromptVersion(brief, revisionNumber)
    : params.action === "revise"
      ? null
      : existing?.promptVersion ?? null;
  const revisionMessages =
    params.action === "revise" && safeText(params.revisionMessage)
      ? [
          {
            id: messageId(),
            role: "user" as const,
            content: safeText(params.revisionMessage),
            createdAt: timestamp,
          },
          {
            id: messageId(),
            role: "system" as const,
            content: "Revision saved. Review the updated brief before regenerating paid media.",
            createdAt: timestamp,
          },
        ]
      : [];
  const previousRevisions =
    params.action === "revise" && existing
      ? [
          ...(existing.previousRevisions ?? []),
          {
            revisionNumber: existing.revisionNumber,
            approvalStatus: existing.approvalStatus,
            brief: existing.brief,
            promptVersion: existing.promptVersion,
            createdAt: existing.updatedAt,
            approvedAt: existing.approvedAt ?? null,
          },
        ].slice(-12)
      : existing?.previousRevisions ?? [];
  const intake: CreativeChatIntakeState = {
    version: CREATIVE_CHAT_INTAKE_VERSION,
    conversationId: existing?.conversationId ?? crypto.randomUUID(),
    campaignId: params.campaignId,
    approvalStatus: approved ? "approved" : params.action === "revise" ? "revision_requested" : "draft",
    revisionNumber,
    answers: mergedAnswers,
    brief,
    promptVersion,
    messages: [
      ...(existing?.messages ?? []),
      ...buildMessagesFromAnswers(params.answers ?? {}),
      ...revisionMessages,
    ].slice(-80),
    previousRevisions,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    approvedAt: approved ? timestamp : null,
  };

  if (approved && !brief.completion.complete) {
    throw new Error(`Creative brief is incomplete: ${brief.completion.missing.join(", ")}`);
  }

  await persistCampaignPlanDocumentUpdate({
    supabase: params.supabase as never,
    campaignId: params.campaignId,
    userId: params.userId,
    plan: mergeCreativeChatIntakeIntoPlan(data.plan, intake),
    source: "creative_chat_intake",
  });

  return intake;
}
