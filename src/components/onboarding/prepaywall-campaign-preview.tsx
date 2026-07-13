"use client";

import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BadgeCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  MonitorSmartphone,
  MousePointerClick,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CanonicalFunnelRenderer } from "@/components/funnels/canonical-funnel-renderer";
import { isInstantFormCampaign } from "@/lib/campaign-destination";
import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import { resolveMetaInstantFormQualificationQuestions } from "@/lib/meta-instant-form-qualification";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import {
  getProductIntlLocale,
  normalizeProductLocale,
  type ProductLocale,
} from "@/lib/i18n/config";
import {
  formatPreviewCopy,
  PREPAYWALL_PREVIEW_COPY,
  type PrepaywallPreviewCopy,
} from "@/lib/i18n/prepaywall-preview-copy";
import { cn } from "@/lib/utils";

export type PrepaywallCampaignMode = "buyer" | "seller" | "investor" | "commercial";

export type PrepaywallCampaignPreviewDraft = {
  agentFirstName?: string;
  agentLastName?: string;
  agentCompanyName?: string;
  campaignMode: PrepaywallCampaignMode;
  market?: string;
  audience?: string;
  propertyType?: string;
  priceRange?: string;
  dailyBudget?: string;
  monthlyBudget?: string;
  offer?: string;
  leadCaptureMode?: string;
  lead_capture_mode?: string;
  leadFormQuestions?: string[];
  adDestination?: string;
  ad_destination?: string;
  funnelLanguage?: "en" | "fr" | "es";
  formType?: string;
  form_type?: string;
  destination?: string;
  campaignDestination?: string;
  campaign_destination?: string;
  trafficDestination?: string;
  traffic_destination?: string;
  conversionLocation?: string;
  conversion_location?: string;
  planTier?: "starter" | "pro";
};

type PreviewContent = {
  eyebrow: string;
  headline: string;
  primaryText: string;
  cta: string;
  funnelHero: string;
  funnelSubtitle: string;
  visualLabel: string;
  proofChips: string[];
  readiness: string[];
};

type PrepaywallCampaignPreviewProps = {
  draft: PrepaywallCampaignPreviewDraft;
  variant?: "compact" | "package";
  density?: "standard" | "sidecar";
  className?: string;
};

type StoredOnboardingDraft = Partial<PrepaywallCampaignPreviewDraft> & {
  campaignId?: string;
};

const STORAGE_KEY = "dealflow-guided-onboarding-v3";

const defaultPreviewDraft: PrepaywallCampaignPreviewDraft = {
  campaignMode: "buyer",
  dailyBudget: "30",
  planTier: "pro",
};

function getModeLabel(mode: PrepaywallCampaignMode, copy: PrepaywallPreviewCopy) {
  return copy.modes[mode].label;
}

function formatDailyBudget(
  value: string | undefined,
  legacyMonthlyValue: string | undefined,
  locale: "en" | "fr" | "es",
  copy: PrepaywallPreviewCopy,
) {
  const numeric = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));

  if (Number.isFinite(numeric) && numeric > 0) {
    return `${new Intl.NumberFormat(getProductIntlLocale(locale), {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(numeric)}/${copy.day}`;
  }

  const legacyMonthly = Number.parseFloat(String(legacyMonthlyValue ?? "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(legacyMonthly) || legacyMonthly <= 0) {
    return copy.budgetNotSet;
  }

  return `${new Intl.NumberFormat(getProductIntlLocale(locale), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Math.round(legacyMonthly / 30))}/${copy.day}`;
}

function clean(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeSentence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\btoronto,\s*on\s+in\s+toronto,\s*on\b/gi, "Toronto, ON")
    .trim();
}

