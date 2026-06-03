"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, FileCheck2, PencilLine, ShieldCheck, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CreativeChatIntakeState,
  CreativeIntakeAnswers,
  CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";
import {
  buildCreativeUgcScriptDraft,
  inferCreativeUgcAudienceKind,
  normalizeCreativeOfferTitle,
  validateCreativeUgcScriptDraft,
} from "@/lib/services/creative-ugc-script-service";

type CreativeChatIntakeProps = {
  campaignId: string;
  defaults: CreativeIntakeCampaignDefaults;
  initialIntake: CreativeChatIntakeState | null;
  mode?: "gate" | "compact";
};

const audienceOptions = [
  ["sellers", "Sellers"],
  ["buyers", "Buyers"],
  ["first_time_buyers", "First-time buyers"],
  ["investors", "Investors"],
  ["expired_listings", "Expired listings"],
  ["custom", "Custom"],
] as const;

const brandOptions = [
  ["remax", "RE/MAX"],
  ["exp", "eXp"],
  ["royal_lepage", "Royal LePage"],
  ["keller_williams", "Keller Williams"],
  ["century_21", "Century 21"],
  ["custom", "Custom"],
] as const;

const styleOptions = [
  ["clean_local_expert", "Clean Local Expert"],
  ["bold_offer_focused", "Bold Offer Focused"],
  ["premium_home_sale_guide", "Premium Home Sale Guide"],
] as const;

const lengthOptions = [
  ["15", "15 sec"],
  ["20", "20 sec"],
  ["30", "30 sec"],
] as const;

const personaOptions = [
  ["Local Agent", "Local Agent"],
  ["Real Estate Advisor", "Real Estate Advisor"],
  ["Direct Response Narrator", "Direct Response Narrator"],
] as const;

const sellerHookOptions = [
  ["Buyer Demand", "Buyer Demand"],
  ["Price Confidence", "Price Confidence"],
  ["Timing Clarity", "Timing Clarity"],
  ["Avoid Underpricing", "Avoid Underpricing"],
] as const;

const buyerHookOptions = [
  ["Early Access", "Early Access"],
  ["Hidden Inventory", "Hidden Inventory"],
  ["Avoid Wasted Time", "Avoid Wasted Time"],
  ["Budget Confidence", "Budget Confidence"],
] as const;

const investorHookOptions = [
  ["Off-Market Deal Flow", "Off-Market Deal Flow"],
  ["Numbers First", "Numbers First"],
  ["Risk Check", "Risk Check"],
  ["Yield Clarity", "Yield Clarity"],
] as const;

const commercialHookOptions = [
  ["Site Shortlist", "Site Shortlist"],
  ["Lease/Purchase Clarity", "Lease/Purchase Clarity"],
  ["Avoid Wasted Tours", "Avoid Wasted Tours"],
  ["Local Availability", "Local Availability"],
] as const;

const mixedHookOptions = [
  ["Single Primary CTA", "Single Primary CTA"],
  ["Clear Next Step", "Clear Next Step"],
] as const;

const visualOptions = [
  ["Talking-head with local captions", "Talking-head with local captions"],
  ["Listing walkthrough style", "Listing walkthrough style"],
  ["Clean direct-response explainer", "Clean direct-response explainer"],
] as const;

const scriptReasonLabels: Record<string, string> = {
  script_sections_missing: "use a clear hook, information/proof, and CTA",
  cta_missing: "add a direct CTA such as click learn more, book a call, or get access",
  offer_phrase_repeated: "use the offer once or twice instead of repeating it",
  script_line_repeated: "remove repeated lines",
  script_too_long_for_duration: "shorten the script or choose a longer duration",
  seller_buyer_language_mismatch: "remove buyer language from this seller campaign",
  buyer_seller_language_mismatch: "remove seller language from this buyer campaign",
  investor_language_mismatch: "remove residential buyer or seller language from this investor campaign",
  commercial_language_mismatch: "remove residential buyer or seller language from this commercial campaign",
  needs_campaign_classification: "classify this campaign as buyer, seller, investor, commercial, or mixed before approving a script",
  needs_primary_cta: "choose one primary CTA for this mixed campaign",
  audience_missing: "add the audience before approving the script",
  market_missing: "add the market before approving the script",
  offer_missing: "add the campaign offer before approving the script",
  hook_missing_market_or_audience: "make the hook mention the audience and market",
  cta_mismatch: "make the script CTA match the campaign CTA exactly",
  multiple_ctas: "use one clear CTA only",
  testimonial_unsubstantiated: "remove testimonial-style claims unless a real testimonial is approved",
  housing_protected_class_language: "remove protected-class or exclusionary housing language",
  unsupported_guarantee: "remove unsupported guarantee language",
  guaranteed_approval: "remove guaranteed approval language",
  guaranteed_financing: "remove guaranteed financing language",
  guaranteed_sale: "remove guaranteed sale language",
  guaranteed_roi: "remove guaranteed ROI language",
  fake_urgency: "remove fake urgency",
  internal_jargon: "remove internal system wording",
};

