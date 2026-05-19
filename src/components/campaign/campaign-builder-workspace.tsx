// @ts-nocheck
"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BuilderCreativesPanel,
  BuilderFunnelPanel,
  BuilderPreviewPanel,
  BuilderSetupPanel,
} from "@/components/campaign/builder/builder-panels";
import { BuilderNavigation } from "@/components/campaign/builder/builder-navigation";
import { CampaignPublishPanel } from "@/components/campaign/campaign-publish-panel";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
import { CreativeStrategySummary } from "@/components/campaign/creative-strategy-summary";
import { THEME_PRESET_LIBRARY } from "@/components/campaign/builder/funnel-editor-shared";
import type {
  BuilderAiCommandResult,
  BuilderCampaignRevision,
  BuilderEditingMode,
  BuilderRevisionSource,
  BuilderTab,
  BuilderPreviewDirection,
  BuilderThemePreset,
  GeneratedVideoState,
  GuidedStep,
  PreviewPaneTab,
} from "@/components/campaign/builder/types";
import { useBuilderPreviewModel } from "@/components/campaign/builder/use-builder-preview-model";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { formatVideoWorkflowErrorMessage } from "@/lib/ai/video-generation-errors";
import {
  generateCreativeCopyAssistant,
  improveCopyText,
  type CreativeCopyAssistantOutput,
} from "@/lib/services/copy-engine";
import {
  enhanceOffer,
  generateOfferVariations,
} from "@/lib/copy/offer-enhancement";
import {
  formatAudience,
  normalizeCampaignText,
  normalizeInput,
  normalizeOffer,
} from "@/lib/copy/input-normalization";
import type {
  BuiltCampaign,
  CampaignStrategyInput,
} from "@/lib/services/campaign-orchestrator";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { FullCampaignRecord, SaveCampaignResult } from "@/lib/types/campaign-records";
import type { CreativeAsset } from "@/lib/types/creative-assets";
import {
  normalizeCreativeStrategy,
  type CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";

const DEFAULT_PREVIEW_DIRECTION: BuilderPreviewDirection = {
  ...THEME_PRESET_LIBRARY.investor,
};

type Props = {
  initialStrategy: CampaignStrategyInput;
  initialTab?: BuilderTab;
  initialCampaignId?: string | null;
  initialCampaign?: BuiltCampaign | null;
  initialStaticAds?: StaticCreativeAsset[];
  initialCreativeStrategy?: CampaignCreativeStrategy | null;
  initialCampaignName?: string | null;
  initialSaved?: boolean;
};

type RevisionMetadata = {
  source: BuilderRevisionSource;
  label: string;
};

type ActiveVideoJob = {
  index: number;
  jobId: string;
  video: GeneratedVideoState["video"];
};

function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {children}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </label>
  );
}

