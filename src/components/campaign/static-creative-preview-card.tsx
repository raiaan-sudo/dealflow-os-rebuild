"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StaticAdComposedPreview } from "@/components/campaign/static-ad-composed-preview";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

type StaticCreativePreviewCardProps = {
  headline: string;
  primaryText: string;
  cta?: string | null;
  offer?: string | null;
  category?: CampaignCategory | string | null;
  location?: string | null;
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  imageGenerationState?: "generated" | "generating" | "unavailable" | "failed" | string | null;
  imageGenerationMessage?: string | null;
  imagePrompt?: string | null;
  imagePromptConfig?: {
    prompt?: string | null;
    negativePrompt?: string | null;
  } | null;
  overlayText?: string | null;
  score?: number | null;
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
  imageQa?: {
    usable?: boolean | null;
    decision?: "accept" | "reject" | "review" | string | null;
    mode?: string | null;
    reasons?: string[] | null;
    textDensity?: number | null;
    layoutRisk?: number | null;
    detectedTextSamples?: string[] | null;
  } | null;
  visualPromptBrief?: {
    category?: CampaignCategory | string | null;
    visualAssetContract?: string | null;
    visualAssetRole?: string | null;
    proofStyle?: string | null;
    mechanism?: string | null;
    visualLogic?: string[] | null;
    overlayLogic?: string[] | null;
  } | null;
  selectedCount?: number | null;
  formatLabel?: string | null;
  className?: string;
  compact?: boolean;
};

export function StaticCreativePreviewCard({
  headline,
  primaryText,
  cta,
  offer,
  category,
  location,
  imageUrl,
  storageNormalized,
  imageGenerationState,
  imageGenerationMessage,
  imagePrompt,
  imagePromptConfig,
  overlayText,
  score,
  qualityGate,
  imageQa,
  visualPromptBrief,
  selectedCount,
  formatLabel,
  className,
  compact = false,
}: StaticCreativePreviewCardProps) {
  const safeHeadline = headline || offer || "Campaign creative";
  const safeCta = cta || "Learn More";
  const safeOffer = offer || safeHeadline;
  const [fullCreativeOpen, setFullCreativeOpen] = useState(false);

  return (
    <div className={cn("overflow-hidden rounded-df-card border border-white/10 bg-black/20", className)}>
      <StaticAdComposedPreview
        category={category}
        compact={compact}
        cta={safeCta}
        headline={safeHeadline}
        imageGenerationMessage={imageGenerationMessage}
        imageGenerationState={imageGenerationState}
        imagePrompt={imagePrompt}
        imagePromptConfig={imagePromptConfig}
        imageUrl={imageUrl}
        storageNormalized={storageNormalized}
        location={location}
        offer={safeOffer}
        overlayText={overlayText}
        primaryText={primaryText}
        qualityGate={qualityGate}
        imageQa={imageQa}
        score={score}
        selectedCount={selectedCount}
        showRawAssetState={!compact}
        visualPromptBrief={visualPromptBrief}
      />
      <div className={cn("space-y-4", compact ? "p-3" : "p-6")}>
        {!compact ? (
          <button
            type="button"
            className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10"
            onClick={() => setFullCreativeOpen(true)}
          >
            View full creative
          </button>
        ) : null}
        {formatLabel ? (
          <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
            {formatLabel}
          </span>
        ) : null}
        <div>
          <p className="text-sm font-medium text-muted-foreground">Headline</p>
          <p className={cn("mt-1 font-semibold text-foreground", compact ? "line-clamp-2 text-sm leading-5" : "text-lg")}>
            {safeHeadline}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Primary Text</p>
          <p className={cn("mt-1 text-sm text-foreground", compact ? "line-clamp-3 leading-5" : "leading-7")}>
            {primaryText || safeOffer}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">CTA</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{safeCta}</p>
        </div>
        {!compact ? (
          <p className="rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.055] px-3 py-2 text-xs leading-5 text-cyan-100">
            Full-resolution creative files stay inside DealFlow and are used through the launch workflow.
          </p>
        ) : null}
      </div>
      {fullCreativeOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          role="dialog"
          onClick={() => setFullCreativeOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-[920px] overflow-y-auto rounded-[20px] border border-white/12 bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Full creative
                </p>
                <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{safeHeadline}</h3>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10"
                onClick={() => setFullCreativeOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <StaticAdComposedPreview
                category={category}
                cta={safeCta}
                headline={safeHeadline}
                imageGenerationMessage={imageGenerationMessage}
                imageGenerationState={imageGenerationState}
                imagePrompt={imagePrompt}
                imagePromptConfig={imagePromptConfig}
                imageUrl={imageUrl}
                storageNormalized={storageNormalized}
                location={location}
                offer={safeOffer}
                overlayText={overlayText}
                primaryText={primaryText}
                qualityGate={qualityGate}
                imageQa={imageQa}
                score={score}
                selectedCount={selectedCount}
                showRawAssetState
                visualPromptBrief={visualPromptBrief}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type StaticCreativeSummaryCardProps = StaticCreativePreviewCardProps & {
  angleLabel?: string | null;
  selected?: boolean;
  index?: number;
};

export function StaticCreativeSummaryCard({
  headline,
  primaryText,
  cta,
  offer,
  category,
  location,
  imageUrl,
  storageNormalized,
  imageGenerationState,
  imageGenerationMessage,
  imagePrompt,
  imagePromptConfig,
  overlayText,
  score,
  qualityGate,
  imageQa,
  visualPromptBrief,
  selectedCount,
  className,
  angleLabel,
  formatLabel,
  selected = false,
  index,
}: StaticCreativeSummaryCardProps) {
  const safeHeadline = headline || offer || "Campaign creative";
  const safeCta = cta || "Learn More";
  const safeOffer = offer || safeHeadline;
  const resolvedAngle =
    angleLabel ||
    visualPromptBrief?.mechanism ||
    visualPromptBrief?.proofStyle ||
    (category ? String(category).replaceAll("_", " ") : "Creative angle");

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 rounded-df-card border bg-black/18 p-3 transition",
        selected ? "border-primary/35 bg-primary/[0.08]" : "border-white/10",
        "sm:grid-cols-[112px_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="min-w-0 overflow-hidden rounded-[14px] border border-white/10 bg-black/24">
        <StaticAdComposedPreview
          category={category}
          compact
          cta={safeCta}
          headline={safeHeadline}
          imageGenerationMessage={imageGenerationMessage}
          imageGenerationState={imageGenerationState}
          imagePrompt={imagePrompt}
          imagePromptConfig={imagePromptConfig}
          imageUrl={imageUrl}
          storageNormalized={storageNormalized}
          location={location}
          offer={safeOffer}
          overlayText={overlayText}
          primaryText={primaryText}
          qualityGate={qualityGate}
          imageQa={imageQa}
          score={score}
          selectedCount={selectedCount}
          showRawAssetState={false}
          visualPromptBrief={visualPromptBrief}
        />
      </div>
      <div className="min-w-0 self-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {typeof index === "number" ? `Creative ${index + 1}` : "Creative"}
          </span>
          <span className="min-w-0 truncate rounded-full border border-cyan-300/16 bg-cyan-300/[0.055] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
            {resolvedAngle}
          </span>
          {typeof score === "number" ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/62">
              {score.toFixed(1)}/10
            </span>
          ) : null}
          {formatLabel ? (
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
              {formatLabel}
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {safeHeadline}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {primaryText || safeOffer}
        </p>
        <p className="mt-2 text-xs font-semibold text-primary">CTA: {safeCta}</p>
      </div>
    </div>
  );
}
