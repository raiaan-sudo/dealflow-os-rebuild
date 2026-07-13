"use client";

import Image from "next/image";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { cn } from "@/lib/utils";
import {
  buildComposedStaticAdPreview,
  type StaticAdTemplateInput,
} from "@/lib/services/static-ad-template-renderer";

type StaticAdComposedPreviewProps = StaticAdTemplateInput & {
  className?: string;
  compact?: boolean;
  selectedCount?: number | null;
  showRawAssetState?: boolean;
};

type ProductTranslator = ReturnType<typeof useProductI18n>["t"];

function statusLabel(
  status: ReturnType<typeof buildComposedStaticAdPreview>["status"],
  t: ProductTranslator,
) {
  if (status === "final_composed") return t("creativePreview.status.final");
  if (status === "background_generating") return t("creativePreview.status.generating");
  if (status === "background_failed") return t("creativePreview.status.failed");
  return t("creativePreview.status.template");
}

function qualityLabel(
  preview: ReturnType<typeof buildComposedStaticAdPreview>,
  t: ProductTranslator,
) {
  if (typeof preview.qualityScore !== "number") {
    return t("creativePreview.qualityPending");
  }

  const score = preview.qualityScore.toFixed(1);
  if (preview.qualityAccepted === false) {
    return t("creativePreview.needsWork", { score });
  }

  return t("creativePreview.quality", { score });
}

function backgroundClass(category: ReturnType<typeof buildComposedStaticAdPreview>["category"]) {
  if (category === "seller") {
    return "bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.72),transparent_18%),linear-gradient(135deg,#f7f7f4_0%,#e9eef3_52%,#ff2b2b_100%)]";
  }

  if (category === "buyer") {
    return "bg-[radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.62),transparent_22%),linear-gradient(135deg,#dcefe7_0%,#f9efe1_48%,#2d7df6_100%)]";
  }

  if (category === "precon") {
    return "bg-[linear-gradient(90deg,rgba(255,255,255,0.88)_0_49%,rgba(203,213,225,0.55)_49%_51%,rgba(15,23,42,0.24)_51%),linear-gradient(135deg,#f8fafc_0%,#dbeafe_55%,#ef4444_100%)]";
  }

  if (category === "investor") {
    return "bg-[radial-gradient(circle_at_85%_15%,rgba(34,197,94,0.35),transparent_20%),linear-gradient(135deg,#08111f_0%,#0f2f2d_50%,#f8fafc_100%)]";
  }

  return "bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_18%),linear-gradient(135deg,#050505_0%,#1f2937_52%,#d6c08f_100%)]";
}

function accentClass(category: ReturnType<typeof buildComposedStaticAdPreview>["category"]) {
  if (category === "luxury") return "bg-[#111111] text-[#f4ead2] border-[#d6c08f]/40";
  if (category === "investor") return "bg-emerald-400 text-slate-950 border-emerald-200/40";
  if (category === "buyer") return "bg-[#5ff082] text-black border-white/50";
  return "bg-[#ff202e] text-white border-white/40";
}

function ctaClass(category: ReturnType<typeof buildComposedStaticAdPreview>["category"]) {
  if (category === "luxury") return "border-[#d6c08f]/60 bg-[#f4ead2] text-[#111111]";
  if (category === "investor") return "border-emerald-300/70 bg-emerald-300 text-slate-950";
  if (category === "buyer") return "border-[#111111]/15 bg-white text-[#111111]";
  return "border-[#111111]/15 bg-white text-[#111111]";
}