function trimWords(value: string, maxWords: number) {
  const words = (value ?? "").split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}...`;
}

function createInitialStrategy(strategy?: CampaignStrategyInput): CampaignStrategyInput {
  return {
    location: strategy?.location || "",
    audience: strategy?.audience || "",
    offer: strategy?.offer || "",
    price_point: strategy?.price_point || "",
    market_type: strategy?.market_type || "buyer",
    funnel_goal: strategy?.funnel_goal || "survey",
  };
}

function buildCampaign(input?: CampaignStrategyInput | null): BuiltCampaign {
  const strategy = createInitialStrategy(input ?? undefined);
  const market = strategy.location || "your market";
  const audience = strategy.audience || "qualified prospects";
  const offer = strategy.offer || "a stronger next step";
  const cta = /seller/i.test(`${audience} ${offer}`)
    ? "Get My Sale Plan"
    : /investor/i.test(`${audience} ${offer}`)
      ? "See Matching Deals"
      : "See My Options";
  const headline = `${offer} in ${market}`;
  const primaryText = `A focused campaign for ${audience} in ${market} built around ${offer}.`;
  const staticItems = [
    ["static-direct", "Direct response static ad", "Clear offer and CTA hierarchy"],
    ["static-local", "Local expert static ad", "Market-specific trust and proof"],
    ["static-proof", "Proof-led static ad", "Simple proof point and next step"],
    ["static-native", "Native-style static ad", "Organic-feeling visual with paid-social structure"],
  ].map(([id, title, concept], index) => ({
    id,
    kind: "static",
    angle: index === 1 ? "authority" : index === 2 ? "opportunity" : "curiosity",
    format: index === 3 ? "ugc" : "montage",
    title,
    hook: headline,
    overlayText: headline,
    primaryText,
    headline,
    cta,
    score: 8.2 - (index * 0.1),
    recommended: index === 0,
    concept,
    visualDirection: `${concept} for ${audience} in ${market}`,
    imagePrompt: "",
    scriptLines: [],
    sceneDescriptions: [],
    onScreenText: [headline, cta],
    assetRefs: { imageUrl: null, videoUrl: null, thumbnailUrl: null, voiceUrl: null },
  }));
  const videoItems = [
    ["video-expert", "Local expert UGC video", "founder / local expert"],
    ["video-customer", "Customer POV UGC video", "customer / relatable UGC"],
  ].map(([id, title, creatorStyle], index) => ({
    id,
    kind: "video",
    angle: index === 0 ? "authority" : "curiosity",
    format: "ugc",
    title,
    hook: headline,
    overlayText: headline,
    primaryText,
    headline,
    cta,
    score: 8 - (index * 0.1),
    recommended: index === 0,
    concept: title,
    visualDirection: `${creatorStyle} concept for ${audience} in ${market}`,
    imagePrompt: "",
    scriptLines: [headline, primaryText, cta],
    sceneDescriptions: ["Hook", "Offer", "CTA"],
    onScreenText: [headline, cta],
    assetRefs: { imageUrl: null, videoUrl: null, thumbnailUrl: null, voiceUrl: null },
    creatorStyle,
    voiceStyle: index === 0 ? "clear and direct" : "warm and conversational",
  }));

  return {
    strategy,
    items: [...staticItems, ...videoItems],
    creatives: staticItems.map((item) => ({
      hook: item.hook,
      angle: item.angle === "authority" ? "authority" : "curiosity",
      format: item.format,
      concept: item.concept,
      visual_direction: item.visualDirection,
    })),
    copy: staticItems.map((item) => ({
      hook: item.hook,
      primary_text: item.primaryText,
      script: "",
      headline: item.headline,
      cta: item.cta,
    })),
    funnel: {
      funnel_type: strategy.funnel_goal === "lead_form" ? "landing_page_form" : strategy.funnel_goal === "book_call" ? "landing_page_book_call" : "landing_page_survey",
      headline,
      subheadline: primaryText,
      cta,
      sections: [
        {
          id: "hero",
          type: "hero",
          variant: "direct",
          title: headline,
          content: [primaryText],
          visible: true,
          style: { spacing: "comfortable", width: "content", align: "left", theme: "dark" },
        },
        {
          id: "form",
          type: "form",
          variant: "lead_capture",
          title: cta,
          content: [`Share your details to review ${offer}.`],
          visible: true,
          style: { spacing: "comfortable", width: "content", align: "left", theme: "accent" },
        },
      ],
      form_fields: ["Name", "Phone", "Email"],
      follow_up_action: "Review the lead and follow up manually.",
      optimization_notes: [],
    },
  } as BuiltCampaign;
}

function createInitialCampaign(strategy?: CampaignStrategyInput): BuiltCampaign {
  return buildCampaign(createInitialStrategy(strategy));
}

function cloneCampaignSnapshot(campaign: BuiltCampaign): BuiltCampaign {
  return structuredClone(campaign);
}

function toCopyAssistantInput(strategy: CampaignStrategyInput) {
  return {
    offer: strategy.offer,
    market: strategy.location,
    location: strategy.location,
    audience: strategy.audience,
    price_point: strategy.price_point,
    market_type: strategy.market_type,
    funnel_goal:
      strategy.funnel_goal === "lead_form" || strategy.funnel_goal === "book_call"
        ? strategy.funnel_goal
        : "survey",
  } as const;
}

function updateStrategyField(
  current: CampaignStrategyInput,
  field: keyof CampaignStrategyInput,
  value: string,
): CampaignStrategyInput {
  return {
    ...createInitialStrategy(current),
    [field]:
      field === "location" || field === "audience" || field === "offer" || field === "price_point"
        ? normalizeCampaignText({ field, value })
        : value || "",
  };
}

function applyRawStrategyField(
  current: BuiltCampaign,
  field: keyof CampaignStrategyInput,
  value: string,
): BuiltCampaign {
  return {
    ...current,
    strategy: {
      ...createInitialStrategy(current.strategy),
      [field]: value || "",
    },
  };
}

function normalizeDeferredField(
  field: "location" | "audience" | "offer",
  value: string,
) {
  const normalized = normalizeInput(value);

  if (field === "audience") {
    return formatAudience(normalized);
  }

  if (field === "offer") {
    return normalizeOffer(normalized);
  }

  return normalizeCampaignText({ field, value: normalized });
}

function TabButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function listTextToArray(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToListText(values: string[]) {
  return values.filter(Boolean).join("\n");
}

function StepRailButton({
  label,
  active,
  complete,
  href,
  onClick,
}: {
  label: string;
  active: boolean;
  complete: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = [
    "flex min-w-[124px] items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition",
    active
      ? "border-primary/30 bg-primary/10 text-primary"
      : complete
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
        : "border-white/10 bg-white/[0.03] text-white/75 hover:text-white",
  ].join(" ");

  const content = (
    <>
      <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : complete
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            : "border-white/10 bg-white/[0.04] text-white/65"
      }`}>
        {complete ? "✓" : label.slice(0, 1)}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
          {active ? "Current" : complete ? "Done" : "Next"}
        </p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function GuidedStepFooter({
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextHref,
}: {
  backLabel?: string;
  onBack?: () => void;
  nextLabel: string;
  onNext?: () => void;
  nextHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5">
      <div className="text-sm text-muted-foreground">
        The system keeps updating the live preview while you move through the flow.
      </div>
      <div className="flex flex-wrap gap-3">
        {backLabel && onBack ? (
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
        {nextHref ? (
          <Button asChild>
            <Link href={nextHref}>{nextLabel}</Link>
          </Button>
        ) : (
          <Button onClick={onNext}>{nextLabel}</Button>
        )}
      </div>
    </div>
  );
}

function FunnelLivePreview({
  headline,
  subheadline,
  cta,
  location,
}: {
  headline: string;
  subheadline: string;
  cta: string;
  location: string;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[#f5f6f8] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.68)]">
      <div className="border-b border-black/6 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
          <div className="h-3 w-3 rounded-full bg-[#ffd166]" />
          <div className="h-3 w-3 rounded-full bg-[#06d6a0]" />
        </div>
      </div>
      <div className="grid gap-0 2xl:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-black/6 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_30%),linear-gradient(180deg,#0f1722,#162233)] px-6 py-10 text-white sm:px-8 lg:border-b-0 lg:border-r lg:py-12">
          <div className="inline-flex rounded-full border border-[#ff8f3a]/30 bg-[#ff8f3a]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffb67d]">
            {(location || "your market").trim()} campaign
          </div>
          <h2 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
            {headline || location || "Campaign preview"}
          </h2>
          <p className="mt-4 max-w-[680px] text-base leading-[1.4] text-white/72">
            {subheadline || `See how this campaign will look in ${location || "your market"}.`}
          </p>
          <div className="mt-7 inline-flex rounded-full bg-[#ff8f3a] px-6 py-3 text-sm font-semibold text-[#111111]">
            {cta || "Book My Strategy Call"}
          </div>
        </div>

        <div className="bg-[#f6f2ea] px-6 py-8 text-[#111111] sm:px-8 sm:py-10">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.25)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a8276]">
              Lead form
            </p>
            <div className="mt-5 space-y-3">
              {["Name", "Phone", "Email"].map((field) => (
                <div
                  key={field}
                  className="rounded-[16px] border border-black/8 bg-[#f8f7f4] px-4 py-3 text-sm text-[#6e675e]"
                >
                  {field}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-full bg-[#111111] px-4 py-3 text-center text-sm font-semibold text-white">
              {cta || "Book My Strategy Call"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticAdPreview({
  businessName,
  overlayText,
  primaryText,
  headline,
  cta,
}: {
  businessName: string;
  overlayText: string;
  primaryText: string;
  headline: string;
  cta: string;
}) {
  const brand = businessName || "DealFlow OS";

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/8 bg-[#f7f8fb] text-[#111111] shadow-[0_24px_80px_-44px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7eefc] text-sm font-semibold text-[#315b96]">
            {brand.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{brand}</p>
            <p className="truncate text-xs text-[#6b7280]">Sponsored</p>
          </div>
        </div>
      </div>
      <div className="border-y border-black/6">
        <div className="aspect-[16/9] bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(2,6,23,0.92)),radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%),linear-gradient(135deg,#6aa0ff,#1f2937)] p-4">
          <div className="flex h-full flex-col justify-start">
            <div className="max-w-[72%] rounded-[14px] bg-black/40 px-3 py-2 shadow-sm backdrop-blur-sm">
              <p className="text-sm font-semibold leading-5 text-white">
                {trimWords(overlayText || "Get Deals Before Others", 7)}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="line-clamp-2 max-w-[680px] text-sm leading-[1.4] text-[#374151]">
          {trimWords(primaryText || overlayText || businessName, 18)}
        </p>
        <div className="flex items-center justify-between gap-4 rounded-[18px] border border-black/6 bg-white px-4 py-3 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.22)]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">
              Sponsored
            </p>
            <p className="line-clamp-2 text-sm font-semibold leading-5">{headline || overlayText || businessName}</p>
          </div>
          <div className="shrink-0 rounded-md bg-[#eef2f7] px-4 py-2 text-sm font-semibold text-[#111111]">
            {cta || "Book My Strategy Call"}
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoStoryboardPreview({
  title,
  hook,
  script,
  scenes,
  videoUrl,
}: {
  title: string;
  hook: string;
  script: string;
  scenes: string[];
  videoUrl?: string;
}) {
  const scriptLines = (script || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary/80">Storyboard</p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">Video</Badge>
      </div>
      {videoUrl ? (
        <div className="mt-4 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Video preview</p>
          <div className="mt-3 overflow-hidden rounded-[18px] border border-white/8 bg-black/30">
            <CustomerVideoPlayer
              src={videoUrl}
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              title={title}
              videoClassName="aspect-[9/16] w-full bg-black object-cover"
            />
          </div>
        </div>
      ) : null}
      <div className="mt-4 grid gap-4">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Hook</p>
          <p className="mt-2 text-sm leading-6">{hook || "See the strongest opportunity in your market."}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Script</p>
            <div className="mt-3 space-y-3">
              {scriptLines.map((line, lineIndex) => (
                <div key={`${line}-${lineIndex}`} className="rounded-[14px] bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                    Line {lineIndex + 1}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{line}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Scenes</p>
            <div className="mt-3 space-y-3">
              {scenes.slice(0, 3).map((scene, sceneIndex) => (
                <div key={`${scene}-${sceneIndex}`} className="rounded-[14px] bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                    Scene {sceneIndex + 1}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{scene}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetPreviewGrid({
  items,
}: {
  items: Array<{ title: string; subtitle: string; status: "ready" | "draft" }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={`${item.title}-${item.subtitle}`}
          className="overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.03]"
        >
          <div className="aspect-[4/3] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,#1d4ed8,#0f172a)]" />
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{item.title}</p>
              <Badge
                className={
                  item.status === "ready"
                    ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.05] text-muted-foreground"
                }
              >
                {item.status}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.height = "0px";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      className={`flex w-full resize-none overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 focus-visible:border-primary/40 focus-visible:bg-white/[0.06] ${props.className ?? ""}`}
      onInput={(event) => {
        const target = event.currentTarget;
        target.style.height = "0px";
        target.style.height = `${target.scrollHeight}px`;
        props.onInput?.(event);
      }}
    />
  );
}

function CopyAssistantPanel({
  copyAssistant,
  onGenerate,
  onApply,
  recommendedOffer,
  offerVariations,
  onSelectOfferVariation,
  onApplyAlternative,
}: {
  copyAssistant: CreativeCopyAssistantOutput | null;
  onGenerate: () => void;
  onApply: () => void;
  recommendedOffer: string;
  offerVariations: string[];
  onSelectOfferVariation: (value: string) => void;
  onApplyAlternative: (
    field: "headline" | "subheadline" | "hook" | "primaryText",
    value: string,
  ) => void;
}) {
  const recommendedHook = copyAssistant?.alternatives.hook[0] ?? null;
  const assistantCards = [
    { label: "Hook", value: copyAssistant?.hook || "Short pattern-based hook" },
    { label: "Problem", value: copyAssistant?.problem || "Clear market problem" },
    { label: "Mechanism", value: copyAssistant?.mechanism || "Why this campaign converts" },
    { label: "Offer", value: copyAssistant?.offer || "Enhanced core offer" },
    { label: "CTA", value: copyAssistant?.cta || "Strong action" },
  ];

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Creative Copy Assistant
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
            Generate launch-ready copy
          </h3>
        </div>
        <Button onClick={onGenerate}>Generate Copy</Button>
      </div>
      <div className="mt-5 w-full overflow-visible">
        <div className="space-y-4">
          {assistantCards.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-[1.5]">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      {copyAssistant ? (
        <>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Recommended offer
            </p>
            <p className="mt-2 text-lg font-semibold">{recommendedOffer}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {offerVariations.map((variation) => (
                <button
                  key={variation}
                  type="button"
                  onClick={() => onSelectOfferVariation(variation)}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold transition hover:border-primary/25 hover:bg-primary/[0.04]"
                >
                  {variation}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Recommended
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {recommendedHook ? `🔥 Recommended (Score: ${recommendedHook.score.toFixed(1)})` : "🔥 Recommended"}
                </p>
              </div>
              {recommendedHook ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-4">
                  <p>Clarity: {recommendedHook.breakdown.clarity}</p>
                  <p>Specificity: {recommendedHook.breakdown.specificity}</p>
                  <p>Offer: {recommendedHook.breakdown.offerStrength}</p>
                  <p>Direct: {recommendedHook.breakdown.directResponse}</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Why this was selected
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {copyAssistant.recommendationWhy}
            </p>
          </div>
          <div className="mt-5 w-full overflow-hidden">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: "Headline", key: "headline" as const, items: copyAssistant.alternatives.headline },
              { label: "Subheadline", key: "subheadline" as const, items: copyAssistant.alternatives.subheadline },
              { label: "Hook", key: "hook" as const, items: copyAssistant.alternatives.hook },
              { label: "Primary Text", key: "primaryText" as const, items: copyAssistant.alternatives.primaryText },
            ].map((group) => (
              <div key={group.label} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {group.label} alternatives
                </p>
                <div className="mt-3 space-y-3">
                  {group.items.slice(0, 3).map((item) => (
                    <button
                      key={`${group.label}-${item.text}`}
                      type="button"
                      onClick={() => onApplyAlternative(group.key, item.text)}
                      className="w-full rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-primary/25 hover:bg-primary/[0.04]"
                    >
                      <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
                        <p className="text-sm leading-relaxed whitespace-normal break-words">
                          {item.text}
                        </p>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        Score: {item.score.toFixed(1)}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        <p>Clarity {item.breakdown.clarity}</p>
                        <p>Specificity {item.breakdown.specificity}</p>
                        <p>Offer {item.breakdown.offerStrength}</p>
                        <p>Direct {item.breakdown.directResponse}</p>
                      </div>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-primary/75">
                        {item.reason}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      ) : null}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onApply} disabled={!copyAssistant}>
          Apply to First Ad
        </Button>
      </div>
    </Card>
  );
}

export function CampaignBuilderWorkspace({
  initialStrategy,
  initialTab = "setup",
  initialCampaignId = null,
  initialCampaign = null,
  initialStaticAds = [],
  initialCreativeStrategy = null,
  initialCampaignName = null,
  initialSaved = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<BuilderTab>(initialTab);
  const [editingMode, setEditingMode] = useState<BuilderEditingMode>("guided");
  const [previewTab, setPreviewTab] = useState<PreviewPaneTab>(
    initialTab === "creatives" ? "ads" : "funnel",
  );
  const [campaign, setCampaignState] = useState<BuiltCampaign>(() =>
    initialCampaign ? cloneCampaignSnapshot(initialCampaign) : createInitialCampaign(initialStrategy),
  );
  const [campaignRevisions, setCampaignRevisions] = useState<BuilderCampaignRevision[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState(
    initialCampaignName ??
      `${initialStrategy.location || "Local"} ${initialStrategy.offer || "Campaign"}`.trim(),
  );
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(initialCampaignId);
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [copyAssistant, setCopyAssistant] = useState<CreativeCopyAssistantOutput | null>(null);
  const [copyAssistantLoading, setCopyAssistantLoading] = useState(false);
  const [copyAssistantError, setCopyAssistantError] = useState<string | null>(null);
  const [videoGenerationIndex, setVideoGenerationIndex] = useState<number | null>(null);
  const [videoGenerationErrors, setVideoGenerationErrors] = useState<Record<number, string>>({});
  const [generatedVideos, setGeneratedVideos] = useState<Record<number, GeneratedVideoState>>({});
  const [activeVideoJob, setActiveVideoJob] = useState<ActiveVideoJob | null>(null);
  const [previewDirection, setPreviewDirection] = useState<BuilderPreviewDirection>(DEFAULT_PREVIEW_DIRECTION);
  const [aiCommand, setAiCommand] = useState("");
  const [aiCommandLoading, setAiCommandLoading] = useState(false);
  const [aiCommandError, setAiCommandError] = useState<string | null>(null);
  const [aiCommandSummary, setAiCommandSummary] = useState<string | null>(null);
  const [typingFields, setTypingFields] = useState({
    location: false,
    audience: false,
    offer: false,
  });
  const strategy = campaign.strategy;
  const [creativeStrategy, setCreativeStrategy] = useState<CampaignCreativeStrategy>(() =>
    normalizeCreativeStrategy(initialCreativeStrategy, {
      intent: strategy.market_type ?? "buyer",
      audience: strategy.audience,
      propertyType: null,
      keyOffer: strategy.offer,
      mechanism: copyAssistant?.mechanism ?? "",
      primaryGoal: campaign.funnel.headline,
      painPoints: copyAssistant?.problem ? [copyAssistant.problem] : [],
    }),
  );
  const [creativeStrategyDirty, setCreativeStrategyDirty] = useState(false);
  const recommendedOffer = enhanceOffer(strategy.offer || "", strategy.market_type ?? "buyer");
  const offerVariations = generateOfferVariations(
    strategy.offer || "",
    strategy.market_type ?? "buyer",
  );
  const previousCampaignRef = useRef(campaign);
  const pendingRevisionRef = useRef<RevisionMetadata | null>(null);
  const deferredPreviewCampaign = useDeferredValue(campaign);
  const deferredPreviewDirection = useDeferredValue(previewDirection);
  const isFunnelCanvasTab = activeTab === "funnel";
  const isCreativesStackedTab = activeTab === "creatives";

  useEffect(() => {
    if (creativeStrategyDirty) {
      return;
    }

    setCreativeStrategy(
      normalizeCreativeStrategy(initialCreativeStrategy, {
        intent: strategy.market_type ?? "buyer",
        audience: strategy.audience,
        propertyType: null,
        keyOffer: strategy.offer,
        mechanism: copyAssistant?.mechanism ?? "",
        primaryGoal: campaign.funnel.headline,
        painPoints: copyAssistant?.problem ? [copyAssistant.problem] : [],
      }),
    );
  }, [
    campaign.funnel.headline,
    copyAssistant?.mechanism,
    copyAssistant?.problem,
    creativeStrategyDirty,
    initialCreativeStrategy,
    strategy.audience,
    strategy.market_type,
    strategy.offer,
  ]);

  function getDefaultRevisionMetadata(): RevisionMetadata | null {
    if (activeTab === "funnel") {
      return { source: "manual", label: "Edited funnel" };
    }

    if (activeTab === "creatives") {
      return { source: "manual", label: "Edited creatives" };
    }

    return null;
  }

  function markRevision(source: BuilderRevisionSource, label: string) {
    pendingRevisionRef.current = { source, label };
  }

  function updateCreativeStrategyField<K extends keyof CampaignCreativeStrategy>(
    field: K,
    value: CampaignCreativeStrategy[K],
  ) {
    setCreativeStrategyDirty(true);
    setCreativeStrategy((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function replaceCampaignWithoutRevision(next: BuiltCampaign) {
    pendingRevisionRef.current = null;
    previousCampaignRef.current = next;
    setCampaignState(next);
  }

  function setCampaign(
    updater: React.SetStateAction<BuiltCampaign>,
    metadata?: RevisionMetadata | null,
  ) {
    pendingRevisionRef.current = metadata ?? pendingRevisionRef.current ?? getDefaultRevisionMetadata();
    setCampaignState(updater);
  }

  function restoreRevision(revisionId: string) {
    const revision = campaignRevisions.find((item) => item.id === revisionId);

    if (!revision) {
      return;
    }

    setCampaign(cloneCampaignSnapshot(revision.snapshot), {
      source: "manual",
      label: `Restored ${revision.label}`,
    });
  }

  useEffect(() => {
    if (previousCampaignRef.current === campaign) {
      return;
    }

    const previousSnapshot = previousCampaignRef.current;
    const metadata = pendingRevisionRef.current;

    if (metadata) {
      setCampaignRevisions((current) => [
        {
          id: `revision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          source: metadata.source,
          label: metadata.label,
          snapshot: cloneCampaignSnapshot(previousSnapshot),
        },
        ...current,
      ].slice(0, 30));
    }

    previousCampaignRef.current = campaign;
    pendingRevisionRef.current = null;
  }, [campaign]);

  async function runBuildCampaign() {
    setBuilderLoading(true);
    setBuilderError(null);

    try {
      const built = buildCampaign(strategy);
      replaceCampaignWithoutRevision(built);
      setCampaignRevisions([]);
      setCampaignName(`${strategy.location || "Local"} ${strategy.offer || "Campaign"}`.trim());
      setIsSaved(false);
      setSaveError(null);
      setActiveTab("funnel");
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : "Campaign build failed.");
    } finally {
      setBuilderLoading(false);
    }
  }

  async function handleBuildCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBuildCampaign();
  }

  async function persistCampaign() {
    setSaveLoading(true);
    setSaveError(null);
    setIsSaved(false);

    try {
      const response = await fetchWithRetry("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId: savedCampaignId,
          name: campaignName || "Untitled Campaign",
          location: campaign.strategy.location,
          audience: campaign.strategy.audience,
          offer: campaign.strategy.offer,
          price_point: campaign.strategy.price_point || "",
          market_type: campaign.strategy.market_type,
          funnel_goal: campaign.strategy.funnel_goal,
          plan: {
            intent: campaign.strategy.market_type || "buyer",
            market: campaign.strategy.location || "",
            audience: campaign.strategy.audience || "",
            creative_strategy: creativeStrategy,
          },
          funnel: campaign.funnel || {},
          creatives: campaign.creatives || [],
          campaign,
        }),
        retries: 1,
        timeoutMs: 10000,
      });

      const data = (await response.json()) as SaveCampaignResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Campaign save failed.");
      }

      const campaignId = (data as SaveCampaignResult).campaignId;
      setSavedCampaignId(campaignId);
      setIsSaved(true);
      return campaignId;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Campaign save failed.");
      throw error;
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleSaveCampaign() {
    return await persistCampaign();
  }

  async function handleGenerateCopyAssistant() {
    setCopyAssistantLoading(true);
    setCopyAssistantError(null);

    try {
      const response = await fetchWithRetry("/api/builder/copy-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toCopyAssistantInput(strategy)),
        retries: 0,
        timeoutMs: 15000,
      });

      const result = (await response.json()) as CreativeCopyAssistantOutput | { error?: string };

      if (!response.ok) {
        throw new Error("error" in result && result.error ? result.error : "Copy assistant failed.");
      }

      setCopyAssistant(result as CreativeCopyAssistantOutput);
    } catch (error) {
      setCopyAssistant(
        generateCreativeCopyAssistant({
          offer: strategy.offer,
          market: strategy.location,
          audience: strategy.audience,
          market_type: strategy.market_type,
        }),
      );
      setCopyAssistantError(
        error instanceof Error
          ? `${error.message} Falling back to the local copy engine.`
          : "Copy assistant failed. Falling back to the local copy engine.",
      );
    } finally {
      setCopyAssistantLoading(false);
    }
  }

  function applyOfferVariation(value: string) {
    setCampaign((current) => buildCampaign({ ...current.strategy, offer: value }), {
      source: "manual",
      label: "Changed offer variation",
    });
  }

  async function handleApplyAiCommand() {
    if (!aiCommand.trim()) {
      return;
    }

    setAiCommandLoading(true);
    setAiCommandError(null);

    try {
      const response = await fetchWithRetry("/api/builder/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: aiCommand,
          campaign: {
            location: campaign.strategy.location,
            audience: campaign.strategy.audience,
            offer: campaign.strategy.offer,
            headline: campaign.funnel.headline,
            subheadline: campaign.funnel.subheadline,
            cta: campaign.funnel.cta,
          },
        }),
        retries: 0,
        timeoutMs: 15000,
      });

      const result = (await response.json()) as BuilderAiCommandResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in result && result.error ? result.error : "AI command failed.");
      }

      const commandResult = result as BuilderAiCommandResult;
      setPreviewDirection(commandResult.direction || DEFAULT_PREVIEW_DIRECTION);
      setAiCommandSummary(commandResult.summary || "Applied AI-directed page changes.");
      setCampaign((current) => {
        const creativePatch = commandResult.creativePatch ?? {};
        const funnelPatch = commandResult.funnelPatch ?? {};
        const nextItems = (current.items || []).map((item) => ({
          ...item,
          visualDirection:
            creativePatch.visualDirection || item.visualDirection,
          imagePrompt: creativePatch.imagePromptAppend
            ? [item.imagePrompt, creativePatch.imagePromptAppend].filter(Boolean).join(". ")
            : item.imagePrompt,
        }));
        const nextCreatives = (current.creatives || []).map((creative) => ({
          ...creative,
          visual_direction:
            creativePatch.visualDirection || creative.visual_direction,
        }));

        return {
          ...current,
          items: nextItems,
          creatives: nextCreatives,
          funnel: {
            ...current.funnel,
            headline: funnelPatch.headline || current.funnel.headline,
            subheadline: funnelPatch.subheadline || current.funnel.subheadline,
            cta: funnelPatch.cta || current.funnel.cta,
          },
        };
      }, {
        source: "ai",
        label: "Applied AI direction",
      });
    } catch (error) {
      setAiCommandError(error instanceof Error ? error.message : "AI command failed.");
    } finally {
      setAiCommandLoading(false);
    }
  }

  function applyThemePreset(preset: BuilderThemePreset) {
    setPreviewDirection(THEME_PRESET_LIBRARY[preset]);
  }

  async function handleGenerateVideo(index: number) {
    setVideoGenerationIndex(index);
    setVideoGenerationErrors((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });

    try {
      const campaignId = savedCampaignId ?? (await persistCampaign());
      const response = await fetchWithRetry(`/api/campaigns/${campaignId}/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creativeIndex: index,
          force: true,
        }),
        retries: 0,
        timeoutMs: 45000,
      });

      const data = (await response.json()) as GeneratedVideoState | { error?: string };

      if (!response.ok) {
        const failure = data as { error?: string; code?: string };
        throw new Error(
          formatVideoWorkflowErrorMessage({
            error: failure.error,
            code: failure.code,
          }),
        );
      }

      const payload = data as Partial<GeneratedVideoState> & {
        success?: boolean;
        job?: { id?: string };
        status?: "processing" | "failed";
        url?: string;
        video?: Partial<GeneratedVideoState["video"]>;
      };

      const jobId = payload.job?.id;

      if (!jobId) {
        throw new Error("Video job was not created.");
      }

      setGeneratedVideos((current) => ({
        ...current,
        [index]: {
          asset: {} as CreativeAsset,
          status: "processing",
          videoId: jobId,
          video: {
            url: "",
            hook: payload.video?.hook || "",
            script: payload.video?.script || [],
            scenes: payload.video?.scenes || [],
          },
        },
      }));

      setActiveVideoJob({
        index,
        jobId,
        video: {
          url: "",
          hook: payload.video?.hook || "",
          script: payload.video?.script || [],
          scenes: payload.video?.scenes || [],
        },
      });
    } catch (error) {
      setVideoGenerationErrors((current) => ({
        ...current,
        [index]: error instanceof Error ? error.message : "Video generation failed.",
      }));
      setVideoGenerationIndex(null);
    }
  }

  useEffect(() => {
    if (!activeVideoJob) {
      return;
    }

    const job = activeVideoJob;
    const source = new EventSource(`/api/system-jobs/${encodeURIComponent(job.jobId)}/stream`);

    source.addEventListener("job", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        status?: "pending" | "processing" | "completed" | "failed";
        result?: {
          asset?: CreativeAsset;
          video?: { url?: string; hook?: string; script?: string[]; scenes?: string[] };
        } | null;
        error_message?: string | null;
      };

      if (payload.status === "completed") {
        setGeneratedVideos((current) => ({
          ...current,
          [job.index]: {
            asset: payload.result?.asset ?? ({} as CreativeAsset),
            status: "completed",
            videoId: job.jobId,
            video: {
              ...job.video,
              url: payload.result?.video?.url || "",
            },
          },
        }));
        setVideoGenerationIndex(null);
        setActiveVideoJob(null);
        source.close();
        return;
      }

      if (payload.status === "failed") {
        setVideoGenerationErrors((current) => ({
          ...current,
          [job.index]: payload.error_message || "Video generation failed.",
        }));
        setGeneratedVideos((current) => ({
          ...current,
          [job.index]: {
            asset: payload.result?.asset ?? ({} as CreativeAsset),
            status: "failed",
            videoId: job.jobId,
            video: job.video,
          },
        }));
        setVideoGenerationIndex(null);
        setActiveVideoJob(null);
        source.close();
      }
    });

    source.addEventListener("error", () => {
      setVideoGenerationErrors((current) => ({
        ...current,
        [job.index]: "Video status stream failed.",
      }));
      setVideoGenerationIndex(null);
      setActiveVideoJob(null);
      source.close();
    });

    return () => {
      source.close();
    };
  }, [activeVideoJob]);

  function buildAssistantPrimaryText(assistant: CreativeCopyAssistantOutput) {
    return [assistant.problem, assistant.mechanism, assistant.offer, assistant.cta].join("\n");
  }

  function applyAssistantOutput(output: CreativeCopyAssistantOutput, targetIndex = 0) {
    setCampaign((current) => {
      const assistantScript = [output.hook, output.problem, output.mechanism, output.offer, output.cta]
        .map((line) => (line || "").trim())
        .filter((line) => line.length > 3)
        .join("\n");
      const nextCreatives = current.creatives.map((item, itemIndex) =>
        itemIndex === targetIndex ? { ...item, hook: output.hook } : item,
      );
      const nextItems = current.items.map((item, itemIndex) =>
        itemIndex === targetIndex
          ? {
              ...item,
              hook: output.hook,
              overlayText: output.hook,
              primaryText: buildAssistantPrimaryText(output),
              headline: output.headline,
              cta: output.cta,
              scriptLines: [output.hook, output.problem, output.mechanism, output.offer, output.cta]
                .filter((line) => (line || "").trim().length > 0),
            }
          : item,
      );
      const nextCopy = current.copy.map((item, itemIndex) =>
        itemIndex === targetIndex
          ? {
              ...item,
              headline: output.headline,
              primary_text: buildAssistantPrimaryText(output),
              cta: output.cta,
              hook: output.hook,
              script: assistantScript,
            }
          : item,
      );

      return {
        ...current,
        funnel: {
          ...current.funnel,
          headline: output.headline,
          subheadline: output.subheadline,
          cta: output.cta,
        },
        items: nextItems,
        creatives: nextCreatives,
        copy: nextCopy,
      };
    }, {
      source: "ai",
      label: "Applied AI copy revision",
    });
  }

  function applyAssistantToStaticAd(targetIndex: number) {
    if (!copyAssistant) {
      return;
    }

    applyAssistantOutput(copyAssistant, targetIndex);
  }

  function applyAssistantAlternative(
    field: "headline" | "subheadline" | "hook" | "primaryText",
    value: string,
  ) {
    setCampaign((current) => {
      if (field === "hook") {
        return {
          ...current,
          items: current.items.map((item, index) =>
            index === 0 ? { ...item, hook: value, overlayText: value } : item,
          ),
          creatives: current.creatives.map((item, index) =>
            index === 0 ? { ...item, hook: value } : item,
          ),
        };
      }

      if (field === "headline") {
        return {
          ...current,
          funnel: { ...current.funnel, headline: value },
          items: current.items.map((item, index) =>
            index === 0 ? { ...item, headline: value, title: value } : item,
          ),
          copy: current.copy.map((item, index) =>
            index === 0 ? { ...item, headline: value } : item,
          ),
        };
      }

      if (field === "subheadline") {
        return {
          ...current,
          funnel: { ...current.funnel, subheadline: value },
        };
      }

      return {
        ...current,
        items: current.items.map((item, index) =>
          index === 0
            ? {
                ...item,
                primaryText: value,
                scriptLines: value.split(/\n+/).map((line) => line.trim()).filter(Boolean),
              }
            : item,
        ),
        copy: current.copy.map((item, index) =>
          index === 0 ? { ...item, primary_text: value } : item,
        ),
      };
    }, {
      source: "ai",
      label: "Applied AI alternative",
    });
  }

  const {
    staticAdRows,
    videoRows,
    previewHeadline,
    previewSubheadline,
    previewCta,
    previewAds,
    previewVideos,
    previewAssets,
  } = useBuilderPreviewModel(deferredPreviewCampaign, recommendedOffer, {
    savedStaticAds: initialStaticAds,
    generatedVideos,
  });

  useEffect(() => {
    setPreviewTab(activeTab === "creatives" ? "ads" : "funnel");
  }, [activeTab]);

  useEffect(() => {
    if (!typingFields.location) {
      return;
    }

    const timeout = setTimeout(() => {
      replaceCampaignWithoutRevision(
        buildCampaign({
          ...campaign.strategy,
          location: normalizeDeferredField("location", campaign.strategy.location || ""),
        }),
      );
      setTypingFields((current) => ({ ...current, location: false }));
    }, 600);

    return () => clearTimeout(timeout);
  }, [campaign.strategy, strategy.location, typingFields.location]);

  useEffect(() => {
    if (!typingFields.audience) {
      return;
    }

    const timeout = setTimeout(() => {
      replaceCampaignWithoutRevision(
        buildCampaign({
          ...campaign.strategy,
          audience: normalizeDeferredField("audience", campaign.strategy.audience || ""),
        }),
      );
      setTypingFields((current) => ({ ...current, audience: false }));
    }, 600);

    return () => clearTimeout(timeout);
  }, [campaign.strategy, strategy.audience, typingFields.audience]);

  useEffect(() => {
    if (!typingFields.offer) {
      return;
    }

    const timeout = setTimeout(() => {
      replaceCampaignWithoutRevision(
        buildCampaign({
          ...campaign.strategy,
          offer: normalizeDeferredField("offer", campaign.strategy.offer || ""),
        }),
      );
      setTypingFields((current) => ({ ...current, offer: false }));
    }, 600);

    return () => clearTimeout(timeout);
  }, [campaign.strategy, strategy.offer, typingFields.offer]);

  const guidedSteps: Array<{
    key: GuidedStep;
    label: string;
    href?: string;
  }> = [
    { key: "setup", label: "Campaign Setup" },
    { key: "funnel", label: "Funnel" },
    { key: "creatives", label: "Creatives" },
    {
      key: "review",
      label: "Review",
      href: savedCampaignId ? `/preview?campaignId=${encodeURIComponent(savedCampaignId)}` : "/preview",
    },
    {
      key: "go-live",
      label: "Launch",
      href: savedCampaignId ? `/launch?campaignId=${encodeURIComponent(savedCampaignId)}` : "/launch",
    },
  ];
  const currentGuidedIndex =
    activeTab === "setup" ? 0 : activeTab === "funnel" ? 1 : 2;
  const stepMicrocopy =
    activeTab === "setup"
      ? "Set the offer, market, and audience."
      : activeTab === "funnel"
        ? "Make the landing page offer obvious."
        : "Review the creative set and move to preview.";

  useEffect(() => {
    const nextAssistant = generateCreativeCopyAssistant(toCopyAssistantInput(strategy));

    setCopyAssistant(nextAssistant);
    if (
      campaign.funnel.headline === nextAssistant.headline &&
      campaign.funnel.subheadline === nextAssistant.subheadline &&
      campaign.funnel.cta === nextAssistant.cta
    ) {
      return;
    }

    replaceCampaignWithoutRevision({
      ...campaign,
      funnel: {
        ...campaign.funnel,
        headline: nextAssistant.headline,
        subheadline: nextAssistant.subheadline,
        cta: nextAssistant.cta,
      },
    });
  }, [campaign, strategy]);

  return (
    <div className="space-y-5">
      {activeTab === "funnel" ? (
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Campaign Setup
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
              Guided setup stays on by default
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/68">
              Use the guided flow for the standard setup path. Switch on detailed editing only when you want full section-by-section changes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={editingMode === "guided" ? "border-primary/15 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.03] text-white/65"}>
              {editingMode === "guided" ? "Guided setup active" : "Detailed editing active"}
            </Badge>
            <Button
              type="button"
              variant={editingMode === "advanced" ? "default" : "secondary"}
              onClick={() =>
                setEditingMode((current) => (current === "advanced" ? "guided" : "advanced"))
              }
            >
              {editingMode === "advanced" ? "Return to Guided" : "Detailed editing"}
            </Button>
          </div>
        </div>
      </Card>
      ) : null}

      <CreativeStrategySummary
        strategy={creativeStrategy}
        title="Campaign direction"
        description={
          editingMode === "advanced"
            ? "Detailed editing shows the deeper strategy fields driving the messaging and creative direction."
            : "Guided setup keeps the strategy concise so the direction stays clear without extra detail."
        }
        detailed={editingMode === "advanced"}
        compact
      />

      {editingMode === "advanced" ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Campaign details
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                Refine the campaign direction directly
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/68">
                These controls only affect detailed editing. Guided setup keeps this layer concise and mostly read-only.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {creativeStrategyDirty ? (
                <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                  Custom strategy edits
                </Badge>
              ) : (
                <Badge className="border-white/10 bg-white/[0.03] text-white/65">
                  Using saved campaign direction
                </Badge>
              )}
              {creativeStrategyDirty ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCreativeStrategy(
                      normalizeCreativeStrategy(initialCreativeStrategy, {
                        intent: strategy.market_type ?? "buyer",
                        audience: strategy.audience,
                        propertyType: null,
                        keyOffer: strategy.offer,
                        mechanism: copyAssistant?.mechanism ?? "",
                        primaryGoal: campaign.funnel.headline,
                        painPoints: copyAssistant?.problem ? [copyAssistant.problem] : [],
                      }),
                    );
                    setCreativeStrategyDirty(false);
                  }}
                >
                  Reset direction
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Campaign category
              </span>
              <select
                value={creativeStrategy.campaignCategory}
                onChange={(event) =>
                  updateCreativeStrategyField("campaignCategory", event.target.value as CampaignCreativeStrategy["campaignCategory"])
                }
                className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-foreground outline-none transition focus:border-primary/30 focus:bg-white/[0.06]"
              >
                {["buyer", "seller", "investor", "commercial", "precon", "luxury"].map((option) => (
                  <option key={option} value={option} className="bg-[#0b1220] text-white">
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Trigger condition
              </span>
              <Input
                value={creativeStrategy.triggerCondition}
                onChange={(event) => updateCreativeStrategyField("triggerCondition", event.target.value)}
                placeholder="What moment or situation creates the demand?"
              />
            </label>

            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Internal tension
              </span>
              <AutoTextarea
                value={creativeStrategy.internalTension}
                onChange={(event) => updateCreativeStrategyField("internalTension", event.target.value)}
                placeholder="What is the real hesitation, fear, or uncertainty in the prospect’s head?"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Mechanism
              </span>
              <Input
                value={creativeStrategy.mechanism}
                onChange={(event) => updateCreativeStrategyField("mechanism", event.target.value)}
                placeholder="Name the system or process"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Proof style
              </span>
              <Input
                value={creativeStrategy.proofStyle}
                onChange={(event) => updateCreativeStrategyField("proofStyle", event.target.value)}
                placeholder="What proof reduces uncertainty?"
              />
            </label>

            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Overlay style
              </span>
              <AutoTextarea
                value={arrayToListText(creativeStrategy.overlayStyle)}
                onChange={(event) => updateCreativeStrategyField("overlayStyle", listTextToArray(event.target.value))}
                placeholder="One overlay rule per line"
              />
            </label>

            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Visual logic
              </span>
              <AutoTextarea
                value={arrayToListText(creativeStrategy.visualLogic)}
                onChange={(event) => updateCreativeStrategyField("visualLogic", listTextToArray(event.target.value))}
                placeholder="One visual direction per line"
              />
            </label>

            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Compliance notes
              </span>
              <AutoTextarea
                value={arrayToListText(creativeStrategy.complianceNotes)}
                onChange={(event) => updateCreativeStrategyField("complianceNotes", listTextToArray(event.target.value))}
                placeholder="Add guardrails or claim warnings, one per line"
              />
            </label>
          </div>
        </Card>
      ) : null}

      <BuilderNavigation
        activeTab={activeTab}
        editingMode={editingMode}
        currentGuidedIndex={currentGuidedIndex}
        guidedSteps={guidedSteps}
        stepMicrocopy={stepMicrocopy}
        setActiveTab={setActiveTab}
        setEditingMode={setEditingMode}
        showEditingModeToggle={false}
      />

      {activeTab === "funnel" ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Page direction
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                Describe how you want this page to feel
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/68">
                Type requests like “make this black and red, cinematic, and more luxury” or “make the funnel feel more investor-grade and editorial.”
              </p>
            </div>
            <div className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Guided help
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              value={aiCommand}
              onChange={(event) => setAiCommand(event.target.value)}
              rows={3}
              placeholder="Make it black and red, cinematic, premium, and feel like a luxury investor landing page."
              className="min-h-[108px] w-full resize-none rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/30 focus:bg-white/[0.06]"
            />
            <div className="flex flex-col gap-3">
              <Button onClick={() => void handleApplyAiCommand()} disabled={aiCommandLoading || !aiCommand.trim()}>
                {aiCommandLoading ? "Applying..." : "Apply AI Direction"}
              </Button>
            </div>
          </div>
          {aiCommandSummary ? (
            <p className="mt-4 text-sm leading-6 text-primary/85">{aiCommandSummary}</p>
          ) : null}
          {aiCommandError ? <p className="mt-4 text-sm text-rose-300">{aiCommandError}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {previewDirection.designNotes.map((note) => (
              <Badge key={note} className="border-white/10 bg-white/[0.05] text-white/80">
                {note}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      <div
        className={[
          "grid h-full min-h-[640px] w-full overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.02] 2xl:h-[calc(100vh-13rem)] 2xl:min-h-[760px]",
          isFunnelCanvasTab
            ? "grid-cols-1 2xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]"
            : isCreativesStackedTab
              ? "grid-cols-1 2xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]"
            : "grid-cols-1 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]",
        ].join(" ")}
      >
        {isFunnelCanvasTab ? (
          <>
            <div className="min-w-0 overflow-hidden px-4 py-5 xl:px-5 xl:py-6">
              <div className="h-full overflow-y-auto pr-2 xl:pr-4">
                <BuilderPreviewPanel
                  previewTab={previewTab}
                  setPreviewTab={setPreviewTab}
                  campaign={deferredPreviewCampaign}
                  creativeStrategy={creativeStrategy}
                  showCreativeQa={editingMode === "advanced"}
                  previewHeadline={previewHeadline}
                  previewSubheadline={previewSubheadline}
                  previewCta={previewCta}
                  previewAds={previewAds}
                  previewVideos={previewVideos}
                  previewAssets={previewAssets}
                  previewDirection={deferredPreviewDirection}
                />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden border-t border-white/10 px-4 py-5 2xl:border-t-0 2xl:border-l 2xl:border-white/10 xl:px-5 xl:py-6">
              <div className="h-full overflow-y-auto pr-1 xl:pr-2">
                <BuilderFunnelPanel
                  campaign={campaign}
                  editingMode={editingMode}
                  previewDirection={previewDirection}
                  onApplyThemePreset={applyThemePreset}
                  onMarkRevision={markRevision}
                  savedCampaignId={savedCampaignId}
                  ensureSavedCampaign={persistCampaign}
                  setCampaign={setCampaign}
                  setActiveTab={setActiveTab}
                />
              </div>
            </div>
          </>
        ) : isCreativesStackedTab ? (
          <>
            <div className="min-w-0 overflow-hidden px-5 py-5 xl:px-6 xl:py-6">
              <div className="h-full overflow-y-auto pr-1 xl:pr-2">
                <BuilderCreativesPanel
                  campaign={campaign}
                  campaignName={campaignName}
                  setCampaignName={setCampaignName}
                  copyAssistant={copyAssistant}
                  copyAssistantLoading={copyAssistantLoading}
                  copyAssistantError={copyAssistantError}
                  recommendedOffer={recommendedOffer}
                  offerVariations={offerVariations}
                  staticAdRows={staticAdRows}
                  videoRows={videoRows}
                  generatedVideos={generatedVideos}
                  videoGenerationErrors={videoGenerationErrors}
                  videoGenerationIndex={videoGenerationIndex}
                  saveLoading={saveLoading}
                  saveError={saveError}
                  isSaved={isSaved}
                  savedCampaignId={savedCampaignId}
                  toCopyAssistantInput={toCopyAssistantInput}
                  handleGenerateCopyAssistant={handleGenerateCopyAssistant}
                  applyAssistantToStaticAd={applyAssistantToStaticAd}
                  applyOfferVariation={applyOfferVariation}
                  applyAssistantAlternative={applyAssistantAlternative}
                  handleGenerateVideo={handleGenerateVideo}
                  handleSaveCampaign={handleSaveCampaign}
                  setActiveTab={setActiveTab}
                  setCampaign={setCampaign}
                />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden border-t border-white/10 px-4 py-5 2xl:border-t-0 2xl:border-l 2xl:border-white/10 xl:px-5 xl:py-6">
              <BuilderPreviewPanel
                previewTab={previewTab}
                setPreviewTab={setPreviewTab}
                campaign={deferredPreviewCampaign}
                creativeStrategy={creativeStrategy}
                showCreativeQa={editingMode === "advanced"}
                previewHeadline={previewHeadline}
                previewSubheadline={previewSubheadline}
                previewCta={previewCta}
                previewAds={previewAds}
                previewVideos={previewVideos}
                previewAssets={previewAssets}
                previewDirection={deferredPreviewDirection}
              />
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 overflow-hidden px-5 py-5 xl:px-6 xl:py-6">
              <div className="h-full overflow-y-auto pr-3">
                {activeTab === "setup" ? (
                  <BuilderSetupPanel
                    strategy={strategy}
                    builderError={builderError}
                    builderLoading={builderLoading}
                    setTypingFields={setTypingFields}
                    setCampaign={setCampaign}
                    onBuildCampaign={handleBuildCampaign}
                    onBuildCampaignAction={() => void runBuildCampaign()}
                    setActiveTab={setActiveTab}
                  />
                ) : null}

              </div>
            </div>

            <div className="min-w-0 overflow-hidden border-t border-white/10 px-4 py-5 2xl:border-t-0 2xl:border-l 2xl:border-white/10 xl:px-5 xl:py-6">
              <BuilderPreviewPanel
                previewTab={previewTab}
                setPreviewTab={setPreviewTab}
                campaign={deferredPreviewCampaign}
                creativeStrategy={creativeStrategy}
                showCreativeQa={editingMode === "advanced"}
                previewHeadline={previewHeadline}
                previewSubheadline={previewSubheadline}
                previewCta={previewCta}
                previewAds={previewAds}
                previewVideos={previewVideos}
                previewAssets={previewAssets}
                previewDirection={deferredPreviewDirection}
              />
            </div>
          </>
        )}
      </div>

      <CampaignPublishPanel
        campaignId={savedCampaignId}
        campaignName={
          campaignName ||
          `${campaign.strategy.location || "Local"} ${campaign.strategy.offer || "Campaign"}`.trim()
        }
      />

      <Card className="p-0">
        <details className="group p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Version History
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              Restore earlier versions
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/68">
              Open only when you need to roll back a saved revision.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="border-white/10 bg-white/[0.05] text-white/78">
              {campaignRevisions.length} revisions
            </Badge>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58">
              <span className="group-open:hidden">Open</span>
              <span className="hidden group-open:inline">Close</span>
            </span>
          </div>
          </summary>
        {campaignRevisions.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {campaignRevisions.slice(0, 8).map((revision) => (
              <div
                key={revision.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{revision.label}</p>
                    <Badge
                      className={
                        revision.source === "ai"
                          ? "border-primary/15 bg-primary/[0.08] text-primary"
                          : "border-white/10 bg-white/[0.05] text-white/72"
                      }
                    >
                      {revision.source === "ai" ? "AI" : "Manual"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-white/58">
                    {new Date(revision.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => restoreRevision(revision.id)}>
                  Restore version
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6">
            <p className="text-sm font-semibold">No revisions yet</p>
            <p className="mt-2 text-sm leading-6 text-white/58">
              Start editing the funnel or creatives and the builder will automatically create restorable versions.
            </p>
          </div>
        )}
        </details>
      </Card>
    </div>
  );
}