function defaultAnswers(defaults: CreativeIntakeCampaignDefaults): CreativeIntakeAnswers {
  const audienceKind = inferCreativeUgcAudienceKind({
    campaignType: defaults.campaignType,
    audience: defaults.audience,
    offer: defaults.offer,
    cta: defaults.cta,
  });
  const offerTitle = normalizeCreativeOfferTitle({
    value: defaults.offer,
    campaignType: defaults.campaignType,
    audience: defaults.audience,
  });
  const hookAngle = getDefaultHookAngle(audienceKind);
  const draft = buildCreativeUgcScriptDraft({
    campaignType: defaults.campaignType,
    audience: defaults.audience,
    market: defaults.market,
    offerTitle,
    offerMechanism: defaults.offer,
    propertyType: defaults.propertyType,
    cta: defaults.cta ?? "See My Options",
    targetDurationSeconds: 20,
    creatorPersona: "Local Agent",
    hookAngle,
    visualStyle: "Talking-head with local captions",
  });
  return {
    targetAudience:
      audienceKind === "seller"
        ? "sellers"
        : audienceKind === "investor"
          ? "investors"
          : audienceKind === "buyer"
            ? "buyers"
            : "custom",
    customAudience: audienceKind === "commercial" || audienceKind === "mixed" || audienceKind === "unknown"
      ? (defaults.audience ?? "")
      : undefined,
    offer: "custom",
    customOffer: offerTitle,
    offerTitle,
    offerMechanism: defaults.offer ?? "",
    brokerageBrand: "custom",
    customBrokerageBrand: defaults.brand ?? "",
    market: defaults.market ?? "",
    creativeStyle: "clean_local_expert",
    staticStyle: "clean_local_expert",
    constraints: "",
    cta: defaults.cta ?? "See My Options",
    platformPlacement: "Meta feed and story placements",
    propertyType: defaults.propertyType ?? "",
    outputMode: "finished_ad",
    generationPhase: "static",
    targetDurationSeconds: 20,
    creatorPersona: "Local Agent",
    hookAngle,
    visualStyle: "Talking-head with local captions",
    pacing: "Fast hook, clear mechanism, calm CTA",
    cameraStyle: "Phone-camera creator POV",
    captionOverlayStyle: "Large readable captions only when useful",
    referenceExamples: "",
    goodBadExamples: "",
    mustUseLanguage: "",
    mustAvoid: "No fake dashboards, fake listing sheets, guaranteed approval claims, tiny captions, or generic stock clips",
    selectedUgcConceptId: "",
    ugcDefaultStyleAccepted: false,
    ugcApprovedScript: draft.lines.join("\n"),
    ugcShotList: draft.shotList,
    ugcOnScreenText: draft.onScreenText,
    ugcScriptVersion: draft.version,
  };
}

function getDefaultHookAngle(audienceKind: ReturnType<typeof inferCreativeUgcAudienceKind>) {
  if (audienceKind === "buyer") return "Early Access";
  if (audienceKind === "investor") return "Off-Market Deal Flow";
  if (audienceKind === "commercial") return "Site Shortlist";
  if (audienceKind === "mixed") return "Single Primary CTA";
  if (audienceKind === "unknown") return "";
  return "Buyer Demand";
}

function getHookOptions(audienceKind: ReturnType<typeof inferCreativeUgcAudienceKind>) {
  if (audienceKind === "buyer") return buyerHookOptions;
  if (audienceKind === "investor") return investorHookOptions;
  if (audienceKind === "commercial") return commercialHookOptions;
  if (audienceKind === "mixed") return mixedHookOptions;
  if (audienceKind === "unknown") return [];
  return sellerHookOptions;
}

