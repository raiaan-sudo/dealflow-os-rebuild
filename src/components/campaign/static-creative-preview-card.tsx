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
  imageGenerationState?: "generated" | "generating" | "unavailable" | "failed" | string | null;
  imageGenerationMessage?: string | null;
  overlayText?: string | null;
  score?: number | null;
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
  visualPromptBrief?: {
    category?: CampaignCategory | string | null;
    proofStyle?: string | null;
    mechanism?: string | null;
    visualLogic?: string[] | null;
    overlayLogic?: string[] | null;
  } | null;
  selectedCount?: number | null;
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
  imageGenerationState,
  imageGenerationMessage,
  overlayText,
  score,
  qualityGate,
  visualPromptBrief,
  selectedCount,
  className,
  compact = false,
}: StaticCreativePreviewCardProps) {
  const safeHeadline = headline || offer || "Campaign creative";
  const safeCta = cta || "Learn More";
  const safeOffer = offer || safeHeadline;

  return (
    <div className={cn("overflow-hidden rounded-df-card border border-white/10 bg-black/20", className)}>
      <StaticAdComposedPreview
        category={category}
        compact={compact}
        cta={safeCta}
        headline={safeHeadline}
        imageGenerationMessage={imageGenerationMessage}
        imageGenerationState={imageGenerationState}
        imageUrl={imageUrl}
        location={location}
        offer={safeOffer}
        overlayText={overlayText}
        primaryText={primaryText}
        qualityGate={qualityGate}
        score={score}
        selectedCount={selectedCount}
        showRawAssetState={!compact}
        visualPromptBrief={visualPromptBrief}
      />
      <div className={cn("space-y-4", compact ? "p-3" : "p-6")}>
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
      </div>
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
  imageGenerationState,
  imageGenerationMessage,
  overlayText,
  score,
  qualityGate,
  visualPromptBrief,
  selectedCount,
  className,
  angleLabel,
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
          imageUrl={imageUrl}
          location={location}
          offer={safeOffer}
          overlayText={overlayText}
          primaryText={primaryText}
          qualityGate={qualityGate}
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