function buildPreviewContent(
  draft: PrepaywallCampaignPreviewDraft,
  copy: PrepaywallPreviewCopy,
): PreviewContent {
  const market = clean(draft.market, copy.fallback.market);
  const propertyType = clean(draft.propertyType, copy.fallback.inventory);
  const audience = clean(draft.audience, copy.fallback.audience);
  const offer = clean(draft.offer, copy.fallback.offer);
  const priceRange = clean(draft.priceRange, copy.fallback.range);
  const mode = copy.modes[draft.campaignMode];
  const values = { market, property: propertyType, audience, offer, range: priceRange };
  const headline = normalizeSentence(formatPreviewCopy(copy.campaignHeadline, values));

  return {
    eyebrow: formatPreviewCopy(mode.eyebrow, values),
    headline,
    primaryText: normalizeSentence(formatPreviewCopy(mode.primary, values)),
    cta: formatPreviewCopy(copy.campaignCta, values),
    funnelHero: headline,
    funnelSubtitle: normalizeSentence(formatPreviewCopy(mode.subtitle, values)),
    visualLabel: mode.visual,
    proofChips: [mode.proof[0], mode.proof[1], priceRange],
    readiness: [...mode.readiness],
  };
}

function toneClasses(mode: PrepaywallCampaignMode) {
  if (mode === "seller") {
    return {
      frame: "from-rose-400/20 via-slate-950 to-cyan-300/18",
      accent: "bg-rose-300 text-slate-950",
      glow: "shadow-[0_28px_90px_-60px_rgba(251,113,133,0.9)]",
    };
  }

  if (mode === "investor") {
    return {
      frame: "from-emerald-300/20 via-slate-950 to-cyan-300/16",
      accent: "bg-emerald-300 text-slate-950",
      glow: "shadow-[0_28px_90px_-60px_rgba(52,211,153,0.9)]",
    };
  }

  if (mode === "commercial") {
    return {
      frame: "from-blue-300/20 via-slate-950 to-violet-300/18",
      accent: "bg-blue-300 text-slate-950",
      glow: "shadow-[0_28px_90px_-60px_rgba(96,165,250,0.9)]",
    };
  }

  return {
    frame: "from-cyan-300/20 via-slate-950 to-violet-300/18",
    accent: "bg-cyan-200 text-slate-950",
    glow: "shadow-[0_28px_90px_-60px_rgba(103,232,249,0.9)]",
  };
}

function MiniIconTile({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-cyan-100", className)}>
      <Icon className="size-4" />
    </div>
  );
}

function CompactLockedPill({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-2 text-xs font-semibold text-white/68">
      <Icon className="size-3.5 shrink-0 text-violet-100" />
      <span className="truncate">{label}</span>
      <Lock className="ml-auto size-3 shrink-0 text-white/38" />
    </div>
  );
}

function MockAdPreview({
  content,
  draft,
  uiCopy,
  campaignLocale,
  compact = false,
}: {
  content: PreviewContent;
  draft: PrepaywallCampaignPreviewDraft;
  uiCopy: PrepaywallPreviewCopy;
  campaignLocale: ProductLocale;
  compact?: boolean;
}) {
  const tones = toneClasses(draft.campaignMode);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br",
        compact ? "self-start p-3" : "p-4",
        tones.frame,
        tones.glow,
      )}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 select-none bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.06)_42%,transparent_74%)]" />
      <div className={cn(
        "pointer-events-none absolute rounded-full border border-white/10 bg-black/35 font-black uppercase text-white/58",
        compact
          ? "left-3 top-3 px-2 py-0.5 text-[8px] tracking-[0.12em]"
          : "right-3 top-3 px-2.5 py-1 text-[9px] tracking-[0.16em]",
      )}>
        {compact ? uiCopy.adPreview : uiCopy.dealflowPreview}
      </div>

      <div className={cn(
        "relative overflow-hidden rounded-[18px] border border-white/12 bg-black/30",
        compact ? "mt-7 h-[320px] max-h-[42vh]" : "mt-8 aspect-[4/3]",
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.24),transparent_22%),radial-gradient(circle_at_82%_8%,rgba(103,232,249,0.2),transparent_20%),linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <span className={cn("max-w-[70%] truncate rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]", tones.accent)}>
            {content.visualLabel}
          </span>
          <span className="rounded-full border border-white/12 bg-black/38 px-2.5 py-1 text-[9px] font-semibold text-white/64">
            {formatDailyBudget(draft.dailyBudget, draft.monthlyBudget, campaignLocale, uiCopy)}
          </span>
        </div>
        <div className={cn(
          "absolute inset-x-3 bottom-3 rounded-[16px] border border-white/12 bg-slate-950/88 backdrop-blur",
          compact ? "p-3" : "p-4",
        )}>
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">{content.eyebrow}</p>
          <h4 className={cn("mt-2 line-clamp-2 font-semibold leading-tight tracking-[-0.04em] text-white", compact ? "text-sm" : "text-lg")}>
            {content.headline}
          </h4>
          <p className={cn("mt-2 text-white/62", compact ? "line-clamp-2 text-xs leading-5" : "text-sm leading-6")}>{content.primaryText}</p>
          <div className={cn("mt-3 inline-flex max-w-full rounded-full bg-white font-black text-slate-950", compact ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-xs")}>
            <span className="truncate">{content.cta}</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 rotate-[-8deg] select-none text-5xl font-black uppercase tracking-[0.12em] text-white/[0.035]">
        {uiCopy.previewWatermark}
      </div>
    </div>
  );
}