function getAnswerLabel(value: string | null | undefined, options: readonly (readonly [string, string])[]) {
  return options.find(([key]) => key === value)?.[1] ?? value ?? "Not set";
}

function describeScriptReason(reason: string) {
  return scriptReasonLabels[reason] ?? reason.replaceAll("_", " ");
}

function getAudienceLabelFromAnswers(answers: CreativeIntakeAnswers) {
  return answers.targetAudience === "custom" ? answers.customAudience : getAnswerLabel(answers.targetAudience, audienceOptions);
}

function buildDraftForAnswers(defaults: CreativeIntakeCampaignDefaults, answers: CreativeIntakeAnswers) {
  return buildCreativeUgcScriptDraft({
    campaignType: defaults.campaignType,
    audience: getAudienceLabelFromAnswers(answers),
    market: answers.market,
    offerTitle: answers.offerTitle || answers.customOffer || defaults.offer,
    offerMechanism: answers.offerMechanism || defaults.offer,
    propertyType: answers.propertyType || defaults.propertyType,
    cta: answers.cta || defaults.cta,
    targetDurationSeconds: answers.targetDurationSeconds,
    creatorPersona: answers.creatorPersona,
    hookAngle: answers.hookAngle,
    visualStyle: answers.visualStyle,
  });
}

const UGC_DERIVED_FIELD_KEYS: (keyof CreativeIntakeAnswers)[] = [
  "cta",
  "offer",
  "offerTitle",
  "customOffer",
  "market",
  "targetAudience",
  "customAudience",
  "propertyType",
  "targetDurationSeconds",
  "creatorPersona",
  "hookAngle",
  "visualStyle",
];

const UGC_APPROVAL_INVALIDATING_KEYS: (keyof CreativeIntakeAnswers)[] = [
  ...UGC_DERIVED_FIELD_KEYS,
  "staticStyle",
  "creativeStyle",
  "brokerageBrand",
  "customBrokerageBrand",
];

function hasAnswerKey(next: Partial<CreativeIntakeAnswers>, keys: (keyof CreativeIntakeAnswers)[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(next, key));
}

function ensureCurrentCtaOnScreenText(items: string[] | undefined, cta: string | null | undefined) {
  const cleanItems = Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
  const cleanCta = cta?.trim() ?? "";

  if (!cleanCta) {
    return cleanItems;
  }

  const withoutStaleCta = cleanItems.filter((item) => item.toLowerCase() !== cleanCta.toLowerCase());
  return [...withoutStaleCta.slice(0, 5), cleanCta];
}

function syncDerivedUgcAnswers(defaults: CreativeIntakeCampaignDefaults, answers: CreativeIntakeAnswers) {
  const draft = buildDraftForAnswers(defaults, answers);

  return {
    ugcApprovedScript: draft.lines.join("\n"),
    ugcShotList: draft.shotList,
    ugcOnScreenText: ensureCurrentCtaOnScreenText(draft.onScreenText, answers.cta || defaults.cta),
    ugcScriptVersion: draft.version,
    ugcScriptApprovedAt: null,
  } satisfies Partial<CreativeIntakeAnswers>;
}