function renderTemplateDetails(
  preview: ReturnType<typeof buildComposedStaticAdPreview>,
  compact: boolean,
  t: ProductTranslator,
) {
  if (preview.category === "luxury") {
    return (
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="max-w-[76%] space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f4ead2]/80">
            {preview.eyebrow}
          </p>
          <h3 className={cn("font-semibold leading-tight text-[#f4ead2]", compact ? "text-xl" : "text-3xl")}>
            {preview.headline}
          </h3>
          <div className={cn("inline-flex rounded-full border px-4 py-2 text-xs font-semibold", ctaClass(preview.category))}>
            {preview.cta}
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "investor") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-full grid-rows-[auto_1fr_auto] gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className={cn("rounded-sm border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em]", accentClass(preview.category))}>
              {preview.eyebrow}
            </div>
            <div className="rounded-sm border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
              {t("creativePreview.roiBrief")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {preview.proofChips.slice(0, 4).map((chip, index) => (
              <div key={`${chip}-${index}`} className="rounded-md border border-white/14 bg-black/58 p-2 text-white shadow-sm">
                <p className="text-[9px] uppercase tracking-[0.16em] text-white/58">{t("creativePreview.metric")}</p>
                <p className="mt-1 break-words text-sm font-black leading-tight">{chip}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-slate-950">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">{t("creativePreview.opportunity")}</p>
            <p className={cn("font-black leading-tight", compact ? "text-lg" : "text-2xl")}>{preview.overlayText}</p>
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "precon") {
    return (
      <div className="absolute inset-0 flex flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <div className={cn("rounded-sm border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em]", accentClass(preview.category))}>
            {t("creativePreview.breakingNews")}
          </div>
          <div className="rounded-sm bg-white px-2 py-1 text-[10px] font-bold text-black">2026 - 2028</div>
        </div>
        <div className="mt-auto space-y-3">
          <div className="rounded-md bg-white/92 px-3 py-3 text-black shadow-lg">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-600">{preview.eyebrow}</p>
            <p className={cn("break-words font-black uppercase leading-tight", compact ? "text-xl" : "text-3xl")}>{preview.overlayText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.proofChips.slice(0, 2).map((chip, index) => (
              <span key={`${chip}-${index}`} className="rounded-full bg-black px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("max-w-[80%] rounded-md border px-3 py-2 shadow-sm", accentClass(preview.category))}>
          <p className={cn("break-words font-black uppercase leading-tight", compact ? "text-lg" : "text-2xl")}>
            {preview.overlayText}
          </p>
        </div>
      </div>
      <div className="mt-auto space-y-3">
        {preview.proofChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {preview.proofChips.slice(0, 3).map((chip, index) => (
              <span key={`${chip}-${index}`} className="rounded-full bg-white/92 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-black">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-full border border-black/12 bg-white px-4 py-3 text-black shadow-lg">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">{preview.eyebrow}</p>
            <p className="break-words text-sm font-black leading-tight">{preview.headline}</p>
          </div>
          <div className="rounded-full border border-black/12 px-3 py-2 text-xs font-black">
            {preview.cta}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StaticAdComposedPreview({
  className,
  compact = false,
  selectedCount,
  showRawAssetState = true,
  ...input
}: StaticAdComposedPreviewProps) {
  const { t } = useProductI18n();
  const preview = buildComposedStaticAdPreview(input);
  const label = statusLabel(preview.status, t);
  const quality = qualityLabel(preview, t);

  return (
    <div className={cn("overflow-hidden rounded-[20px] border border-white/10 bg-black/20", className)}>
      <div
        className={cn(
          "relative overflow-hidden",
          preview.aspectRatio === "16:9" ? "aspect-[16/9]" : "aspect-square",
          backgroundClass(preview.category),
        )}
      >
        {preview.backgroundImageUrl ? (
          <Image
            alt={preview.headline}
            fill
            unoptimized
            className="object-cover"
            src={preview.backgroundImageUrl}
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:36px_36px] opacity-20" />
        )}
        <div className="absolute inset-0 bg-black/18" />
        {renderTemplateDetails(preview, compact, t)}
      </div>

      <div className={cn("space-y-3", compact ? "p-3" : "p-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            {label}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {quality}
          </span>
          {typeof selectedCount === "number" ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("creativePreview.selectedCount", { count: selectedCount })}
            </span>
          ) : null}
        </div>
        {showRawAssetState ? (
          <p className="text-xs leading-5 text-muted-foreground">{preview.backgroundMessage}</p>
        ) : null}
        {!compact ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("creativePreview.primaryText")}
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-foreground">{preview.primaryText}</p>
            </div>
            <div className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-foreground">
              {preview.cta}
            </div>
          </div>
        ) : null}
        {preview.overflowRisk ? (
          <p className="text-xs leading-5 text-amber-300">
            {t("creativePreview.overflow")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