function FunnelPreviewMock({
  content,
  draft,
  campaignCopy,
  campaignLocale,
  compact = false,
}: {
  content: PreviewContent;
  draft: PrepaywallCampaignPreviewDraft;
  campaignCopy: PrepaywallPreviewCopy;
  campaignLocale: ProductLocale;
  compact?: boolean;
}) {
  const agentName = [draft.agentFirstName, draft.agentLastName].filter(Boolean).join(" ");
  const funnel = buildWinningFunnel({
    location: draft.market || campaignCopy.fallback.market,
    market: draft.market || campaignCopy.fallback.market,
    audience: draft.audience || campaignCopy.fallback.audience,
    offer: draft.offer || content.funnelHero || campaignCopy.fallback.offer,
    key_offer: draft.offer || content.funnelHero || campaignCopy.fallback.offer,
    market_type: draft.campaignMode,
    funnel_goal: "survey",
    leadCaptureMode: draft.leadCaptureMode ?? draft.lead_capture_mode,
    language: campaignLocale,
    agentName: agentName || campaignCopy.fallback.advisor,
    brokerageName: draft.agentCompanyName || campaignCopy.fallback.team,
  });

  return (
    <div onContextMenu={(event) => event.preventDefault()}>
      <CanonicalFunnelRenderer
        brandLabel={draft.agentCompanyName || campaignCopy.fallback.team}
        campaignName={getModeLabel(draft.campaignMode, campaignCopy)}
        compact={compact}
        funnel={funnel}
        market={draft.market}
        mode="preview"
      />
    </div>
  );
}

