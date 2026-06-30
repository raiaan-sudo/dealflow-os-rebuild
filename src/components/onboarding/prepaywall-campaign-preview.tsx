"use client";

import { FileText, Image as ImageIcon, Lock, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CanonicalFunnelRenderer } from "@/components/funnels/canonical-funnel-renderer";
import { isInstantFormCampaign } from "@/lib/campaign-destination";
import type { WinningFunnelBlueprint } from "@/lib/funnels/winning-template/schema";
import { cn } from "@/lib/utils";

type LeadCaptureMode = "quality_funnel" | "volume_lead_form" | "deep_qualification";

export type PrepaywallCampaignPreviewDraft = {
  agentFirstName?: string;
  agentLastName?: string;
  agentCompanyName?: string;
  campaignMode?: string;
  market?: string;
  audience?: string;
  propertyType?: string;
  priceRange?: string;
  dailyBudget?: string;
  monthlyBudget?: string;
  offer?: string;
  leadCaptureMode?: LeadCaptureMode;
  planTier?: "performance" | "starter" | "pro";
};

type PrepaywallCampaignPreviewProps = {
  density?: "sidecar" | "full";
  draft: PrepaywallCampaignPreviewDraft;
  variant?: "compact" | "package";
};

function CompactLockedPill({
  icon: Icon,
  label,
  description,
}: {
  icon: typeof ImageIcon;
  label: string;
  description: string;
}) {
  return (
    <div
      title={description}
      className="flex items-center justify-between rounded-full border border-white/10 bg-black/18 px-4 py-2 text-xs font-semibold text-white/70"
    >
      <span className="flex items-center gap-2">
        <Icon className="size-3.5" />
        {label}
      </span>
      <Lock className="size-3.5 text-white/52" />
    </div>
  );
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function formatDailyBudget(dailyBudget?: string) {
  const parsed = Number(String(dailyBudget ?? "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "$30/day";
  }

  return `$${Math.round(parsed)}/day`;
}

function getInitials(draft: PrepaywallCampaignPreviewDraft) {
  const name = firstNonEmpty(
    [draft.agentFirstName, draft.agentLastName].filter(Boolean).join(" "),
    draft.agentCompanyName,
    "Local real estate team",
  );

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getAgentLabel(draft: PrepaywallCampaignPreviewDraft) {
  return firstNonEmpty(
    [draft.agentFirstName, draft.agentLastName].filter(Boolean).join(" "),
    draft.agentCompanyName,
    "Local real estate team",
  );
}

export function PrepaywallCampaignPreviewFromStorage({
  draft,
  fallbackDraft,
  campaignId: _campaignId,
  selectedPlanTier: _selectedPlanTier,
  ...props
}: Omit<PrepaywallCampaignPreviewProps, "draft"> & {
  campaignId?: string | null;
  selectedPlanTier?: string | null;
  draft?: PrepaywallCampaignPreviewDraft | null;
  fallbackDraft?: PrepaywallCampaignPreviewDraft | null;
}) {
  const resolvedDraft = draft ?? fallbackDraft ?? null;

  if (!resolvedDraft) {
    return null;
  }

  return <PrepaywallCampaignPreview draft={resolvedDraft} {...props} />;
}

function getCaptureCopy(mode: LeadCaptureMode | undefined) {
  if (mode === "volume_lead_form") {
    return {
      title: "Meta Instant Form Setup",
      body: "Leads stay inside Facebook and Instagram with full name, email, and phone collected by the native form.",
      footer: "No Meta instant form, campaign, ad, lead, SMS, or email is created from this preview.",
    };
  }

  if (mode === "deep_qualification") {
    return {
      title: "Deeper qualification funnel",
      body: "The public funnel can add stronger filtering before the contact step once the budget supports more friction.",
      footer: "Full qualification remains locked until launch setup.",
    };
  }

  return {
    title: "Canonical funnel preview",
    body: "The winning funnel balances lead quality and conversion before anything is launched.",
    footer: "Public page generation unlocks after launch access.",
  };
}

function buildHeadline(draft: PrepaywallCampaignPreviewDraft) {
  const market = firstNonEmpty(draft.market, "your market");
  const offer = firstNonEmpty(draft.offer, "matched property options");

  if (draft.campaignMode === "seller") {
    return `Find out what your home could sell for in ${market}.`;
  }

  if (draft.campaignMode === "investor") {
    return `Get a clearer view of investor opportunities in ${market}.`;
  }

  return `Get matched with ${offer.toLowerCase()} in ${market}.`;
}

function buildPreviewFunnel(draft: PrepaywallCampaignPreviewDraft): WinningFunnelBlueprint {
  const market = firstNonEmpty(draft.market, "Toronto, ON");
  const offer = firstNonEmpty(draft.offer, "matched property options");
  const agentName = getAgentLabel(draft);

  return {
    funnel_type: "landing_page_survey",
    headline: buildHeadline(draft),
    subheadline: "We will put together a personalized list matched to your budget, timeline, and goals.",
    cta: "Learn More",
    sections: [],
    form_fields: ["name", "email", "phone"],
    follow_up_action: "Lead alert",
    optimization_notes: [],
    funnelTemplateId: "reference_opt_in_funnel_v1",
    funnelTemplateVersion: 2,
    templateLocked: true,
    allowedEditSlots: ["market", "audience", "offer", "cta", "headline", "subheadline"],
    leadType: draft.campaignMode === "seller" ? "seller" : draft.campaignMode === "investor" ? "investor" : "buyer",
    campaignAngle: draft.campaignMode === "seller" ? "seller_valuation" : "buyer_access",
    language: "en",
    leadCaptureMode: draft.leadCaptureMode ?? "quality_funnel",
    theme: {
      primaryColor: "#102033",
      secondaryColor: "#f5efe4",
      accentColor: "#a8895f",
      fontPreset: "modern",
      logoUrl: null,
      agentPhotoUrl: null,
    },
    quizSteps: [],
    proofBadges: ["100% Free", "No Obligation", "Personalized Options", "Local Guidance"],
    testimonials: [],
    agent: {
      name: agentName,
      brokerageName: draft.agentCompanyName ?? agentName,
    },
  };
}

export function PrepaywallCampaignPreview({
  density = "sidecar",
  draft,
  variant = "compact",
}: PrepaywallCampaignPreviewProps) {
  const market = firstNonEmpty(draft.market, "Toronto, ON");
  const offer = firstNonEmpty(draft.offer, "Private Listings and a Fast Buyer Strategy Call");
  const audience = firstNonEmpty(draft.audience, "Move-ready buyers");
  const budget = formatDailyBudget(draft.dailyBudget);
  const captureCopy = getCaptureCopy(draft.leadCaptureMode);
  const packageMode = variant === "package";
  const compact = !packageMode;
  const instantForm = isInstantFormCampaign(draft);
  const previewFunnel = buildPreviewFunnel(draft);

  return (
    <Card
      data-testid="prepaywall-campaign-preview"
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "select-none overflow-hidden border-cyan-200/14 bg-[#06101d]/88 shadow-[0_22px_80px_-58px_rgba(103,232,249,0.7)]",
        compact ? "grid h-full min-w-0 overflow-hidden p-4" : "p-5",
        density === "sidecar" ? "h-fit lg:sticky lg:top-6" : "",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/78">
            {packageMode ? "Campaign package preview" : "Campaign preview"}
          </p>
          <h2 className="mt-2 line-clamp-2 text-xl font-semibold tracking-[-0.04em] text-white">
            {offer} for {audience.toLowerCase()}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/66">
            Sample CTA: Learn More. Full generation unlocks after checkout and credits.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-right">
          <Badge className="border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100">Watermarked</Badge>
          <Badge className="border-white/12 bg-white/[0.04] text-white/72">Locked</Badge>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-2">
        <div
          className={cn(
            "rounded-[24px] border border-cyan-200/14 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.025] to-violet-300/[0.04]",
            compact ? "self-start p-3" : "p-4",
          )}
        >
          <Badge className="border-white/10 bg-black/35 text-[10px] uppercase tracking-[0.18em] text-white">Ad preview</Badge>
          <div
            className={cn(
              "overflow-hidden rounded-[22px] border border-white/10 bg-[#111827] p-4 shadow-inner",
              compact ? "mt-7 h-[320px] max-h-[42vh]" : "mt-8 aspect-[4/3]",
            )}
          >
            <p className="pointer-events-none absolute -mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/24">
              DealFlow Preview
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-cyan-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950">
                Listing access
              </span>
              <span className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs font-semibold text-white/74">
                {budget}
              </span>
            </div>
            <div className="mt-20 rounded-[22px] border border-white/10 bg-black/22 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Buyer access preview</p>
              <p className="mt-3 line-clamp-2 text-base font-semibold text-white">{offer}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/66">
                {offer} stays visible while DealFlow turns your answers into a launch-ready campaign.
              </p>
              <button
                type="button"
                className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950"
                tabIndex={-1}
              >
                Learn More
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
          {instantForm ? (
            <div
              data-testid="instant-form-setup-preview"
              className="flex h-full min-h-[356px] flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.07] p-2 text-cyan-100">
                    <FileText className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">{captureCopy.title}</p>
                    <p className="mt-3 text-lg font-semibold leading-7 text-white">Leads stay inside Facebook and Instagram</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/66">{captureCopy.body}</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-black/16 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Lead form fields</p>
                {["Full name", "Email", "Phone number"].map((field) => (
                  <div key={field} className="mt-2 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/82">
                    <span>{field}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Required</span>
                  </div>
                ))}
              </div>
              <p className="rounded-[18px] border border-white/10 bg-black/16 p-3 text-xs leading-5 text-white/56">
                {captureCopy.footer}
              </p>
            </div>
          ) : (
            <CanonicalFunnelRenderer
              funnel={previewFunnel}
              campaignName={offer}
              market={market}
              brandLabel={getAgentLabel(draft)}
              mode="preview"
              compact
              className="max-h-[420px]"
            />
          )}
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-[560px] rounded-[20px] border border-white/10 bg-white/[0.035] p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <FileText className="size-4 text-cyan-100/80" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/54">Copy angle</p>
        </div>
        <p className="mt-2 line-clamp-1 text-sm font-semibold text-white">{offer}</p>
        <p className="mt-1 line-clamp-1 text-xs text-white/56">{offer} stays visible while DealFlow turns your answers into launch copy.</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {[
          ["Agent", getAgentLabel(draft)],
          ["Market", market],
          ["Audience", audience],
          ["Offer", offer],
        ].map(([label, value]) => (
          <div key={label} className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.04] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-emerald-200/15 bg-emerald-300/[0.07] text-emerald-100">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Launch readiness summary</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {["Buyer offer mapped", "Audience path ready", "Preview ready"].map((item) => (
                <span
                  key={item}
                  className="truncate rounded-full border border-white/10 bg-black/14 px-3 py-2 text-xs font-semibold text-white/64"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          [ImageIcon, "Static creative locked", "Static creative generation locked"],
          [Sparkles, "AI image locked", "AI image generation locked"],
          [FileText, "AI video locked", "AI video generation locked"],
          [Lock, instantForm ? "Meta instant form gated" : "Full-resolution files locked", "Full-resolution files locked"],
        ].map(([Icon, label, description]) => (
          <CompactLockedPill
            key={label as string}
            icon={Icon as typeof ImageIcon}
            label={label as string}
            description={description as string}
          />
        ))}
      </div>

      <p className="mt-3 rounded-[18px] border border-white/10 bg-black/18 px-4 py-3 text-xs leading-5 text-white/62">
        Nothing is sent, charged, or generated from this preview. No Meta campaign, SMS, lead, Stripe charge, AI image,
        AI video, GHL record, or public landing page is created here.
      </p>
    </Card>
  );
}
