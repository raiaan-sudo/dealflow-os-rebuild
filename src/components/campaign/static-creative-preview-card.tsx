import { cn } from "@/lib/utils";

type StaticCreativePreviewCardProps = {
  headline: string;
  primaryText: string;
  cta?: string | null;
  offer?: string | null;
  imageUrl?: string | null;
  imageGenerationState?: "generated" | "generating" | "unavailable" | "failed" | string | null;
  imageGenerationMessage?: string | null;
  overlayText?: string | null;
  className?: string;
  compact?: boolean;
};

function statusLabel(state: StaticCreativePreviewCardProps["imageGenerationState"]) {
  if (state === "generated") {
    return "Generated image";
  }

  if (state === "generating") {
    return "Image generating";
  }

  if (state === "failed") {
    return "Image generation failed";
  }

  return "Draft visual";
}

export function StaticCreativePreviewCard({
  headline,
  primaryText,
  cta,
  offer,
  imageUrl,
  imageGenerationState,
  imageGenerationMessage,
  overlayText,
  className,
  compact = false,
}: StaticCreativePreviewCardProps) {
  const hasImage = Boolean(imageUrl);
  const status = statusLabel(hasImage ? "generated" : imageGenerationState);
  const safeHeadline = headline || offer || "Campaign creative";
  const safeCta = cta || "Learn More";
  const safeOffer = offer || safeHeadline;
  const displayOverlay = overlayText || safeOffer;

  return (
    <div className={cn("overflow-hidden rounded-df-card border border-white/10 bg-black/20", className)}>
      {hasImage ? (
        <div
          aria-label={safeHeadline}
          className={cn("w-full bg-cover bg-center", compact ? "aspect-[4/3]" : "aspect-[16/9]")}
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      ) : (
        <div
          className={cn(
            "relative flex w-full overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#102033_48%,#0d3328_100%)]",
            compact ? "aspect-[4/3]" : "aspect-[16/9]",
          )}
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px] opacity-25" />
          <div className="absolute right-4 top-4 rounded-full border border-emerald-200/30 bg-emerald-200/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-50">
            {status}
          </div>
          <div className="relative z-10 mt-auto w-full p-5">
            <div className="max-w-[78%] rounded-2xl border border-white/15 bg-black/58 p-4 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/80">
                {safeCta}
              </p>
              <p className="mt-2 whitespace-pre-line text-xl font-black leading-tight tracking-normal text-white">
                {displayOverlay}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className={cn("space-y-4", compact ? "p-4" : "p-6")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {status}
          </span>
          {!hasImage && imageGenerationMessage ? (
            <span className="text-xs text-muted-foreground">{imageGenerationMessage}</span>
          ) : null}
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Headline</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{safeHeadline}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Primary Text</p>
          <p className="mt-1 text-sm leading-7 text-foreground">{primaryText || safeOffer}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">CTA</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{safeCta}</p>
        </div>
      </div>
    </div>
  );
}