function InstantFormSetupPreview({
  content,
  draft,
  uiCopy,
  campaignCopy,
  campaignLocale,
  compact = false,
}: {
  content: PreviewContent;
  draft: PrepaywallCampaignPreviewDraft;
  uiCopy: PrepaywallPreviewCopy;
  campaignCopy: PrepaywallPreviewCopy;
  campaignLocale: ProductLocale;
  compact?: boolean;
}) {
  const leadCaptureMode =
    draft.leadCaptureMode === "volume_lead_form" ||
    draft.leadCaptureMode === "deep_qualification" ||
    draft.leadCaptureMode === "quality_funnel"
      ? draft.leadCaptureMode
      : "quality_funnel";
  const qualificationQuestions = resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode,
    language: draft.funnelLanguage ?? campaignLocale,
    customQuestions: draft.leadFormQuestions,
  });
  const fields = [campaignCopy.fullName, campaignCopy.email, campaignCopy.phone, ...qualificationQuestions];
  const readiness = uiCopy.instantReadiness;

  return (
    <div
      className={cn(
        "rounded-[22px] border border-cyan-200/16 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.14),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]",
        compact ? "self-start p-3.5" : "p-5",
      )}
      data-testid="instant-form-setup-preview"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-start gap-3">
        <MiniIconTile icon={FileText} className="text-cyan-100" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">{uiCopy.instantSetup}</p>
          <h4 className={cn("mt-2 font-semibold tracking-[-0.04em] text-white", compact ? "text-base" : "text-xl")}>
            {uiCopy.instantTitle}
          </h4>
          <p className={cn("mt-2 text-white/62", compact ? "text-xs leading-5" : "text-sm leading-6")}>
            {formatPreviewCopy(uiCopy.instantBody, { headline: content.headline })}
          </p>
        </div>
      </div>

      <div className={cn("mt-4 rounded-[18px] border border-white/10 bg-black/20", compact ? "p-3" : "p-4")}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/44">{uiCopy.leadFields}</p>
        <div className="mt-3 grid gap-2">
          {fields.map((field) => (
            <div key={field} className={cn("flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3", compact ? "py-1.5 text-xs" : "py-2 text-sm")}>
              <span className="font-medium text-white/84">{field}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">{uiCopy.required}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("mt-4 grid", compact ? "gap-1.5" : "gap-2")}>
        {readiness.map((item) => (
          <div key={item} className={cn("flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs text-white/64", compact ? "py-1.5 leading-4" : "py-2 leading-5")}>
            <BadgeCheck className="size-4 shrink-0 text-cyan-100" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className={cn("mt-4 rounded-[18px] border border-amber-300/16 bg-amber-300/[0.055] px-3 text-xs text-amber-100/82", compact ? "py-2 leading-4" : "py-2.5 leading-5")}>
        {uiCopy.instantSafety}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/16 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{uiCopy.campaign}</p>
          <p className="mt-1 truncate text-xs font-semibold text-white/82">{getModeLabel(draft.campaignMode, campaignCopy)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/16 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{uiCopy.cta}</p>
          <p className="mt-1 truncate text-xs font-semibold text-white/82">{content.cta}</p>
        </div>
      </div>
    </div>
  );
}

export function PrepaywallCampaignPreview({
  draft,
  variant = "compact",
  density = "standard",
  className,
}: PrepaywallCampaignPreviewProps) {
  const { locale } = useProductI18n();
  const safeDraft = { ...defaultPreviewDraft, ...draft };
  const uiCopy = PREPAYWALL_PREVIEW_COPY[locale];
  const campaignLocale = normalizeProductLocale(safeDraft.funnelLanguage ?? locale);
  const campaignCopy = PREPAYWALL_PREVIEW_COPY[campaignLocale];
  safeDraft.offer = clean(safeDraft.offer, campaignCopy.fallback.offer);
  const content = buildPreviewContent(safeDraft, campaignCopy);
  const agentName = [safeDraft.agentFirstName, safeDraft.agentLastName].filter(Boolean).join(" ") || uiCopy.fallback.advisor;
  const packageMode = variant === "package";
  const compactMode = !packageMode;
  const sidecarMode = packageMode && density === "sidecar";
  const instantFormCampaign = isInstantFormCampaign(safeDraft);
  const previewSafetyCopy = instantFormCampaign ? uiCopy.safetyInstant : uiCopy.safetyFunnel;

  if (compactMode) {
    return (
      <Card
        data-testid="prepaywall-campaign-preview"
        className={cn("grid h-full min-w-0 overflow-hidden p-4", className)}
      >
        <div className="grid gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="df-eyebrow text-cyan-100/76">{uiCopy.previewTitle}</p>
              <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-tight tracking-[-0.045em] text-white">
                {content.headline}
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-white/56">
                {formatPreviewCopy(uiCopy.sampleCta, { cta: content.cta })}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">{uiCopy.watermarked}</Badge>
              <Badge className="border-violet-200/20 bg-violet-300/[0.055] text-violet-100">{uiCopy.locked}</Badge>
            </div>
          </div>

          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
            <div className="flex min-w-0 justify-center">
              <div className="w-full max-w-[320px]">
                <MockAdPreview content={content} draft={safeDraft} uiCopy={uiCopy} campaignLocale={campaignLocale} compact />
              </div>
            </div>

            <div className="flex min-w-0 justify-center">
              <div className="w-full max-w-[320px]">
              {instantFormCampaign ? (
                <InstantFormSetupPreview content={content} draft={safeDraft} uiCopy={uiCopy} campaignCopy={campaignCopy} campaignLocale={campaignLocale} compact />
              ) : (
                <FunnelPreviewMock content={content} draft={safeDraft} campaignCopy={campaignCopy} campaignLocale={campaignLocale} compact />
              )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mx-auto w-full max-w-[560px] rounded-[18px] border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex min-w-0 items-start gap-3">
                  <MiniIconTile icon={FileText} className="size-8 rounded-xl" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">{uiCopy.copyAngle}</p>
                    <h4 className="mt-1 line-clamp-1 text-sm font-semibold leading-tight text-white">{content.headline}</h4>
                    <p className="mt-1 line-clamp-1 text-xs leading-5 text-white/56">{content.primaryText}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {[
                [uiCopy.agent, agentName],
                [uiCopy.market, safeDraft.market || uiCopy.notSet],
                [uiCopy.audience, safeDraft.audience || uiCopy.notSet],
                [uiCopy.offer, safeDraft.offer || uiCopy.notSet],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</p>
                  <p className="truncate text-xs font-semibold text-white/82">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <CompactLockedPill icon={ImageIcon} label={uiCopy.lockedStatic} />
              <CompactLockedPill icon={Sparkles} label={uiCopy.lockedAiImage} />
              <CompactLockedPill icon={PlayCircle} label={uiCopy.lockedAiVideo} />
              <CompactLockedPill icon={MonitorSmartphone} label={uiCopy.lockedResolution} />
            </div>

            <div className="flex min-w-0 items-start gap-2 rounded-[18px] border border-white/10 bg-black/18 px-3 py-2 text-[11px] leading-4 text-white/52">
              <MousePointerClick className="size-3.5 shrink-0 text-cyan-100" />
              <span>{previewSafetyCopy}</span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      data-testid="prepaywall-campaign-preview"
      className={cn(
        "h-full min-w-0 overflow-x-hidden",
        sidecarMode ? "p-4" : "p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="df-eyebrow text-cyan-100/76">{uiCopy.packageTitle}</p>
          <h3 className={cn("mt-2 line-clamp-2 font-semibold tracking-[-0.05em]", sidecarMode ? "text-lg" : "text-2xl")}>
            {content.headline}
          </h3>
          <p className={cn("mt-2 text-sm text-white/58", sidecarMode ? "line-clamp-2 leading-5" : "leading-6")}>
            {formatPreviewCopy(uiCopy.sampleCta, { cta: content.cta })}
          </p>
        </div>
        <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">{uiCopy.watermarked}</Badge>
      </div>

      <div className={cn(
        "mt-4 grid min-w-0 items-start gap-3",
        sidecarMode ? "lg:grid-cols-2" : "xl:grid-cols-2",
      )}>
        <div className="flex min-w-0 justify-center">
          <div className={cn("w-full", sidecarMode ? "max-w-[320px]" : "max-w-[420px]")}>
            <MockAdPreview content={content} draft={safeDraft} uiCopy={uiCopy} campaignLocale={campaignLocale} compact={sidecarMode} />
          </div>
        </div>

        <div className="flex min-w-0 justify-center">
          <div className={cn("w-full", sidecarMode ? "max-w-[320px]" : "max-w-[420px]")}>
          {instantFormCampaign ? (
            <InstantFormSetupPreview content={content} draft={safeDraft} uiCopy={uiCopy} campaignCopy={campaignCopy} campaignLocale={campaignLocale} compact={sidecarMode} />
          ) : (
            <FunnelPreviewMock content={content} draft={safeDraft} campaignCopy={campaignCopy} campaignLocale={campaignLocale} compact={sidecarMode} />
          )}
          </div>
        </div>

          {!sidecarMode ? (
            <div className="xl:col-span-2">
              <div className="mx-auto w-full max-w-[680px] rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <MiniIconTile icon={FileText} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">{uiCopy.copyPreview}</p>
                  <h4 className="mt-2 text-lg font-semibold leading-tight text-white">{content.headline}</h4>
                  <p className="mt-2 text-sm leading-6 text-white/58">{content.primaryText}</p>
                </div>
              </div>
            </div>
            </div>
          ) : null}
      </div>

      <div className={cn("mt-3 grid gap-2", sidecarMode ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
        {[
          [uiCopy.agent, agentName],
          [uiCopy.market, safeDraft.market || uiCopy.notSet],
          [uiCopy.audience, safeDraft.audience || uiCopy.notSet],
          [uiCopy.offer, safeDraft.offer || uiCopy.notSet],
        ].map(([label, value]) => (
          <div key={label} className={cn("min-w-0 border border-white/10 bg-white/[0.035]", sidecarMode ? "rounded-full px-3 py-2" : "rounded-2xl px-3 py-2.5")}>
            <p className="text-xs text-white/46">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-white/86">{value}</p>
          </div>
        ))}
      </div>

      <div className={cn("mt-3 rounded-[24px] border border-emerald-300/16 bg-emerald-300/[0.04]", sidecarMode ? "p-3" : "p-4")}>
        <div className="flex items-start gap-3">
          <MiniIconTile icon={ShieldCheck} className={cn("text-emerald-100", sidecarMode ? "size-8 rounded-xl" : "")} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{uiCopy.readinessTitle}</p>
            <div className={cn("mt-3 grid gap-2", sidecarMode ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
              {content.readiness.map((item) => (
                <div key={item} className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/14 px-3 py-2 text-xs text-white/64">
                  <BadgeCheck className="size-4 text-emerald-100" />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2", sidecarMode ? "grid-cols-2" : "sm:grid-cols-2")}>
        <CompactLockedPill icon={ImageIcon} label={uiCopy.lockedStatic} />
        <CompactLockedPill icon={Sparkles} label={uiCopy.lockedAiImage} />
        <CompactLockedPill icon={PlayCircle} label={uiCopy.lockedAiVideo} />
        <CompactLockedPill icon={MonitorSmartphone} label={uiCopy.lockedResolution} />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[18px] border border-white/10 bg-black/18 px-3 py-2.5 text-xs leading-5 text-white/54">
        <MousePointerClick className="size-4 text-cyan-100" />
        <span>{previewSafetyCopy}</span>
      </div>
    </Card>
  );
}

export function PrepaywallCampaignPreviewFromStorage({
  selectedPlanTier,
  campaignId,
  fallbackDraft,
  className,
}: {
  selectedPlanTier?: "starter" | "pro";
  campaignId?: string | null;
  fallbackDraft?: PrepaywallCampaignPreviewDraft | null;
  className?: string;
}) {
  const [storedDraft, setStoredDraft] = useState<PrepaywallCampaignPreviewDraft | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredOnboardingDraft;
      const mode = parsed.campaignMode;

      if (mode !== "buyer" && mode !== "seller" && mode !== "investor" && mode !== "commercial") {
        return;
      }

      if (campaignId && parsed.campaignId && parsed.campaignId !== campaignId) {
        return;
      }

      setStoredDraft({
        ...parsed,
        campaignMode: mode,
        planTier: selectedPlanTier ?? parsed.planTier ?? "pro",
      });
    } catch {
      setStoredDraft(null);
    }
  }, [campaignId, selectedPlanTier]);

  const previewDraft = storedDraft ?? fallbackDraft ?? null;

  if (!previewDraft) {
    return null;
  }

  return <PrepaywallCampaignPreview className={className} draft={previewDraft} variant="package" density="sidecar" />;
}
