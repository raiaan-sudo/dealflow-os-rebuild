import Image from "next/image";
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
  appComposedFinal?: boolean | null;
};

function statusLabel(status: ReturnType<typeof buildComposedStaticAdPreview>["status"]) {
  if (status === "final_composed") return "Launch-ready creative";
  if (status === "background_generating") return "Draft concept";
  if (status === "background_rejected") return "Retry needed";
  if (status === "background_failed") return "Retry needed";
  return "Draft concept";
}

function qualityLabel(preview: ReturnType<typeof buildComposedStaticAdPreview>) {
  if (preview.status === "final_composed") {
    return "Launch-ready image";
  }

  if (preview.status === "background_generating") {
    return "Image preparing";
  }

  if (preview.status === "background_rejected") {
    return "Not launch-ready";
  }

  return "Refresh available";
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

  if (category === "commercial") {
    return "bg-[linear-gradient(90deg,rgba(255,255,255,0.92)_0_46%,rgba(15,23,42,0.2)_46%_48%,rgba(15,23,42,0.1)_48%),linear-gradient(135deg,#f8fafc_0%,#dbe4ee_52%,#2563eb_100%)]";
  }

  return "bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_18%),linear-gradient(135deg,#050505_0%,#1f2937_52%,#d6c08f_100%)]";
}

function accentClass(category: ReturnType<typeof buildComposedStaticAdPreview>["category"]) {
  if (category === "luxury") return "bg-[#111111] text-[#f4ead2] border-[#d6c08f]/40";
  if (category === "investor") return "bg-emerald-400 text-slate-950 border-emerald-200/40";
  if (category === "commercial") return "bg-blue-600 text-white border-blue-200/40";
  if (category === "buyer") return "bg-[#5ff082] text-black border-white/50";
  return "bg-[#ff202e] text-white border-white/40";
}

function ctaClass(category: ReturnType<typeof buildComposedStaticAdPreview>["category"]) {
  if (category === "luxury") return "border-[#d6c08f]/60 bg-[#f4ead2] text-[#111111]";
  if (category === "investor") return "border-emerald-300/70 bg-emerald-300 text-slate-950";
  if (category === "commercial") return "border-blue-200/70 bg-blue-600 text-white";
  if (category === "buyer") return "border-[#111111]/15 bg-white text-[#111111]";
  return "border-[#111111]/15 bg-white text-[#111111]";
}

function proofItems(preview: ReturnType<typeof buildComposedStaticAdPreview>) {
  if (preview.proofChips.length > 0) {
    return preview.proofChips;
  }

  if (preview.category === "buyer") return ["Budget fit", "New matches", "Fast shortlist"];
  if (preview.category === "seller") return ["Value range", "Demand signal", "Next move"];
  if (preview.category === "investor") return ["Yield", "Rent", "Entry"];
  if (preview.category === "commercial") return ["Size", "Location", "Use fit"];
  if (preview.category === "precon") return ["Deposit", "Timeline", "Release"];
  return ["Private", "Scarce", "Curated"];
}

function visualTile(className: string, label: string, sublabel?: string) {
  return (
    <div className={cn("relative overflow-hidden rounded-[18px] border border-white/35 shadow-sm", className)}>
      <div className="absolute inset-x-0 bottom-0 bg-white/88 px-3 py-2 text-slate-950">
        <p className="text-[9px] font-black uppercase tracking-[0.14em]">{label}</p>
        {sublabel ? <p className="mt-0.5 text-[10px] font-semibold text-slate-600">{sublabel}</p> : null}
      </div>
    </div>
  );
}

