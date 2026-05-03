import { cn } from "@/lib/utils";
import { StaticAdComposedPreview } from "@/components/campaign/static-ad-composed-preview";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import { buildOfferFirstBody, buildOfferFirstHeadline } from "@/lib/copy/offer-consistency";

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
  const displayHeadline = buildOfferFirstHeadline({
    headline: safeHeadline,
    offer: safeOffer,
    market: location,
  }) || safeHeadline;
  const displayPrimaryText = buildOfferFirstBody({
    body: primaryText,
    offer: safeOffer,
  }) || safeOffer;

  return (
    <div className={cn("overflow-hidden rounded-df-card border border-white/10 bg-black/20", className)}>
      <StaticAdComposedPreview
        category={category}
        compact={compact}
        cta={safeCta}
        headline={displayHeadline}
        imageGenerationMessage={imageGenerationMessage}
        imageGenerationState={imageGenerationState}
        imageUrl={imageUrl}
        location={location}
        offer={safeOffer}
        overlayText={buildOfferFirstHeadline({ headline: overlayText || safeHeadline, offer: safeOffer, market: location })}
        primaryText={displayPrimaryText}
        qualityGate={qualityGate}
        score={score}
        selectedCount={selectedCount}
        showRawAssetState={!compact}
        visualPromptBrief={visualPromptBrief}
      />
      <div className={cn("space-y-4", compact ? "p-4" : "p-6")}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Headline</p>
          <p className="mt-1 line-clamp-3 text-base font-semibold leading-6 text-foreground">{displayHeadline}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Primary Text</p>
          <p className="mt-1 line-clamp-4 text-sm leading-6 text-foreground">{displayPrimaryText}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">CTA</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{safeCta}</p>
        </div>
      </div>
    </div>
  );
}
