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
import { normalizeOfferForCampaign } from "@/lib/services/offer-normalization-service";
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
  monthlyBudget?: string;
  offer?: string;
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
  market: "your market",
  audience: "qualified prospects",
  propertyType: "selected inventory",
  priceRange: "target range",
  monthlyBudget: "3000",
  offer: "strategy call",
  planTier: "starter",
};

function getModeLabel(mode: PrepaywallCampaignMode) {
  if (mode === "buyer") return "Buyer campaign";
  if (mode === "seller") return "Seller campaign";
  if (mode === "investor") return "Investor campaign";
  return "Commercial campaign";
}

function formatBudget(value?: string) {
  const numeric = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "Budget not set";
  }

  return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo`;
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

function lowerClean(value: string) {
  return normalizeSentence(value).toLowerCase();
}

function compactOffer(offer: string) {
  return normalizeSentence(normalizeOfferForCampaign(offer).normalizedOffer)
    .replace(/^free\s+/i, "")
    .replace(/\s+(strategy call|consultation|brief|report)$/i, " $1")
    .trim();
}

function sentenceCase(value: string) {
  const cleanValue = normalizeSentence(value);
  return cleanValue ? `${cleanValue.charAt(0).toUpperCase()}${cleanValue.slice(1)}` : cleanValue;
}

function offerLedHeadline(mode: PrepaywallCampaignMode, offer: string, market: string, propertyType: string, audience: string) {
  const cleanOffer = compactOffer(offer);

  if (/approval|credit|mortgage|pre[-\s]?approved/i.test(cleanOffer)) {
    return normalizeSentence(`${cleanOffer} in ${market}`);
  }

  if (/guarantee|guaranteed|90\s*days?|sale|sell/i.test(cleanOffer)) {
    return normalizeSentence(`${cleanOffer} for ${market} homeowners`);
  }

  if (mode === "buyer") {
    return normalizeSentence(`${sentenceCase(cleanOffer)} for ${lowerClean(audience)}`);
  }

  if (mode === "seller") {
    return normalizeSentence(`${sentenceCase(cleanOffer)} for ${market} sellers`);
  }

  if (mode === "investor") {
    return normalizeSentence(`${sentenceCase(cleanOffer)} for ${market} investor opportunities`);
  }

  if (mode === "commercial") {
    return normalizeSentence(`${sentenceCase(cleanOffer)} for ${lowerClean(propertyType)} in ${market}`);
  }

  return normalizeSentence(`${sentenceCase(cleanOffer)} in ${market}`);
}

function offerCta(mode: PrepaywallCampaignMode, offer: string) {
  const normalizedOffer = normalizeOfferForCampaign(offer, mode);
  if (normalizedOffer.normalizedOffer) {
    return normalizedOffer.cta;
  }

  const normalized = offer.toLowerCase();
  const cleanOffer = compactOffer(offer);

  if (/approval|credit|mortgage|pre[-\s]?approved/i.test(normalized)) {
    const scoreMatch = cleanOffer.match(/\b\d{3}\+?\b/);
    return scoreMatch ? `Check My ${scoreMatch[0].replace(/\+?$/, "+")} Approval Plan` : "Check My Approval Plan";
  }

  if (/guarantee|guaranteed|90\s*days?|sale|sell/i.test(normalized)) {
    return /90/.test(normalized) ? "Check My 90-Day Sale Plan" : "Check My Sale Plan";
  }

  if (mode === "seller") {
    return /value|worth/.test(normalized) ? "Get My Value Plan" : "Get My Sale Plan";
  }

  if (mode === "investor") {
    return /cash|deal|off-market|brrrr|multifamily/.test(normalized) ? "View Investor Deals" : "Get Deal Brief";
  }

  if (mode === "commercial") {
    return /lease|space|industrial|warehouse|office|retail/.test(normalized) ? "Find Available Space" : "Get Space Shortlist";
  }

  if (/listing|private|off-market/.test(normalized)) {
    return "See Matching Homes";
  }

  return cleanOffer && !/strategy call/i.test(cleanOffer)
    ? `Get ${cleanOffer}`
    : "Get Buyer Shortlist";
}

function buildPreviewContent(draft: PrepaywallCampaignPreviewDraft): PreviewContent {
  const market = clean(draft.market, "your market");
  const propertyType = clean(draft.propertyType, "selected inventory");
  const audience = clean(draft.audience, "qualified prospects");
  const offer = normalizeOfferForCampaign(clean(draft.offer, "strategy call"), draft.campaignMode).normalizedOffer;
  const priceRange = clean(draft.priceRange, "target range");
  const cta = offerCta(draft.campaignMode, offer);
  const offerHeadline = offerLedHeadline(draft.campaignMode, offer, market, propertyType, audience);
  const offerPhrase = compactOffer(offer);

  if (draft.campaignMode === "seller") {
    return {
      eyebrow: `Seller demand preview • ${market}`,
      headline: offerHeadline,
      primaryText: normalizeSentence(`${offerPhrase} stays front and center while DealFlow frames local demand, timing, and the next seller conversation.`),
      cta,
      funnelHero: offerHeadline,
      funnelSubtitle: normalizeSentence(`${market} demand, ${priceRange}, and ${lowerClean(offerPhrase)} become one clear seller lead path.`),
      visualLabel: "Home value concept",
      proofChips: ["Homeowner timing", "Demand angle", priceRange],
      readiness: ["Seller offer mapped", "Lead form framed", "Launch checklist started"],
    };
  }

  if (draft.campaignMode === "investor") {
    return {
      eyebrow: `Investor deal-flow preview • ${market}`,
      headline: offerHeadline,
      primaryText: normalizeSentence(`${offerPhrase} becomes a filtered investor angle with asset type, risk, and next-step criteria built into the lead path.`),
      cta,
      funnelHero: offerHeadline,
      funnelSubtitle: normalizeSentence(`${propertyType}, ${priceRange}, and ${lowerClean(offerPhrase)} are organized into a focused deal-flow request.`),
      visualLabel: "ROI brief concept",
      proofChips: ["ROI context", propertyType, priceRange],
      readiness: ["Investor angle mapped", "Qualification path drafted", "Credit-gated assets locked"],
    };
  }

  if (draft.campaignMode === "commercial") {
    return {
      eyebrow: `Commercial shortlist preview • ${market}`,
      headline: offerHeadline,
      primaryText: normalizeSentence(`${offerPhrase} stays visible while DealFlow shapes the use case, location fit, and practical commercial intake path.`),
      cta,
      funnelHero: offerHeadline,
      funnelSubtitle: normalizeSentence(`${audience} see ${lowerClean(offerPhrase)} before requesting the shortlist.`),
      visualLabel: "Space-fit concept",
      proofChips: ["Use-case fit", propertyType, priceRange],
      readiness: ["Commercial criteria mapped", "Funnel shell assembled", "Meta preflight waiting"],
    };
  }

  return {
    eyebrow: `Buyer access preview • ${market}`,
    headline: offerHeadline,
    primaryText: normalizeSentence(`${offerPhrase} stays visible while DealFlow turns the market, budget, and inventory fit into a focused buyer path for ${lowerClean(audience)}.`),
    cta,
    funnelHero: offerHeadline,
    funnelSubtitle: normalizeSentence(`${priceRange}, ${lowerClean(propertyType)}, and ${lowerClean(offerPhrase)} become one simple lead form promise.`),
    visualLabel: "Listing access concept",
    proofChips: ["Buyer intent", propertyType, priceRange],
    readiness: ["Buyer offer mapped", "Audience path drafted", "Preview ready for checkout"],
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

function PreviewChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-[11px] font-semibold text-white/72">
      {children}
    </span>
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
  compact = false,
}: {
  content: PreviewContent;
  draft: PrepaywallCampaignPreviewDraft;
  compact?: boolean;
}) {
  const tones = toneClasses(draft.campaignMode);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br",
        compact ? "flex min-h-[250px] flex-col p-3" : "p-4",
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
        {compact ? "Ad preview" : "DealFlow Preview"}
      </div>

      <div className={cn(
        "relative overflow-hidden rounded-[18px] border border-white/12 bg-black/30",
        compact ? "mt-7 min-h-[210px] flex-1" : "mt-8 aspect-[4/3]",
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.24),transparent_22%),radial-gradient(circle_at_82%_8%,rgba(103,232,249,0.2),transparent_20%),linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <span className={cn("max-w-[70%] truncate rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]", tones.accent)}>
            {content.visualLabel}
          </span>
          <span className="rounded-full border border-white/12 bg-black/38 px-2.5 py-1 text-[9px] font-semibold text-white/64">
            {formatBudget(draft.monthlyBudget)}
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
        Preview
      </div>
    </div>
  );
}

function FunnelPreviewMock({
  content,
  draft,
  compact = false,
}: {
  content: PreviewContent;
  draft: PrepaywallCampaignPreviewDraft;
  compact?: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-[22px] border border-white/10 bg-black/18"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-rose-300/70" />
          <span className="size-2.5 rounded-full bg-amber-300/70" />
          <span className="size-2.5 rounded-full bg-emerald-300/70" />
          <span className="ml-2 truncate rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/42">
            funnel preview / {draft.market || "market"}
          </span>
        </div>
      </div>

      <div className={cn("select-none", compact ? "p-3" : "p-4")}>
        <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">Funnel assembling</Badge>
        <h4 className={cn("mt-3 font-semibold leading-tight tracking-[-0.045em] text-white", compact ? "line-clamp-2 text-lg" : "text-2xl")}>
          {content.funnelHero}
        </h4>
        <p className={cn("mt-2 text-white/58", compact ? "line-clamp-2 text-xs leading-5" : "text-sm leading-6")}>{content.funnelSubtitle}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <PreviewChip>{getModeLabel(draft.campaignMode)}</PreviewChip>
          <PreviewChip>{draft.propertyType || "Inventory"}</PreviewChip>
          {!compact ? <PreviewChip>{draft.priceRange || "Range"}</PreviewChip> : null}
        </div>

        {compact ? (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/58">
            <span className="shrink-0 font-semibold uppercase tracking-[0.14em] text-white/44">Lead form</span>
            <span className="min-w-0 truncate">Name · Phone · {content.cta}</span>
          </div>
        ) : (
          <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Lead form preview</p>
            <div className="mt-3 grid gap-2">
              {["Name", "Email", "Phone", "Timeline"].map((field) => (
                <div key={field} className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs text-white/46">
                  {field}
                </div>
              ))}
            </div>
            <div className="mt-3 truncate rounded-full bg-white px-4 py-2 text-center text-xs font-black text-slate-950">
              {content.cta}
            </div>
          </div>
        )}
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
  const safeDraft = { ...defaultPreviewDraft, ...draft };
  safeDraft.offer = normalizeOfferForCampaign(safeDraft.offer, safeDraft.campaignMode).normalizedOffer;
  const content = buildPreviewContent(safeDraft);
  const agentName = [safeDraft.agentFirstName, safeDraft.agentLastName].filter(Boolean).join(" ") || "Agent not set";
  const packageMode = variant === "package";
  const compactMode = !packageMode;
  const sidecarMode = packageMode && density === "sidecar";

  if (compactMode) {
    return (
      <Card
        data-testid="prepaywall-campaign-preview"
        className={cn("grid h-full min-w-0 overflow-hidden p-4", className)}
      >
        <div className="grid gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="df-eyebrow text-cyan-100/76">Campaign preview</p>
              <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-tight tracking-[-0.045em] text-white">
                {content.headline}
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-white/56">
                Sample CTA: {content.cta}. Full generation unlocks after checkout and credits.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">Watermarked</Badge>
              <Badge className="border-violet-200/20 bg-violet-300/[0.055] text-violet-100">Locked</Badge>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(230px,0.95fr)_minmax(280px,1.05fr)]">
            <MockAdPreview content={content} draft={safeDraft} compact />

            <div className="grid min-w-0 content-start gap-3">
              <FunnelPreviewMock content={content} draft={safeDraft} compact />

              <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex min-w-0 items-start gap-3">
                  <MiniIconTile icon={FileText} className="size-8 rounded-xl" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">Copy angle</p>
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
                ["Agent", agentName],
                ["Market", safeDraft.market || "Not set"],
                ["Audience", safeDraft.audience || "Not set"],
                ["Offer", safeDraft.offer || "Not set"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</p>
                  <p className="truncate text-xs font-semibold text-white/82">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <CompactLockedPill icon={ImageIcon} label="Static locked" />
              <CompactLockedPill icon={Sparkles} label="AI image generation locked" />
              <CompactLockedPill icon={PlayCircle} label="AI video generation locked" />
              <CompactLockedPill icon={MonitorSmartphone} label="Full-resolution locked" />
            </div>

            <div className="flex min-w-0 items-start gap-2 rounded-[18px] border border-white/10 bg-black/18 px-3 py-2 text-[11px] leading-4 text-white/52">
              <MousePointerClick className="size-3.5 shrink-0 text-cyan-100" />
              <span>
                Nothing is sent, charged, or generated from this preview. No Meta campaign, SMS, lead, Stripe charge, AI image, or AI video is created here.
              </span>
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
          <p className="df-eyebrow text-cyan-100/76">Campaign package preview</p>
          <h3 className={cn("mt-2 line-clamp-2 font-semibold tracking-[-0.05em]", sidecarMode ? "text-lg" : "text-2xl")}>
            {content.headline}
          </h3>
          <p className={cn("mt-2 text-sm text-white/58", sidecarMode ? "line-clamp-2 leading-5" : "leading-6")}>
            Sample CTA: {content.cta}. Full generation unlocks after checkout and credits.
          </p>
        </div>
        <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">Watermarked</Badge>
      </div>

      <div className={cn(
        "mt-4 grid min-w-0 gap-3",
        sidecarMode ? "lg:grid-cols-[minmax(170px,0.72fr)_minmax(230px,1fr)]" : "xl:grid-cols-[minmax(260px,0.92fr)_minmax(0,1.08fr)]",
      )}>
        <MockAdPreview content={content} draft={safeDraft} compact={sidecarMode} />

        <div className="grid gap-3">
          <FunnelPreviewMock content={content} draft={safeDraft} compact={sidecarMode} />

          {!sidecarMode ? (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <MiniIconTile icon={FileText} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/44">Copy preview</p>
                  <h4 className="mt-2 text-lg font-semibold leading-tight text-white">{content.headline}</h4>
                  <p className="mt-2 text-sm leading-6 text-white/58">{content.primaryText}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2", sidecarMode ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
        {[
          ["Agent", agentName],
          ["Market", safeDraft.market || "Not set"],
          ["Audience", safeDraft.audience || "Not set"],
          ["Offer", safeDraft.offer || "Not set"],
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
            <p className="text-sm font-semibold text-white">Launch readiness summary</p>
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
        <CompactLockedPill icon={ImageIcon} label="Static creative locked" />
        <CompactLockedPill icon={Sparkles} label="AI image locked" />
        <CompactLockedPill icon={PlayCircle} label="AI video locked" />
        <CompactLockedPill icon={MonitorSmartphone} label="Full-resolution files locked" />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[18px] border border-white/10 bg-black/18 px-3 py-2.5 text-xs leading-5 text-white/54">
        <MousePointerClick className="size-4 text-cyan-100" />
        <span>
          Nothing is sent, charged, or generated from this preview. No Meta campaign, SMS, lead, Stripe charge, AI image, or AI video is created here.
        </span>
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
        planTier: selectedPlanTier ?? parsed.planTier ?? "starter",
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