function renderInstantVisualScene(preview: ReturnType<typeof buildComposedStaticAdPreview>, compact: boolean) {
  const items = proofItems(preview);

  if (preview.category === "buyer") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-[62%] grid-cols-[1.05fr_0.95fr] gap-3">
          {visualTile(
            "bg-[linear-gradient(135deg,#8b6f47_0%,#d9c6a8_48%,#edf7ee_49%,#bde0c4_100%)]",
            "Kitchen",
            "warm interior",
          )}
          <div className="grid gap-3">
            {visualTile(
              "bg-[linear-gradient(135deg,#85b5ff_0%,#cfe5ff_45%,#76a66a_46%,#4f8f46_100%)]",
              "Backyard",
              "family space",
            )}
            <div className="rounded-[18px] border border-white/45 bg-white/90 p-3 text-slate-950 shadow-sm">
              <div className="h-2 w-20 rounded-full bg-slate-300" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {items.slice(0, 3).map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-black leading-tight">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-[23%] right-5 w-[34%] rounded-[18px] border border-slate-950/10 bg-white/92 p-3 text-slate-950 shadow-lg">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Shortlist</p>
          <div className="mt-2 space-y-1.5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-slate-100 px-2 py-1.5">
                <span className="h-2 rounded-full bg-slate-300" />
                <span className="h-2 w-8 rounded-full bg-emerald-300" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "seller") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-[66%] grid-cols-[0.9fr_1.1fr] gap-3">
          {visualTile(
            "bg-[linear-gradient(135deg,#c9d7c5_0%,#f6f2e8_44%,#b46c43_45%,#8f4f2e_100%)]",
            "Street",
            "local demand",
          )}
          <div className="rounded-[18px] border border-slate-950/10 bg-white/90 p-3 text-slate-950 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Value movement</p>
            <div className="mt-4 flex h-24 items-end gap-3">
              {items.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                  <div className={cn("w-full rounded-t-xl bg-red-500", index === 0 ? "h-10" : index === 1 ? "h-16" : "h-24")} />
                  <p className="text-[10px] font-black">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "precon") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-[66%] grid-cols-2 gap-3">
          {visualTile(
            "bg-[linear-gradient(135deg,#dbeafe_0%,#f8fafc_42%,#94a3b8_43%,#475569_100%)]",
            "Today",
            "current market",
          )}
          {visualTile(
            "bg-[linear-gradient(135deg,#111827_0%,#334155_44%,#f97316_45%,#facc15_100%)]",
            "Future",
            "completion path",
          )}
        </div>
      </div>
    );
  }

  if (preview.category === "investor") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-[66%] grid-cols-[1fr_0.85fr] gap-3">
          <div className="rounded-[18px] border border-emerald-200/25 bg-slate-950/75 p-3 text-white shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200">Market map</p>
            <div className="relative mt-3 h-32 rounded-xl bg-[radial-gradient(circle_at_35%_38%,#22c55e_0_7%,transparent_8%),radial-gradient(circle_at_70%_62%,#facc15_0_6%,transparent_7%),linear-gradient(135deg,#164e63,#052e2b)]">
              <div className="absolute left-4 top-5 h-12 w-20 rounded-full border border-white/20" />
              <div className="absolute bottom-4 right-5 h-10 w-16 rounded-full border border-white/20" />
            </div>
          </div>
          <div className="grid gap-2">
            {items.slice(0, 3).map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-[16px] border border-emerald-200/20 bg-white/92 p-3 text-slate-950">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Metric</p>
                <p className="mt-1 text-sm font-black">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "commercial") {
    return (
      <div className="absolute inset-0 p-4">
        <div className="grid h-[66%] grid-cols-[1.1fr_0.9fr] gap-3">
          {visualTile(
            "bg-[linear-gradient(135deg,#dbe4ee_0%,#f8fafc_42%,#64748b_43%,#1e293b_100%)]",
            "Space",
            "fit check",
          )}
          <div className="rounded-[18px] border border-blue-200/25 bg-white/92 p-3 text-slate-950 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">Requirements</p>
            <div className="mt-3 space-y-2">
              {items.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 p-4">
      <div className="h-[66%] rounded-[22px] border border-[#d6c08f]/30 bg-[linear-gradient(135deg,#0f0f0f_0%,#2d2a22_52%,#d6c08f_100%)] shadow-sm" />
    </div>
  );
}

function renderTemplateDetails(preview: ReturnType<typeof buildComposedStaticAdPreview>, compact: boolean) {
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
              ROI brief
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {preview.proofChips.slice(0, 4).map((chip, index) => (
              <div key={`${chip}-${index}`} className="rounded-md border border-white/14 bg-black/58 p-2 text-white shadow-sm">
                <p className="text-[9px] uppercase tracking-[0.16em] text-white/58">Metric</p>
                <p className="mt-1 break-words text-sm font-black leading-tight">{chip}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-slate-950">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Opportunity</p>
            <p className={cn("font-black leading-tight", compact ? "text-lg" : "text-2xl")}>{preview.overlayText}</p>
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "commercial") {
    return (
      <div className="absolute inset-0 grid grid-rows-[auto_1fr_auto] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("rounded-sm border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em]", accentClass(preview.category))}>
            {preview.eyebrow}
          </div>
          <div className="rounded-sm border border-slate-950/10 bg-white/88 px-2 py-1 text-[10px] font-bold text-slate-950">
            Fit brief
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 self-start">
          {preview.proofChips.slice(0, 4).map((chip, index) => (
            <div key={`${chip}-${index}`} className="rounded-md border border-slate-950/10 bg-white/82 p-2 text-slate-950 shadow-sm">
              <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Requirement</p>
              <p className="mt-1 break-words text-sm font-black leading-tight">{chip}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md bg-slate-950 px-3 py-3 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Commercial match</p>
          <p className={cn("break-words font-black leading-tight", compact ? "text-lg" : "text-2xl")}>{preview.overlayText}</p>
          <div className={cn("mt-3 inline-flex rounded-full border px-4 py-2 text-xs font-semibold", ctaClass(preview.category))}>
            {preview.cta}
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
            Breaking news
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

  if (preview.category === "buyer") {
    return (
      <div className="absolute inset-0 flex flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 shadow-sm">
            {preview.eyebrow}
          </div>
        </div>
        <div className="mt-auto space-y-3">
          {preview.proofChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preview.proofChips.slice(0, 3).map((chip, index) => (
                <span key={`${chip}-${index}`} className="rounded-full bg-white/92 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-black shadow-sm">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div
            className={cn(
              "grid items-center rounded-[22px] border border-black/12 bg-white px-4 py-3 text-black shadow-[0_16px_36px_-22px_rgba(0,0,0,0.5)]",
              compact ? "grid-cols-1 gap-2" : "grid-cols-[minmax(0,1fr)_auto] gap-3",
            )}
          >
            <div className="min-w-0">
              <p className={cn("break-words font-black leading-tight", compact ? "text-sm" : "text-xl")}>
                {preview.headline}
              </p>
            </div>
            <div className={cn("rounded-full border border-black/12 px-3 py-2 text-center text-xs font-black leading-tight", compact ? "w-fit max-w-full" : "")}>
              {preview.cta}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (preview.category === "seller") {
    return (
      <div className="absolute inset-0 flex flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-[72%] rounded-full border border-white/55 bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950 shadow-sm">
            {preview.eyebrow}
          </div>
        </div>
        <div className="mt-auto space-y-3">
          {preview.proofChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preview.proofChips.slice(0, 3).map((chip, index) => (
                <span key={`${chip}-${index}`} className="rounded-full bg-white/92 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-black shadow-sm">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div
            className={cn(
              "grid items-center rounded-[22px] border border-black/12 bg-white px-4 py-3 text-black shadow-[0_16px_36px_-22px_rgba(0,0,0,0.5)]",
              compact ? "grid-cols-1 gap-2" : "grid-cols-[minmax(0,1fr)_auto] gap-3",
            )}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">{preview.location} homeowners</p>
              <p className={cn("break-words font-black leading-tight", compact ? "text-sm" : "text-xl")}>
                {preview.headline}
              </p>
            </div>
            <div className={cn("rounded-full border border-black/12 px-3 py-2 text-center text-xs font-black leading-tight", compact ? "w-fit max-w-full" : "max-w-[152px]")}>
              {preview.cta}
            </div>
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
        <div
          className={cn(
            "grid items-center border border-black/12 bg-white px-4 py-3 text-black shadow-lg",
            compact ? "grid-cols-1 gap-2 rounded-[22px]" : "grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-full",
          )}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">{preview.eyebrow}</p>
            <p className="break-words text-sm font-black leading-tight">{preview.headline}</p>
          </div>
          <div className={cn("rounded-full border border-black/12 px-3 py-2 text-center text-xs font-black leading-tight", compact ? "w-fit max-w-full" : "")}>
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
  const preview = buildComposedStaticAdPreview(input);
  const label = statusLabel(preview.status);
  const quality = qualityLabel(preview);
  const renderStoredFinalOnly = preview.status === "final_composed" && Boolean(preview.backgroundImageUrl);

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
          renderInstantVisualScene(preview, compact)
        )}
        {preview.backgroundImageUrl && !renderStoredFinalOnly ? <div className="absolute inset-0 bg-black/8" /> : null}
        {renderStoredFinalOnly ? null : renderTemplateDetails(preview, compact)}
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
              {selectedCount} selected
            </span>
          ) : null}
        </div>
        {showRawAssetState ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {preview.status === "final_composed"
              ? preview.backgroundMessage
              : preview.backgroundMessage}
          </p>
        ) : null}
        {!compact ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Primary text
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-foreground">{preview.primaryText}</p>
            </div>
            <div className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-foreground">
              {preview.cta}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