function normalizeInitialAnswers(defaults: CreativeIntakeCampaignDefaults, answers: CreativeIntakeAnswers) {
  const audienceKind = inferCreativeUgcAudienceKind({
    campaignType: defaults.campaignType,
    audience: getAudienceLabelFromAnswers(answers) || defaults.audience,
    offer: answers.offerTitle || answers.customOffer || defaults.offer,
    cta: answers.cta || defaults.cta,
  });
  const hookOptions = getHookOptions(audienceKind);
  const hasValidHook = hookOptions.some(([value]) => value === answers.hookAngle);
  const nextAnswers: CreativeIntakeAnswers = {
    ...answers,
    hookAngle: hasValidHook ? answers.hookAngle : getDefaultHookAngle(audienceKind),
  };
  const draft = buildDraftForAnswers(defaults, nextAnswers);
  const scriptLines = (nextAnswers.ugcApprovedScript?.trim() ? nextAnswers.ugcApprovedScript : draft.lines.join("\n"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scriptValidation = validateCreativeUgcScriptDraft({
    script: { ...draft, lines: scriptLines },
    campaignType: defaults.campaignType,
    audience: getAudienceLabelFromAnswers(nextAnswers) || defaults.audience,
    market: nextAnswers.market || defaults.market,
    offerTitle: nextAnswers.offerTitle || nextAnswers.customOffer || defaults.offer,
    cta: nextAnswers.cta || defaults.cta,
    propertyType: nextAnswers.propertyType || defaults.propertyType,
  });

  if (scriptValidation.reasons.includes("buyer_seller_language_mismatch") || scriptValidation.reasons.includes("seller_buyer_language_mismatch")) {
    return {
      ...nextAnswers,
      ugcApprovedScript: draft.lines.join("\n"),
      ugcShotList: draft.shotList,
      ugcOnScreenText: draft.onScreenText,
      ugcScriptVersion: draft.version,
      ugcScriptApprovedAt: null,
    };
  }

  return nextAnswers;
}

function getComplianceRewritePreview(value: string | null | undefined) {
  const input = value?.trim() ?? "";
  const guaranteedApprovalCredit = input.match(/\bguaranteed\s+approval\s+for\s+([0-9]{3}\+?)\s+credit\b/i);

  if (guaranteedApprovalCredit) {
    return {
      originalInput: input,
      blockedPhrase: guaranteedApprovalCredit[0],
      reason: "Guaranteed approval language is not allowed for housing or financing-related ads.",
      suggestedReplacement: `Home Options for ${guaranteedApprovalCredit[1]} Credit`,
    };
  }

  if (/\bguaranteed\s+approval\b/i.test(input)) {
    return {
      originalInput: input,
      blockedPhrase: "Guaranteed approval",
      reason: "Guaranteed approval language is not allowed for housing or financing-related ads.",
      suggestedReplacement: input.replace(/\bguaranteed\s+approval\b/gi, "see what you may qualify for"),
    };
  }

  return null;
}

export function CreativeChatIntake({
  campaignId,
  defaults,
  initialIntake,
  mode = "gate",
}: CreativeChatIntakeProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CreativeIntakeAnswers>(() =>
    normalizeInitialAnswers(defaults, {
      ...defaultAnswers(defaults),
      ...(initialIntake?.answers ?? {}),
    }),
  );
  const [revisionMessage, setRevisionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const approved = initialIntake?.approvalStatus === "approved" && initialIntake.brief?.completion.complete === true;
  const revisionRequested = initialIntake?.approvalStatus === "revision_requested";
  const savedDraft = initialIntake?.approvalStatus === "draft" && Boolean(initialIntake?.updatedAt);
  const brief = initialIntake?.brief ?? null;
  const approvedBriefSummary = brief
    ? [
        `${brief.creativeStyle || "Creative"} direction`,
        brief.targetAudience ? `for ${brief.targetAudience}` : null,
        brief.market ? `in ${brief.market}` : null,
        `Offer: ${brief.offerTitle || brief.offer}`,
        brief.cta ? `CTA: ${brief.cta}` : null,
      ].filter(Boolean).join(" | ")
    : `${defaults.offer ?? "Creative"} direction for ${defaults.audience ?? "this audience"}.`;
  const audienceLabel = getAudienceLabelFromAnswers(answers);
  const audienceKind = useMemo(() => inferCreativeUgcAudienceKind({
    campaignType: defaults.campaignType,
    audience: audienceLabel || defaults.audience,
    offer: answers.offerTitle || answers.customOffer || defaults.offer,
    cta: answers.cta || defaults.cta,
  }), [answers.cta, answers.customOffer, answers.offerTitle, audienceLabel, defaults]);
  const activeHookOptions = getHookOptions(audienceKind);
  const ugcDraft = useMemo(() => buildDraftForAnswers(defaults, answers), [answers, defaults]);
  const scriptLines = (answers.ugcApprovedScript?.trim() ? answers.ugcApprovedScript : ugcDraft.lines.join("\n"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const baseScriptValidation = validateCreativeUgcScriptDraft({
    script: { ...ugcDraft, lines: scriptLines },
    campaignType: defaults.campaignType,
    audience: audienceLabel,
    market: answers.market || defaults.market,
    offerTitle: answers.offerTitle || answers.customOffer || defaults.offer,
    cta: answers.cta || defaults.cta,
    propertyType: answers.propertyType || defaults.propertyType,
  });
  const expectedCta = (answers.cta || defaults.cta || "").trim().toLowerCase();
  const scriptText = scriptLines.join(" ").toLowerCase();
  const onScreenText = answers.ugcOnScreenText?.length ? answers.ugcOnScreenText : ugcDraft.onScreenText;
  const onScreenCtaMatches =
    !expectedCta || onScreenText.some((line) => line.trim().toLowerCase() === expectedCta);
  const scriptCtaMatches = !expectedCta || scriptText.includes(expectedCta);
  const scriptReasons = [
    ...baseScriptValidation.reasons,
    !scriptCtaMatches || !onScreenCtaMatches ? "cta_mismatch" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const scriptValidation = {
    ...baseScriptValidation,
    accepted: [...new Set(scriptReasons)].length === 0,
    reasons: [...new Set(scriptReasons)],
  };
  const scriptApproved = Boolean(answers.ugcScriptApprovedAt) && scriptValidation.accepted;
  const complete = useMemo(() => {
    return Boolean(
      answers.targetAudience &&
      (answers.targetAudience !== "custom" || answers.customAudience?.trim()) &&
      (answers.offerTitle?.trim() || answers.customOffer?.trim()) &&
      answers.brokerageBrand &&
      (answers.brokerageBrand !== "custom" || answers.customBrokerageBrand?.trim()) &&
      answers.market?.trim() &&
      (answers.staticStyle || answers.creativeStyle) &&
      ((answers.generationPhase !== "ugc_video" && answers.generationPhase !== "static_and_ugc") || scriptApproved),
    );
  }, [answers, scriptApproved]);

  function updateAnswer(next: Partial<CreativeIntakeAnswers>) {
    setAnswers((current) => {
      const merged = { ...current, ...next };
      const shouldRegenerateUgc =
        hasAnswerKey(next, UGC_DERIVED_FIELD_KEYS) &&
        !hasAnswerKey(next, ["ugcApprovedScript", "ugcShotList", "ugcOnScreenText"]);
      const shouldInvalidateApproval = shouldRegenerateUgc || hasAnswerKey(next, UGC_APPROVAL_INVALIDATING_KEYS);

      return {
        ...merged,
        ...(shouldRegenerateUgc ? syncDerivedUgcAnswers(defaults, merged) : {}),
        ...(shouldInvalidateApproval && !shouldRegenerateUgc ? { ugcScriptApprovedAt: null } : {}),
      };
    });
    setError(null);
    setNotice(null);
  }

  function refreshScriptDraft(next: Partial<CreativeIntakeAnswers> = {}) {
    const merged = { ...answers, ...next };
    const draft = buildDraftForAnswers(defaults, merged);
    updateAnswer({
      ...next,
      ugcApprovedScript: draft.lines.join("\n"),
      ugcShotList: draft.shotList,
      ugcOnScreenText: draft.onScreenText,
      ugcScriptVersion: draft.version,
      ugcScriptApprovedAt: null,
    });
  }

  function approveScript() {
    const cleanCta = answers.cta || defaults.cta || ugcDraft.cta;
    updateAnswer({
      ugcApprovedScript: scriptLines.join("\n"),
      ugcShotList: answers.ugcShotList?.length ? answers.ugcShotList : ugcDraft.shotList,
      ugcOnScreenText: ensureCurrentCtaOnScreenText(
        answers.ugcOnScreenText?.length ? answers.ugcOnScreenText : ugcDraft.onScreenText,
        cleanCta,
      ),
      ugcScriptVersion: ugcDraft.version,
      ugcScriptApprovedAt: new Date().toISOString(),
    });
  }

  async function persist(action: "save_answers" | "approve" | "revise") {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creative-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          answers,
          revisionMessage: action === "revise" ? revisionMessage : undefined,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Creative brief could not be saved.");
      }

      if (action === "revise") {
        setRevisionMessage("");
      }
      setNotice(
        action === "approve"
          ? "Creative brief approved. Paid rendering can continue after the workspace refreshes."
          : action === "revise"
            ? "Revision requested. Paid rendering stays blocked until the updated brief is approved."
            : scriptApproved
              ? "Draft saved. Your approved brief is ready for generation."
              : "Draft saved. Static ads can be generated now; UGC can be added later.",
      );
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Creative brief could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "compact" && approved) {
    return (
      <Card className="border-emerald-300/16 bg-emerald-300/[0.045] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BadgeCheck className="size-4 text-emerald-100" />
              <p className="text-sm font-semibold text-foreground">Creative brief approved</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {approvedBriefSummary}
            </p>
            <p className="mt-2 text-xs leading-5 text-emerald-100/80">
              Requesting a revision will pause paid rendering until the revised brief is approved again.
            </p>
          </div>
          <div className="min-w-0 max-w-full lg:w-[420px]">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Revision note
            </label>
            <div className="mt-2 flex max-w-full flex-col gap-2 sm:flex-row">
              <Input
                value={revisionMessage}
                onChange={(event) => setRevisionMessage(event.target.value)}
                placeholder="Make it more local, premium, or seller-focused"
              />
              <Button
                type="button"
                variant="secondary"
                className="!h-auto min-h-14 w-full min-w-0 max-w-full whitespace-normal py-4 !leading-none sm:w-auto"
                style={{ minHeight: 64, lineHeight: 1 }}
                disabled={saving || !revisionMessage.trim()}
                onClick={() => void persist("revise")}
              >
                Revise
              </Button>
            </div>
            <Button
              asChild
              type="button"
              variant="secondary"
              className="mt-3 !h-auto min-h-14 w-full max-w-full whitespace-normal py-4 text-center !leading-none"
              style={{ minHeight: 64, lineHeight: 1 }}
            >
              <Link href={`/build/creatives?campaignId=${encodeURIComponent(campaignId)}&creativeBrief=edit`}>
                Open Marketing Studio chat
              </Link>
            </Button>
            {notice ? <p className="mt-2 text-sm text-emerald-200" aria-live="polite">{notice}</p> : null}
            {error ? <p className="mt-2 text-sm text-rose-300" aria-live="assertive">{error}</p> : null}
          </div>
        </div>
      </Card>
    );
  }

  const steps = [
    ["Basics", "Confirm campaign"],
    ["Static", "Choose style"],
    ["UGC", "Optional later"],
    ["Review", "Generate set"],
  ] as const;
  const brandLabel = answers.brokerageBrand === "custom"
    ? answers.customBrokerageBrand
    : getAnswerLabel(answers.brokerageBrand, brandOptions);
  const offerRewritePreview = getComplianceRewritePreview(answers.offerTitle || answers.customOffer);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,0.98fr)_minmax(340px,0.52fr)]">
        <section className="min-w-0 border-b border-white/10 p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100">
              <WandSparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/72">Creative brief</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Build the creative set before anything renders
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Confirm the offer and static style, then generate the static launch set. UGC video is optional and can be added later.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-4">
            {steps.map(([title, subtitle], index) => {
              const active = activeStep === index;
              const done = index === 0
                ? Boolean(answers.market?.trim() && (answers.offerTitle?.trim() || answers.customOffer?.trim()) && answers.cta?.trim())
                : index === 1
                  ? Boolean(answers.staticStyle || answers.creativeStyle)
                  : index === 2
                    ? scriptApproved
                    : complete;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    active ? "border-cyan-200/40 bg-cyan-300/[0.11]" : "border-white/10 bg-white/[0.035] hover:border-cyan-200/24",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {done ? <CheckCircle2 className="size-4 text-emerald-100" /> : null}
                    {title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5">
            {revisionRequested ? (
              <div className="rounded-[20px] border border-amber-300/18 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-100">
                Revisions were requested for this brief. Update the answers, approve the script, then approve the brief again.
              </div>
            ) : savedDraft ? (
              <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-cyan-100">
                Draft recovered from your last session. Review the guided brief and approve it when the direction is ready.
              </div>
            ) : null}

            {activeStep === 0 ? (
              <div className="grid gap-5">
                <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Auto-detected audience</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{audienceLabel || "Audience detected from campaign"}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">The campaign type and saved strategy are already applied here, so customers do not need to re-answer targeting setup.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Market</span>
                    <Input value={answers.market ?? ""} onChange={(event) => updateAnswer({ market: event.target.value, ugcScriptApprovedAt: null })} placeholder="Brampton, ON" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Offer title</span>
                    <Input value={answers.offerTitle ?? answers.customOffer ?? ""} onChange={(event) => updateAnswer({ offerTitle: event.target.value, customOffer: event.target.value, ugcScriptApprovedAt: null })} placeholder="14-Day Home Sale Plan" />
                  </label>
                  <div className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Brokerage brand</span>
                    <ChoiceGroup
                      label="Brokerage brand"
                      value={answers.brokerageBrand}
                      options={brandOptions}
                      onChange={(brokerageBrand) => updateAnswer({
                        brokerageBrand: brokerageBrand as CreativeIntakeAnswers["brokerageBrand"],
                        ugcScriptApprovedAt: null,
                      })}
                    />
                  </div>
                  {answers.brokerageBrand === "custom" ? (
                    <label className="space-y-2 text-sm">
                      <span className="text-muted-foreground">Custom brokerage</span>
                      <Input value={answers.customBrokerageBrand ?? ""} onChange={(event) => updateAnswer({ customBrokerageBrand: event.target.value, ugcScriptApprovedAt: null })} placeholder="Your brokerage or team brand" />
                    </label>
                  ) : null}
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Primary CTA</span>
                    <Input value={answers.cta ?? ""} onChange={(event) => updateAnswer({ cta: event.target.value, ugcScriptApprovedAt: null })} placeholder="See if your home qualifies" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Tone preference</span>
                    <Input value={answers.constraints ?? ""} onChange={(event) => updateAnswer({ constraints: event.target.value })} placeholder="Clear, local, direct" />
                  </label>
                </div>
                {offerRewritePreview ? (
                  <div className="rounded-[20px] border border-amber-300/18 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-100">
                    <p className="font-semibold text-amber-50">Offer wording needs a compliant version before approval.</p>
                    <dl className="mt-3 grid gap-2">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Original input</dt>
                        <dd>{offerRewritePreview.originalInput}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Blocked phrase</dt>
                        <dd>{offerRewritePreview.blockedPhrase}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Reason</dt>
                        <dd>{offerRewritePreview.reason}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Suggested replacement</dt>
                        <dd>{offerRewritePreview.suggestedReplacement}</dd>
                      </div>
                    </dl>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => updateAnswer({
                        offerTitle: offerRewritePreview.suggestedReplacement,
                        customOffer: offerRewritePreview.suggestedReplacement,
                        ugcScriptApprovedAt: null,
                      })}
                    >
                      Use compliant version
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeStep === 1 ? (
              <ChoiceGroup
                label="Choose static ad direction"
                value={answers.staticStyle ?? answers.creativeStyle}
                options={styleOptions}
                onChange={(creativeStyle) => updateAnswer({
                  staticStyle: creativeStyle as CreativeIntakeAnswers["staticStyle"],
                  creativeStyle: creativeStyle as CreativeIntakeAnswers["creativeStyle"],
                })}
              />
            ) : null}

            {activeStep === 2 ? (
              <div className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Target length" value={String(answers.targetDurationSeconds ?? 20)} options={lengthOptions} onChange={(value) => updateAnswer({ targetDurationSeconds: Number(value), ugcScriptApprovedAt: null })} />
                  <ChoiceGroup label="Creator persona" value={answers.creatorPersona} options={personaOptions} onChange={(value) => updateAnswer({ creatorPersona: value, ugcScriptApprovedAt: null })} />
                  <ChoiceGroup label="Hook angle" value={answers.hookAngle} options={activeHookOptions} onChange={(value) => updateAnswer({ hookAngle: value, ugcScriptApprovedAt: null })} />
                  <ChoiceGroup label="Visual style" value={answers.visualStyle} options={visualOptions} onChange={(value) => updateAnswer({ visualStyle: value, ugcScriptApprovedAt: null })} />
                </div>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Approved UGC script</span>
                  <textarea
                    aria-label="Approved UGC script"
                    className="min-h-[190px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                    value={answers.ugcApprovedScript ?? ugcDraft.lines.join("\n")}
                    onChange={(event) => updateAnswer({ ugcApprovedScript: event.target.value, ugcScriptApprovedAt: null })}
                  />
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  Use Hook → Info/proof → CTA. Current length: {scriptValidation.wordCount}/{scriptValidation.maxWords} words for {answers.targetDurationSeconds ?? 20}s.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PreviewList title="Shot list" items={answers.ugcShotList?.length ? answers.ugcShotList : ugcDraft.shotList} />
                  <PreviewList title="On-screen text" items={answers.ugcOnScreenText?.length ? answers.ugcOnScreenText : ugcDraft.onScreenText} />
                </div>
                {scriptValidation.accepted ? (
                  <p className="rounded-2xl border border-emerald-300/18 bg-emerald-300/[0.08] p-3 text-sm text-emerald-100">Script quality checks pass. Approve it when you want to add UGC video.</p>
                ) : (
                  <p className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] p-3 text-sm text-amber-100">
                    Fix before approval: {scriptValidation.reasons.map(describeScriptReason).join("; ")}.
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" variant="secondary" onClick={() => refreshScriptDraft()}>
                    Refresh script draft
                  </Button>
                  <Button type="button" disabled={!scriptValidation.accepted} onClick={approveScript}>
                    {scriptApproved ? "Script approved" : "Approve script"}
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="grid gap-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Static previews are ready immediately. UGC video can be added later; final AI-rendered media updates after rendering completes and the asset passes launch review.
                </p>
                <PreviewList
                  title="Ready checklist"
                  items={[
                    answers.market?.trim() ? "Campaign basics complete" : "Campaign basics incomplete",
                    answers.staticStyle || answers.creativeStyle ? "Static direction selected" : "Static direction needed",
                    scriptApproved ? "UGC script approved" : "UGC can be added later",
                    complete ? "Creative set ready to generate" : "Complete the missing items before approval",
                  ]}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="secondary" disabled={saving || activeStep === 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>
                Back
              </Button>
              {activeStep < 3 ? (
                <Button type="button" disabled={saving} onClick={() => setActiveStep((step) => Math.min(3, step + 1))}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist("save_answers")}>
                    {saving ? "Saving..." : "Save draft"}
                  </Button>
                  <Button type="button" disabled={saving || !complete} onClick={() => void persist("approve")}>
                    {saving ? "Approving..." : "Generate Creative Set"}
                  </Button>
                </>
              )}
            </div>
            {!complete && activeStep === 3 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Confirm campaign basics and choose a static direction before generating the static launch set.
              </p>
            ) : null}
            {notice ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100" aria-live="polite">{notice}</p> : null}
            {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100" aria-live="assertive">{error}</p> : null}
          </div>
        </section>

        <aside className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-100" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Readiness</p>
          </div>
          <div className="mt-5 space-y-3">
            <SummaryRow label="Market" value={answers.market} />
            <SummaryRow label="Audience" value={audienceLabel} />
            <SummaryRow label="Offer" value={answers.offerTitle || answers.customOffer} />
            <SummaryRow label="Brand" value={brandLabel} />
            <SummaryRow label="CTA" value={answers.cta || defaults.cta || "See My Options"} />
            <SummaryRow label="Static style" value={getAnswerLabel(answers.staticStyle ?? answers.creativeStyle, styleOptions)} />
            <SummaryRow label="UGC script" value={scriptApproved ? "Approved" : "Needs approval"} />
          </div>
          <div className="mt-5 rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <FileCheck2 className="mb-3 size-4 text-emerald-100" />
            Static previews appear immediately. Final AI-rendered media updates after rendering completes and passes launch review.
          </div>
          <div className="mt-5 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <PencilLine className="mb-3 size-4 text-cyan-100" />
            The UGC video render uses the approved script and shot list. Editing the script requires approval again before rendering.
          </div>
          {initialIntake?.messages?.length ? (
            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-foreground">Saved brief history</p>
              <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                {initialIntake.messages.slice(-6).map((message) => (
                  <div key={message.id} className="rounded-2xl bg-white/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {message.content}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </Card>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string | null;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.length === 0 ? (
          <p className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold text-amber-100">
            Classify the campaign before choosing this setting.
          </p>
        ) : null}
        {options.map(([key, title]) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs font-semibold transition",
                active
                  ? "border-cyan-200/36 bg-cyan-300/[0.1] text-cyan-50"
                  : "border-white/10 bg-white/[0.035] text-white/64 hover:border-cyan-200/18",
              )}
            >
              {title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items?: readonly string[] | null }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="mt-3 grid gap-2">
        {(items ?? []).filter(Boolean).map((item, index) => (
          <p key={`${title}-${index}`} className="text-sm leading-6 text-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value?.trim() || "Not set"}</p>
    </div>
  );
}
