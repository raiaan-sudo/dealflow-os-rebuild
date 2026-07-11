"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Home,
  Lightbulb,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
} from "lucide-react";
import { PrepaywallCampaignPreview } from "@/components/onboarding/prepaywall-campaign-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import type { BillingPlanTier } from "@/lib/billing/plans";
import { getPlanPresentation, SELECTABLE_PLAN_TIERS, type SelectablePlanTier } from "@/lib/billing/plan-presentation";
import {
  buildOnboardingDraftEnvelope,
  buildOnboardingSubmission,
  onboardingDraftSchema,
  type CampaignMode,
  type FunnelLanguage,
  type LeadCaptureMode,
  type OnboardingDraft,
  type OnboardingStepKey,
} from "@/lib/onboarding-contract";
import { normalizePhone } from "@/lib/phone";
import { normalizeOfferForCampaign, type NormalizedOfferResult } from "@/lib/services/offer-normalization-service";
import { cn } from "@/lib/utils";

type DraftState = OnboardingDraft;

type FieldErrors = Partial<Record<keyof DraftState | "submit", string>>;

type BillingStatus = {
  planTier: BillingPlanTier;
  billingState: string;
  subscriptionStatus: string;
  launchAllowed: boolean;
  launchOverride: boolean;
  campaignCount: number;
  canCreateAdditionalCampaign: boolean;
  hasUnlimitedCampaigns: boolean;
  canUseExistingLaunchAccess: boolean;
  campaignLimitLabel: string;
};

const LEGACY_PII_STORAGE_KEYS = ["dealflow-guided-onboarding-v3"] as const;

const STEPS: { key: OnboardingStepKey; label: string; title: string }[] = [
  { key: "intent", label: "Type", title: "Choose campaign type" },
  { key: "market", label: "Market", title: "Pick the city or market" },
  { key: "property", label: "Property", title: "Choose inventory focus" },
  { key: "audience", label: "Audience", title: "Define audience and price" },
  { key: "budget", label: "Budget", title: "Set budget and capture style" },
  { key: "setup", label: "Setup", title: "Configure capture path" },
  { key: "offer", label: "Offer", title: "Choose offer or lead magnet" },
  { key: "agent", label: "Agent", title: "Identify the agent" },
  { key: "plan", label: "Plan", title: "Confirm launch plan" },
  { key: "review", label: "Review", title: "Confirm and build" },
];

const MODE_DEFAULTS: Record<
  CampaignMode,
  {
    title: string;
    summary: string;
    path: string;
    audience: string;
    propertyType: string;
    priceRange: string;
    offer: string;
    icon: typeof Home;
  }
> = {
  buyer: {
    title: "Buyer leads",
    summary: "Attract active buyers with sharper search intent, a focused funnel, and a fast path to a consultation.",
    path: "Buyer leads in the selected market who are ready to compare listings and book a call.",
    audience: "Move-ready buyers actively comparing homes",
    propertyType: "Single Family Homes",
    priceRange: "$600k-$900k",
    offer: "Private listings and a fast buyer strategy call",
    icon: Home,
  },
  seller: {
    title: "Seller leads",
    summary: "Turn homeowner curiosity into listing conversations with stronger positioning and clearer proof.",
    path: "Seller leads in the selected market who want pricing, timing, and demand clarity.",
    audience: "Homeowners considering a sale in the next 12 months",
    propertyType: "Detached homes",
    priceRange: "$600k-$900k",
    offer: "Free home value and demand strategy call",
    icon: Building2,
  },
  investor: {
    title: "Investor leads",
    summary: "Help real estate agents attract investors who want clearer deal flow, yield context, and stronger filtering.",
    path: "Investor prospects who want deal flow and ROI context before they review properties.",
    audience: "Real estate investors looking for stronger deal flow",
    propertyType: "Cash-flow rentals",
    priceRange: "$500k-$1.5M",
    offer: "Investor deal flow and ROI brief",
    icon: CircleDollarSign,
  },
  commercial: {
    title: "Commercial leads",
    summary: "Capture business owners, tenants, and owner-users who need a practical commercial shortlist.",
    path: "Commercial clients evaluating lease, purchase, or expansion options in the selected market.",
    audience: "Business owners, tenants, and owner-users evaluating space",
    propertyType: "Office",
    priceRange: "Lease-ready",
    offer: "Commercial space-fit shortlist",
    icon: Store,
  },
};

const PROPERTY_TYPE_OPTIONS: Record<CampaignMode, { label: string; description: string }[]> = {
  buyer: [
    { label: "Single Family Homes", description: "Detached homes, townhomes, freestanding homes, and homes on larger lots." },
    { label: "First Time Buyer Homes", description: "Entry-point options for buyers who need a clearer first step." },
    { label: "New Construction", description: "Builder inventory, pre-construction, and newly built homes." },
    { label: "Luxury Homes", description: "Higher-intent buyers seeking premium private access." },
    { label: "Condos", description: "Condo buyers looking for sharper building and neighborhood fit." },
    { label: "Multi Unit Homes", description: "Duplexes, triplexes, and other multi-unit homes for buyers comparing income or flexible living options." },
  ],
  seller: [
    { label: "Detached homes", description: "Listing conversations with detached homeowners." },
    { label: "Townhomes", description: "Townhome owners comparing value, timing, and demand." },
    { label: "Condos", description: "Condo sellers who need pricing and building-specific demand clarity." },
    { label: "Luxury listings", description: "Premium homeowners who need a stronger launch plan." },
    { label: "Downsizer homes", description: "Owners weighing whether now is the right move-down window." },
    { label: "Probate/estate sale", description: "Estate-related sellers who need a practical next step." },
    { label: "Investment property owners", description: "Landlords and owners considering a sale or portfolio shift." },
  ],
  investor: [
    { label: "Cash-flow rentals", description: "Rental properties where investors care about yield and monthly spread." },
    { label: "Value-add properties", description: "Properties with upside through renovation, repositioning, or better operations." },
    { label: "Multifamily", description: "Apartment and small multifamily opportunities for investor buyers." },
    { label: "Duplex/triplex/fourplex", description: "Small multi-unit assets for house hackers and cash-flow buyers." },
    { label: "BRRRR opportunities", description: "Buy, rehab, rent, refinance, repeat opportunities." },
    { label: "Off-market deals", description: "Private or early-access opportunities before broad market exposure." },
    { label: "Pre-construction investment", description: "Pre-construction opportunities with investor-oriented context." },
    { label: "Fix-and-flip properties", description: "Short-horizon renovation deals and resale opportunities." },
  ],
  commercial: [
    { label: "Office", description: "Office space for tenants, owner-users, and professional teams." },
    { label: "Retail", description: "Retail space for operators comparing visibility, access, and location fit." },
    { label: "Industrial", description: "Industrial units for operators, investors, and users." },
    { label: "Warehouse", description: "Warehouse and logistics space with capacity and access requirements." },
    { label: "Mixed-use", description: "Mixed-use commercial properties with flexible use cases." },
    { label: "Owner-user", description: "Businesses evaluating purchase options for their own operations." },
    { label: "Lease opportunities", description: "Tenant-focused campaigns around lease-ready space." },
    { label: "Purchase opportunities", description: "Commercial purchase campaigns for buyers and owner-users." },
    { label: "Medical/professional space", description: "Clinics, medical offices, and professional-service spaces." },
    { label: "Land/development sites", description: "Commercial land, redevelopment, or buildable site opportunities." },
  ],
};

const DEFAULT_DRAFT: DraftState = {
  agentFirstName: "",
  agentLastName: "",
  agentCompanyName: "",
  agentPhone: "",
  campaignMode: "buyer",
  market: "Toronto, ON",
  audience: MODE_DEFAULTS.buyer.audience,
  propertyType: MODE_DEFAULTS.buyer.propertyType,
  priceRange: MODE_DEFAULTS.buyer.priceRange,
  dailyBudget: "30",
  offer: MODE_DEFAULTS.buyer.offer,
  funnelLanguage: "en",
  leadCaptureMode: "quality_funnel",
  leadFormQuestions: [],
  leadFormQuestionDraft: "",
  themePrimaryColor: "#17212c",
  themeSecondaryColor: "#f3eee5",
  themeAccentColor: "#f59e42",
  logoUrl: "",
  planTier: "pro",
  idempotencySeed: "",
};

const PRICE_RANGES = ["$400k-$600k", "$600k-$900k", "$900k-$1.5M", "$1.5M+"] as const;
const INVESTOR_PRICE_RANGES = ["<$500k", "$500k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const COMMERCIAL_PRICE_RANGES = ["Lease-ready", "$750k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const DAILY_BUDGETS = [
  { label: "$10/day", value: "10" },
  { label: "$20/day", value: "20" },
  { label: "$30/day", value: "30" },
  { label: "$50/day", value: "50" },
  { label: "$75/day", value: "75" },
  { label: "$100/day", value: "100" },
] as const;
const MIN_DAILY_BUDGET_CENTS = 500;
const MAX_DAILY_BUDGET_CENTS: number | null = null;

const LEAD_CAPTURE_MODE_ORDER: LeadCaptureMode[] = ["volume_lead_form", "quality_funnel", "deep_qualification"];

const LEAD_CAPTURE_MODES: Record<LeadCaptureMode, { title: string; label: string; body: string }> = {
  volume_lead_form: {
    title: "Volume leads",
    label: "Fast website form",
    body: "Use the shortest DealFlow-hosted form when budget is tight and consistent lead flow matters most.",
  },
  quality_funnel: {
    title: "Quality leads",
    label: "Funnel",
    body: "Use the winning funnel when the budget can support a stronger qualification path and warmer handoff.",
  },
  deep_qualification: {
    title: "Highest quality",
    label: "Deeper qualification",
    body: "Use more qualification before the contact step when budget gives the campaign room to filter harder.",
  },
};

const LEAD_FORM_QUESTION_PRESETS = [
  "What price range are you targeting?",
  "When are you hoping to move?",
  "Are you already pre-approved?",
  "What city or neighbourhood are you focused on?",
  "Do you have a property to sell first?",
  "What is your ideal property type?",
] as const;

const FUNNEL_LANGUAGES: Record<FunnelLanguage, { label: string; body: string }> = {
  en: { label: "English", body: "Generate funnel and ad copy in English." },
  fr: { label: "French", body: "Generate funnel and ad copy in French." },
  es: { label: "Spanish", body: "Generate funnel and ad copy in Spanish." },
};

function normalizeHexColor(value: string, fallback: string) {
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

const OFFER_SUGGESTIONS: Record<CampaignMode, string[]> = {
  buyer: [
    "Curated Home List",
    "Affordability Breakdown",
    "Early Access Listings",
    "First-Time Buyer Plan",
    "Relocation Shortlist",
    "Move-Up Strategy Plan",
    "Under-Market Deals",
    "Neighborhood Match Report",
    "Private Inventory Preview",
    "Monthly Payment Estimator",
  ],
  seller: [
    "Home Equity Snapshot Report",
    "Pre-Listing Buyer Demand Check",
    "Neighbourhood Sale Comparison Report",
    "Instant Home Value Range",
    "Sell vs Renovate Decision Report",
    "Downsizing Profit Calculator",
    "Timing the Market Report",
    "Private Buyer Match Preview",
    "14-Day Sale Analysis",
    "Listing Strategy Blueprint",
  ],
  investor: [
    "Cash Flow Deal List",
    "ROI Report",
    "Off-Market List",
    "Rent-to-Price Analysis",
    "BRRRR Candidate List",
    "Investor Pocket Map",
    "Underwritten Deal Sheet",
    "Multifamily Shortlist",
    "Monthly Cash Flow Estimate Tool",
    "Pre-Market Alert List",
  ],
  commercial: [
    "Available spaces shortlist",
    "Lease vs purchase strategy call",
    "Owner-user opportunity list",
    "Industrial/warehouse availability report",
    "Tenant relocation options",
    "Commercial market snapshot",
    "Development site shortlist",
  ],
};

const AUDIENCE_REASONS: Record<CampaignMode, string> = {
  buyer: "We chose this because buyers respond fastest when the campaign filters inventory by budget, lifestyle, and timing instead of sending generic listing noise.",
  seller: "We chose this because homeowners need a low-pressure way to understand equity, timing, and demand before they decide whether to list.",
  investor: "We chose this because investors care about filtered deal flow, rent-to-price logic, and underwritten opportunities more than generic property ads.",
  commercial: "We chose this because commercial prospects need space-fit criteria and use-case clarity before they are ready to talk.",
};

function createIdempotencySeed() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseCurrencyCents(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [dollarsPart, centsPart = ""] = normalized.split(".");
  const dollars = Number.parseInt(dollarsPart, 10);
  const cents = Number.parseInt(centsPart.padEnd(2, "0"), 10) || 0;
  const total = dollars * 100 + cents;

  return Number.isSafeInteger(total) ? total : null;
}

function dailyBudgetCentsFromDraft(draft: Pick<DraftState, "dailyBudget">) {
  return parseCurrencyCents(draft.dailyBudget);
}

function dailyBudgetDollarsFromCents(cents: number) {
  return cents / 100;
}

function monthlyCapDollarsFromDailyCents(cents: number) {
  return Math.round(cents * 30) / 100;
}

function formatAdSpend(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDailyBudgetFromDraft(draft: Pick<DraftState, "dailyBudget">) {
  const cents = dailyBudgetCentsFromDraft(draft);

  if (!cents || cents <= 0) {
    return "Daily budget not set";
  }

  return `${formatAdSpend(dailyBudgetDollarsFromCents(cents))}/day`;
}

function formatMonthlyEstimateFromDraft(draft: Pick<DraftState, "dailyBudget">) {
  const cents = dailyBudgetCentsFromDraft(draft);

  if (!cents || cents <= 0) {
    return null;
  }

  return `Estimated 30-day media spend: ${formatAdSpend(monthlyCapDollarsFromDailyCents(cents))}.`;
}

function recommendLeadCaptureMode(dailyBudgetCents: number | null): LeadCaptureMode {
  if (!dailyBudgetCents || dailyBudgetCents < 3000) return "volume_lead_form";
  if (dailyBudgetCents >= 10000) return "deep_qualification";
  return "quality_funnel";
}

function getLeadCaptureRecommendation(dailyBudgetCents: number | null) {
  const mode = recommendLeadCaptureMode(dailyBudgetCents);
  const option = LEAD_CAPTURE_MODES[mode];

  if (mode === "volume_lead_form") {
    return {
      mode,
      title: "Recommended: Volume leads",
      label: option.label,
      body: "Because this budget is under $30/day, keep friction low with the short DealFlow website form. Name, email, and phone are enough to start learning without depending on an unimplemented provider form.",
    };
  }

  if (mode === "deep_qualification") {
    return {
      mode,
      title: "Recommended: Highest quality",
      label: option.label,
      body: "At $100/day or more, the campaign has enough budget to add deeper qualification before the contact step and filter for stronger intent.",
    };
  }

  return {
    mode,
    title: "Recommended: Quality leads",
    label: option.label,
    body: "A $30-$75/day starting range works best with the funnel path because it balances conversion volume with better lead quality.",
  };
}

async function recordActivationEvent(params: {
  eventName: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await fetch("/api/activation/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
  } catch {
    // Activation telemetry is useful for operators but must never block onboarding.
  }
}

function getSubmissionErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues) &&
    typeof error.issues[0]?.message === "string"
  ) {
    return error.issues[0].message;
  }

  return error instanceof Error ? error.message : "Campaign could not be created.";
}

function IconTile({
  icon: Icon,
  tone = "cyan",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "cyan" | "violet" | "green" | "amber";
}) {
  const toneClass = {
    cyan: "border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100",
    violet: "border-violet-200/20 bg-violet-300/[0.06] text-violet-100",
    green: "border-emerald-200/20 bg-emerald-300/[0.06] text-emerald-100",
    amber: "border-amber-200/20 bg-amber-300/[0.06] text-amber-100",
  }[tone];

  return (
    <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl border", toneClass)}>
      <Icon className="size-5" />
    </div>
  );
}

function validateStep(step: OnboardingStepKey, draft: DraftState) {
  const errors: FieldErrors = {};
  const dailyBudgetCents = dailyBudgetCentsFromDraft(draft);

  if (step === "agent" || step === "review") {
    if (!draft.agentFirstName.trim()) errors.agentFirstName = "Add the agent first name.";
    if (!draft.agentLastName.trim()) errors.agentLastName = "Add the agent last name.";
    if (!draft.agentCompanyName.trim()) errors.agentCompanyName = "Add the company or brokerage.";
    if (!draft.agentPhone.trim()) errors.agentPhone = "Add the agent phone for lead alerts.";
    else if (!normalizePhone(draft.agentPhone)) errors.agentPhone = "Use a valid US or Canada phone number.";
  }

  if (step === "market" || step === "review") {
    if (!draft.market.trim()) errors.market = "Add the city or market this campaign should target.";
  }

  if (step === "property" || step === "review") {
    if (!draft.propertyType.trim()) errors.propertyType = "Add the property type or inventory focus.";
  }

  if (step === "audience" || step === "review") {
    if (!draft.audience.trim()) errors.audience = "Describe who the campaign should attract.";
    if (!draft.priceRange.trim()) errors.priceRange = "Choose a price range.";
  }

  if (step === "budget" || step === "review") {
    if (!dailyBudgetCents || dailyBudgetCents < MIN_DAILY_BUDGET_CENTS) {
      errors.dailyBudget = "Choose or enter a daily ad spend of at least $5/day.";
    } else if (MAX_DAILY_BUDGET_CENTS !== null && dailyBudgetCents > MAX_DAILY_BUDGET_CENTS) {
      errors.dailyBudget = "Daily ad spend must be $500/day or less for self-serve setup.";
    }
  }

  if (step === "setup" || step === "review") {
    if (draft.leadFormQuestions.length > 3) {
      errors.leadFormQuestionDraft = "Use at most 3 custom lead form questions.";
    }
  }

  if (step === "offer" || step === "review") {
    if (!draft.offer.trim()) errors.offer = "Add the offer or lead magnet for this campaign.";
  }

  return errors;
}

function StepProgress({
  currentStep,
  furthestStepIndex,
  steps,
  onSelect,
}: {
  currentStep: OnboardingStepKey;
  furthestStepIndex: number;
  steps: typeof STEPS;
  onSelect: (step: OnboardingStepKey) => void;
}) {
  const currentIndex = Math.max(steps.findIndex((step) => step.key === currentStep), 0);
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="df-eyebrow">Progress</p>
        <p className="text-sm font-semibold text-white/62">{progress}%</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#7c5cff,#55d5ff)] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
        {steps.map((step, index) => {
          const active = step.key === currentStep;
          const available = index <= furthestStepIndex;

          return (
            <button
              key={step.key}
              type="button"
              aria-current={active ? "step" : undefined}
              onClick={() => available && onSelect(step.key)}
              disabled={!available}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                active
                  ? "border-cyan-200/24 bg-cyan-300/[0.07]"
                  : "border-white/10 bg-white/[0.025] hover:border-cyan-200/18 hover:bg-white/[0.05]",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  index < currentIndex
                    ? "border-emerald-200/25 bg-emerald-300/[0.08] text-emerald-100"
                    : active
                      ? "border-cyan-200/30 bg-cyan-300/[0.1] text-cyan-100"
                      : "border-white/10 bg-white/[0.035] text-white/54",
                )}
              >
                {index < currentIndex ? <CheckCircle2 className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/62">
                  {step.label}
                </span>
                <span className="mt-1 hidden text-xs leading-snug text-white/44 lg:line-clamp-2">{step.title}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  body,
  detail,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "group min-h-[132px] rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5",
        active
          ? "border-cyan-200/28 bg-[linear-gradient(145deg,rgba(116,199,255,0.14),rgba(255,255,255,0.035))] shadow-[0_22px_70px_-48px_rgba(103,232,249,0.7)]"
          : "border-white/10 bg-white/[0.025] hover:border-cyan-200/20 hover:bg-cyan-300/[0.045]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={icon} tone={active ? "cyan" : "violet"} />
        {active ? <BadgeCheck className="size-5 text-cyan-100" /> : null}
      </div>
      <p className="mt-4 text-xl font-semibold tracking-[-0.05em] text-white">{title}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/64">{body}</p>
      {detail ? <p className="mt-3 text-sm font-semibold text-cyan-100">{detail}</p> : null}
    </button>
  );
}

function PlanChoiceCard({
  tier,
  active,
  onClick,
}: {
  tier: SelectablePlanTier;
  active: boolean;
  onClick: () => void;
}) {
  const plan = getPlanPresentation(tier);
  const Icon = tier === "starter" ? Lightbulb : Rocket;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "group flex min-h-[300px] flex-col rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5",
        active
          ? "border-cyan-200/30 bg-cyan-300/[0.075] shadow-[0_22px_70px_-48px_rgba(103,232,249,0.7)]"
          : "border-white/10 bg-white/[0.025] hover:border-cyan-200/20 hover:bg-cyan-300/[0.045]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={Icon} tone={active ? "cyan" : "violet"} />
        {active ? <BadgeCheck className="size-5 text-cyan-100" /> : null}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/72">{plan.eyebrow}</p>
      <h4 className="mt-2 text-xl font-semibold tracking-[-0.05em] text-white">
        {plan.name} {plan.priceLabel}
      </h4>
      <div className="mt-3 w-fit rounded-full border border-cyan-300/18 bg-cyan-300/[0.06] px-3 py-1 text-xs font-semibold text-cyan-100">
        {plan.positioning}
      </div>
      <p className="mt-3 text-sm leading-6 text-white/64">{plan.summary}</p>
      <div className="mt-4 grid gap-2">
        {plan.features.map((feature) => (
          <div key={feature} className="flex min-w-0 items-start gap-2 text-xs leading-5 text-white/70">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-cyan-100" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 inline-flex w-fit rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
        {plan.checkoutCtaLabel}
      </div>
      <p className="mt-auto pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
        {plan.footer}
      </p>
    </button>
  );
}

function OfferCoach({
  insight,
  onApply,
}: {
  insight: NormalizedOfferResult;
  onApply: (offer: string) => void;
}) {
  return (
    <div className="rounded-[20px] border border-cyan-200/16 bg-cyan-300/[0.045] p-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="cyan" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">Offer coach</p>
            {insight.changed ? (
              <Badge className="border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100">Polished</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-cyan-50">{insight.normalizedOffer}</p>
          <p className="mt-1 text-xs leading-5 text-white/58">{insight.coachNote}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply(insight.normalizedOffer)}
              className="rounded-full border border-cyan-200/18 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.09]"
            >
              Use polished offer
            </button>
            {insight.alternates.slice(0, 2).map((alternate) => (
              <button
                key={alternate}
                type="button"
                onClick={() => onApply(alternate)}
                className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-cyan-200/18 hover:text-cyan-100"
              >
                {alternate}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStepKey>("intent");
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  const [draft, setDraft] = useState<DraftState>(DEFAULT_DRAFT);
  const [persistenceRevision, setPersistenceRevision] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [isNewCampaignFlow, setIsNewCampaignFlow] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const canUseExistingLaunchAccess =
    billingStatus?.canUseExistingLaunchAccess === true &&
    (!isNewCampaignFlow || billingStatus.canCreateAdditionalCampaign);
  const visibleSteps = useMemo(
    () => (canUseExistingLaunchAccess ? STEPS.filter((step) => step.key !== "plan") : STEPS),
    [canUseExistingLaunchAccess],
  );
  const currentStepIndex = Math.max(visibleSteps.findIndex((step) => step.key === currentStep), 0);
  const modeCopy = MODE_DEFAULTS[draft.campaignMode];
  const propertyTypeOptions = PROPERTY_TYPE_OPTIONS[draft.campaignMode];
  const priceRangeOptions =
    draft.campaignMode === "commercial"
      ? COMMERCIAL_PRICE_RANGES
      : draft.campaignMode === "investor"
        ? INVESTOR_PRICE_RANGES
        : PRICE_RANGES;
  const offerInsight = useMemo(
    () => normalizeOfferForCampaign(draft.offer, draft.campaignMode),
    [draft.campaignMode, draft.offer],
  );
  const dailyBudgetCents = dailyBudgetCentsFromDraft(draft);
  const leadCaptureRecommendation = getLeadCaptureRecommendation(dailyBudgetCents);
  const instantLeadFormSelected = draft.leadCaptureMode === "volume_lead_form";
  const lowBudgetLeadForm = (dailyBudgetCents ?? 0) < 3000;
  const normalizedDraft = useMemo(
    () => ({ ...draft, offer: offerInsight.normalizedOffer }),
    [draft, offerInsight.normalizedOffer],
  );

  const stepTitle = useMemo(
    () => visibleSteps.find((step) => step.key === currentStep)?.title ?? "Build campaign",
    [currentStep, visibleSteps],
  );

  useEffect(() => {
    let cancelled = false;
    for (const legacyStorageKey of LEGACY_PII_STORAGE_KEYS) {
      window.localStorage.removeItem(legacyStorageKey);
    }
    const searchParams = new URLSearchParams(window.location.search);
    const shouldStartFresh = searchParams.get("new") === "1" || (!searchParams.get("resume") && !searchParams.get("campaignId"));
    setIsNewCampaignFlow(shouldStartFresh);

    if (shouldStartFresh) {
      setDraft({ ...DEFAULT_DRAFT, idempotencySeed: createIdempotencySeed() });
      setCurrentStep("intent");
      setFurthestStepIndex(0);
      setHydrated(true);
      return;
    }

    async function loadServerDraft() {
      let nextDraft = { ...DEFAULT_DRAFT, idempotencySeed: createIdempotencySeed() };
      let nextStep: OnboardingStepKey = "intent";
      let nextFurthestStepIndex = 0;

      try {
        const response = await fetch("/api/onboarding/plan", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => null)) as
          | {
              found?: boolean;
              draft?: unknown;
              currentStep?: unknown;
              furthestStepIndex?: unknown;
            }
          | null;
        const parsedDraft = onboardingDraftSchema.safeParse(data?.draft);

        if (response.ok && data?.found && parsedDraft.success) {
          nextDraft = parsedDraft.data;
          if (
            typeof data.currentStep === "string" &&
            STEPS.some((step) => step.key === data.currentStep)
          ) {
            nextStep = data.currentStep as OnboardingStepKey;
          }
          if (typeof data.furthestStepIndex === "number") {
            nextFurthestStepIndex = Math.min(
              Math.max(Math.floor(data.furthestStepIndex), 0),
              STEPS.length - 1,
            );
          }
        }
      } catch {
        // A fresh in-memory draft remains available when server draft recovery is unavailable.
      }

      if (!cancelled) {
        setDraft(nextDraft);
        setCurrentStep(nextStep);
        setFurthestStepIndex(nextFurthestStepIndex);
        setHydrated(true);
      }
    }

    void loadServerDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBillingStatus() {
      try {
        const response = await fetch("/api/billing/status", {
          headers: {
            Accept: "application/json",
          },
        });
        const data = (await response.json().catch(() => null)) as BillingStatus | null;
        if (!cancelled && response.ok && data) {
          setBillingStatus(data);
          if (data.planTier === "pro" || data.planTier === "growth") {
            setDraft((current) => ({ ...current, planTier: "pro" }));
          }
        }
      } catch {
        // Billing status improves routing for active subscribers but must not block onboarding.
      }
    }

    void loadBillingStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (canUseExistingLaunchAccess && currentStep === "plan") {
      const reviewIndex = visibleSteps.findIndex((step) => step.key === "review");
      setCurrentStep("review");
      setFurthestStepIndex((current) => Math.max(current, reviewIndex));
    }
  }, [canUseExistingLaunchAccess, currentStep, visibleSteps]);

  useEffect(() => {
    // Hydration, billing reads, and automatic routing are observational. A
    // durable draft write begins only after an explicit user interaction has
    // incremented the revision.
    if (!hydrated || persistenceRevision === 0) return;

    const saveTimer = window.setTimeout(() => {
      let envelope: ReturnType<typeof buildOnboardingDraftEnvelope>;

      try {
        envelope = buildOnboardingDraftEnvelope({
          draft,
          currentStep,
          furthestStepIndex,
        });
      } catch {
        return;
      }

      void fetch("/api/onboarding/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
    }, 800);

    return () => window.clearTimeout(saveTimer);
  }, [currentStep, draft, furthestStepIndex, hydrated, persistenceRevision]);

  function updateDraft(nextDraft: Partial<DraftState>) {
    setDraft((current) => ({ ...current, ...nextDraft }));
    setPersistenceRevision((current) => current + 1);
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(nextDraft) as (keyof DraftState)[]) {
        delete next[key];
      }
      delete next.submit;
      return next;
    });
  }

  function selectMode(campaignMode: CampaignMode) {
    const defaults = MODE_DEFAULTS[campaignMode];
    updateDraft({
      campaignMode,
      audience: defaults.audience,
      propertyType: defaults.propertyType,
      priceRange: defaults.priceRange,
      offer: defaults.offer,
    });
  }

  function applyOffer(offer: string) {
    updateDraft({ offer: normalizeOfferForCampaign(offer, draft.campaignMode).normalizedOffer });
  }

  function updateDailyBudget(value: string) {
    const nextBudgetCents = parseCurrencyCents(value);
    updateDraft({
      dailyBudget: value,
      leadCaptureMode: recommendLeadCaptureMode(nextBudgetCents),
    });
  }

  function toggleLeadFormQuestion(question: string) {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;

    const alreadySelected = draft.leadFormQuestions.includes(normalizedQuestion);
    if (alreadySelected) {
      updateDraft({
        leadFormQuestions: draft.leadFormQuestions.filter((selectedQuestion) => selectedQuestion !== normalizedQuestion),
      });
      return;
    }

    if (draft.leadFormQuestions.length >= 3) return;
    updateDraft({ leadFormQuestions: [...draft.leadFormQuestions, normalizedQuestion] });
  }

  function addCustomLeadFormQuestion() {
    const normalizedQuestion = draft.leadFormQuestionDraft.trim();
    if (!normalizedQuestion || draft.leadFormQuestions.length >= 3) return;

    updateDraft({
      leadFormQuestions: [...draft.leadFormQuestions.filter((question) => question !== normalizedQuestion), normalizedQuestion].slice(0, 3),
      leadFormQuestionDraft: "",
    });
  }

  function goToStep(step: OnboardingStepKey) {
    setCurrentStep(step);
    setPersistenceRevision((current) => current + 1);
    setErrors({});
  }

  function goBack() {
    if (currentStepIndex > 0) {
      goToStep(visibleSteps[currentStepIndex - 1].key);
    }
  }

  async function submitOnboarding() {
    const preparedDraft = { ...draft, offer: normalizeOfferForCampaign(draft.offer, draft.campaignMode).normalizedOffer };
    const nextErrors = validateStep("review", preparedDraft);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);

    try {
      const submission = buildOnboardingSubmission(preparedDraft);
      const response = await fetch("/api/onboarding/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; campaignId?: string; data?: { campaignId?: string }; error?: string }
        | null;
      const campaignId = data?.campaignId ?? data?.data?.campaignId ?? null;

      if (!response.ok || !data?.success || !campaignId) {
        throw new Error(data?.error ?? "Campaign could not be created.");
      }

      if (canUseExistingLaunchAccess) {
        router.push(`/build/creatives?campaignId=${encodeURIComponent(campaignId)}`);
        return;
      }

      const checkoutResponse = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaignId, planTier: "pro" }),
      });
      const checkoutData = (await checkoutResponse.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!checkoutResponse.ok || !checkoutData?.url) {
        throw new Error(checkoutData?.error ?? "Checkout could not be started.");
      }

      window.location.assign(checkoutData.url);
    } catch (error) {
      setSubmitting(false);
      setErrors((current) => ({
        ...current,
        submit: getSubmissionErrorMessage(error),
      }));
    }
  }

  function continueFlow() {
    const preparedDraft =
      currentStep === "offer" || currentStep === "review"
        ? { ...draft, offer: normalizeOfferForCampaign(draft.offer, draft.campaignMode).normalizedOffer }
        : draft;
    const nextErrors = validateStep(currentStep, preparedDraft);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    if (preparedDraft.offer !== draft.offer) {
      setDraft(preparedDraft);
    }

    if (currentStepIndex >= visibleSteps.length - 1) {
      void submitOnboarding();
      return;
    }

    const nextIndex = currentStepIndex + 1;
    setFurthestStepIndex((current) => Math.max(current, nextIndex));
    void recordActivationEvent({
      eventName: "onboarding_step_completed",
      idempotencyKey: `onboarding_step_completed:${draft.idempotencySeed}:${currentStep}`,
      metadata: {
        stepKey: currentStep,
        mode: draft.campaignMode,
        planTier: draft.planTier,
      },
    });
    goToStep(visibleSteps[nextIndex].key);
  }

  function resetDraft() {
    const freshDraft = { ...DEFAULT_DRAFT, idempotencySeed: createIdempotencySeed() };
    setIsNewCampaignFlow(true);
    setDraft(freshDraft);
    setCurrentStep("intent");
    setFurthestStepIndex(0);
    setPersistenceRevision((current) => current + 1);
    setErrors({});
  }

  const activeErrorMessages = Object.values(errors).filter(
    (message): message is string => typeof message === "string" && message.length > 0,
  );

  return (
    <PageShell className="w-full max-w-[1240px] gap-3 py-4 sm:py-5">
      <StepProgress currentStep={currentStep} furthestStepIndex={furthestStepIndex} steps={visibleSteps} onSelect={goToStep} />

      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(390px,0.72fr)]">
        <Card className="h-full min-w-0 p-4" data-testid="onboarding-current-step-panel">
          <div className="flex items-start gap-4">
            <IconTile icon={Target} tone="cyan" />
            <div>
              <p className="df-eyebrow">Current step</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">{stepTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-white/64">
                Answer this step, watch the campaign preview update, then continue.
              </p>
            </div>
          </div>

          {activeErrorMessages.length > 0 ? (
            <div
              className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm text-rose-100"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <p className="font-semibold">Fix the highlighted field before continuing.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {activeErrorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {currentStep === "intent" ? (
            <>
              <p className="mt-6 text-sm font-medium text-foreground">Who should this first campaign attract?</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(Object.keys(MODE_DEFAULTS) as CampaignMode[]).map((mode) => {
                  const item = MODE_DEFAULTS[mode];
                  return (
                    <ChoiceCard
                      active={draft.campaignMode === mode}
                      body={item.summary}
                      detail={draft.campaignMode === mode ? "Selected" : `Choose ${item.title.toLowerCase()}`}
                      icon={item.icon}
                      key={mode}
                      onClick={() => selectMode(mode)}
                      title={item.title}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          {currentStep === "market" ? (
            <div className="mt-6 grid gap-5">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">City or market</span>
                <Input
                  value={draft.market}
                  onChange={(event) => updateDraft({ market: event.target.value })}
                  placeholder="Toronto, ON"
                  aria-invalid={Boolean(errors.market)}
                  aria-describedby={errors.market ? "onboarding-market-error" : undefined}
                />
                {errors.market ? <p id="onboarding-market-error" className="text-sm text-rose-400">{errors.market}</p> : null}
              </label>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.025] p-5">
                <p className="text-sm font-semibold text-white">Current campaign type</p>
                <p className="mt-2 text-sm leading-7 text-white/64">
                  {modeCopy.path.replace("the selected market", draft.market || "your selected market")}
                </p>
              </div>
            </div>
          ) : null}

          {currentStep === "property" ? (
            <div className="mt-6">
              <p className="text-sm font-medium text-foreground">What kind of property or inventory should this target?</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {propertyTypeOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={draft.propertyType === option.label}
                    onClick={() => updateDraft({ propertyType: option.label })}
                    className={cn(
                      "group rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5",
                      draft.propertyType === option.label
                        ? "border-cyan-200/28 bg-cyan-300/[0.07] shadow-[0_18px_55px_-40px_rgba(103,232,249,0.75)]"
                        : "border-white/10 bg-white/[0.03] hover:border-cyan-200/18 hover:bg-white/[0.05]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <IconTile icon={modeCopy.icon} tone={draft.propertyType === option.label ? "cyan" : "violet"} />
                      <div>
                        <p className="text-base font-semibold text-white">{option.label}</p>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-white/62">{option.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {errors.propertyType ? <p className="mt-2 text-sm text-rose-400">{errors.propertyType}</p> : null}
            </div>
          ) : null}

          {currentStep === "audience" ? (
            <div className="mt-6 grid gap-6">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Recommended audience</span>
                <Input
                  value={draft.audience}
                  onChange={(event) => updateDraft({ audience: event.target.value })}
                  placeholder={modeCopy.audience}
                  aria-invalid={Boolean(errors.audience)}
                  aria-describedby={errors.audience ? "onboarding-audience-error" : undefined}
                />
                <p className="text-xs leading-5 text-cyan-100/72">{AUDIENCE_REASONS[draft.campaignMode]}</p>
                {errors.audience ? <p id="onboarding-audience-error" className="text-sm text-rose-400">{errors.audience}</p> : null}
              </label>

              <div>
                <p className="text-sm font-medium text-foreground">Price range or deal size</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {priceRangeOptions.map((range) => (
                    <button
                      key={range}
                      type="button"
                      aria-pressed={draft.priceRange === range}
                      onClick={() => updateDraft({ priceRange: range })}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        draft.priceRange === range
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {range}
                    </button>
                  ))}
                </div>
                {errors.priceRange ? <p id="onboarding-price-range-error" className="mt-2 text-sm text-rose-400">{errors.priceRange}</p> : null}
              </div>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Custom price range or deal size</span>
                <Input
                  value={draft.priceRange}
                  onChange={(event) => updateDraft({ priceRange: event.target.value })}
                  placeholder="$600k-$900k, lease-ready, or custom deal size"
                  aria-invalid={Boolean(errors.priceRange)}
                  aria-describedby={errors.priceRange ? "onboarding-price-range-error" : undefined}
                />
              </label>
            </div>
          ) : null}

          {currentStep === "budget" ? (
            <div className="mt-6 grid gap-6">
              <div>
                <p className="text-sm font-medium text-foreground">Daily ad spend budget</p>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  This is the media budget that goes directly to Facebook. DealFlow uses it to recommend the right lead
                  capture path before anything is launched.
                </p>
                <div className="mt-3 rounded-[20px] border border-emerald-300/18 bg-emerald-300/[0.055] p-4">
                  <p className="text-sm font-semibold text-emerald-100">Recommended starting budget: $30-$50/day</p>
                  <p className="mt-1 text-xs leading-5 text-white/58">
                    That range is usually enough to balance lead quality with enough daily signal for Meta to learn.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {DAILY_BUDGETS.map((budget) => (
                    <button
                      key={budget.value}
                      type="button"
                      aria-pressed={draft.dailyBudget === budget.value}
                      onClick={() => updateDailyBudget(budget.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        draft.dailyBudget === budget.value
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {budget.label}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">Custom daily amount</span>
                  <Input
                    type="number"
                    min={5}
                    step="1"
                    inputMode="decimal"
                    value={draft.dailyBudget}
                    onChange={(event) => updateDailyBudget(event.target.value)}
                    placeholder="30"
                    aria-label="Custom daily ad spend amount"
                    aria-invalid={Boolean(errors.dailyBudget)}
                    aria-describedby={errors.dailyBudget ? "onboarding-daily-budget-error" : undefined}
                  />
                </label>
                <p className="mt-2 text-xs leading-5 text-white/52">
                  Starter keeps you in control. This is a daily media budget input, not a monthly commitment.
                </p>
                {formatMonthlyEstimateFromDraft(draft) ? (
                  <p className="mt-1 text-xs leading-5 text-white/42">{formatMonthlyEstimateFromDraft(draft)}</p>
                ) : null}
                {errors.dailyBudget ? <p id="onboarding-daily-budget-error" className="mt-2 text-sm text-rose-400">{errors.dailyBudget}</p> : null}
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Lead capture style</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      Choose how the funnel should capture the lead. This changes the funnel path without changing launch safety gates.
                    </p>
                  </div>
                  <Badge className="border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100">
                    {leadCaptureRecommendation.label}
                  </Badge>
                </div>
                <div className="mt-3 rounded-[18px] border border-cyan-200/16 bg-cyan-300/[0.045] p-4 transition">
                  <p className="text-sm font-semibold text-cyan-100">{leadCaptureRecommendation.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/60">{leadCaptureRecommendation.body}</p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {LEAD_CAPTURE_MODE_ORDER.map((mode) => {
                    const option = LEAD_CAPTURE_MODES[mode];
                    const selected = draft.leadCaptureMode === mode;
                    const recommended = leadCaptureRecommendation.mode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateDraft({ leadCaptureMode: mode })}
                        className={cn(
                          "rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5",
                          selected
                            ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                            : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                        )}
                      >
                        <span className="block text-sm font-semibold text-white">{option.title}</span>
                        <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
                          {option.label}
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-white/58">{option.body}</span>
                        {recommended ? (
                          <span className="mt-3 block w-fit rounded-full border border-emerald-300/18 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            Recommended
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === "setup" ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div>
                  <p className="text-sm font-medium text-foreground">Language</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">
                    Pick the language for the funnel, ad copy, and creative prompts.
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(Object.keys(FUNNEL_LANGUAGES) as FunnelLanguage[]).map((language) => {
                      const option = FUNNEL_LANGUAGES[language];
                      const selected = draft.funnelLanguage === language;

                      return (
                        <button
                          key={language}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateDraft({ funnelLanguage: language })}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            selected
                              ? "border-cyan-200/28 bg-cyan-300/[0.07]"
                              : "border-white/10 bg-white/[0.035] hover:border-cyan-200/18",
                          )}
                        >
                          <span className="block text-sm font-semibold text-white">{option.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-white/54">{option.body}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {instantLeadFormSelected ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">Fast website form questions</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      The DealFlow form already collects full name, email, and phone number. Add up to 3 questions
                      only when the budget can support more friction.
                    </p>
                    <div
                      className={cn(
                        "mt-3 rounded-[18px] border p-4",
                        lowBudgetLeadForm
                          ? "border-amber-300/20 bg-amber-300/[0.055]"
                          : "border-cyan-200/16 bg-cyan-300/[0.045]",
                      )}
                    >
                      <p className={cn("text-sm font-semibold", lowBudgetLeadForm ? "text-amber-100" : "text-cyan-100")}>
                        {lowBudgetLeadForm
                          ? "Under $30/day: keep the form simple"
                          : "Budget supports light qualification"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-white/60">
                        {lowBudgetLeadForm
                          ? "We recommend no extra questions beyond name, email, and phone so the campaign can produce enough leads to learn."
                          : "You can add 1-3 qualification questions to improve quality while keeping the form usable."}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {LEAD_FORM_QUESTION_PRESETS.map((question) => {
                        const selected = draft.leadFormQuestions.includes(question);
                        const disabled = !selected && draft.leadFormQuestions.length >= 3;

                        return (
                          <button
                            key={question}
                            type="button"
                            aria-pressed={selected}
                            disabled={disabled}
                            onClick={() => toggleLeadFormQuestion(question)}
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
                              selected
                                ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                                : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                            )}
                          >
                            {question}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Input
                        value={draft.leadFormQuestionDraft}
                        onChange={(event) => updateDraft({ leadFormQuestionDraft: event.target.value })}
                        placeholder="Add a custom qualification question"
                        aria-label="Custom lead form question"
                        aria-invalid={Boolean(errors.leadFormQuestionDraft)}
                        aria-describedby={errors.leadFormQuestionDraft ? "onboarding-lead-question-error" : undefined}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addCustomLeadFormQuestion}
                        disabled={draft.leadFormQuestions.length >= 3 || !draft.leadFormQuestionDraft.trim()}
                      >
                        Add
                      </Button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/48">
                      Selected {draft.leadFormQuestions.length}/3. Standard fields are always included.
                    </p>
                    {errors.leadFormQuestionDraft ? <p id="onboarding-lead-question-error" className="mt-2 text-sm text-rose-400">{errors.leadFormQuestionDraft}</p> : null}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">Funnel branding</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      Set the colors and optional logo used by the winning funnel preview and public page.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        ["Primary", "themePrimaryColor"],
                        ["Background", "themeSecondaryColor"],
                        ["Accent", "themeAccentColor"],
                      ].map(([label, key]) => (
                        <label key={key} className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/48">
                          <span>{label}</span>
                          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/18 p-2">
                            <input
                              type="color"
                              value={draft[key as "themePrimaryColor" | "themeSecondaryColor" | "themeAccentColor"]}
                              onChange={(event) => updateDraft({ [key]: event.target.value } as Partial<DraftState>)}
                              className="h-9 w-10 rounded-md border border-white/10 bg-transparent"
                              aria-label={`${label} funnel color`}
                            />
                            <Input
                              value={draft[key as "themePrimaryColor" | "themeSecondaryColor" | "themeAccentColor"]}
                              onChange={(event) => updateDraft({ [key]: event.target.value } as Partial<DraftState>)}
                              className="h-9"
                              aria-label={`${label} funnel hex color`}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block space-y-2 text-sm">
                      <span className="text-muted-foreground">Logo URL optional</span>
                      <Input
                        value={draft.logoUrl}
                        onChange={(event) => updateDraft({ logoUrl: event.target.value })}
                        placeholder="https://example.com/logo.png"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {currentStep === "offer" ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">Why this matters</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    The offer is the reason someone gives you their contact info. It should make the next step obvious
                    and useful before they talk to the agent.
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">What makes it good</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    Strong offers are specific, low pressure, and tied to a clear benefit: a shortlist, valuation,
                    plan, market check, or matched options.
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">Improve quality</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    Risk reversals like free, no obligation, private review, and truthful timeframes help people
                    respond while keeping expectations clear.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Offer or lead magnet</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">
                    This is the reason someone gives you their contact info. DealFlow can pick a starting offer, or you can customize it.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OFFER_SUGGESTIONS[draft.campaignMode].map((offer) => (
                    <button
                      type="button"
                      key={offer}
                      aria-pressed={
                        offerInsight.normalizedOffer ===
                        normalizeOfferForCampaign(offer, draft.campaignMode).normalizedOffer
                      }
                      onClick={() => applyOffer(offer)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        offerInsight.normalizedOffer === normalizeOfferForCampaign(offer, draft.campaignMode).normalizedOffer
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {offer}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label="Offer or lead magnet"
                  value={draft.offer}
                  onChange={(event) => updateDraft({ offer: event.target.value })}
                  onBlur={() => applyOffer(draft.offer)}
                  placeholder={modeCopy.offer}
                  aria-invalid={Boolean(errors.offer)}
                  aria-describedby={errors.offer ? "onboarding-offer-error" : undefined}
                />
                {errors.offer ? <p id="onboarding-offer-error" className="text-sm text-rose-400">{errors.offer}</p> : null}
              </div>
            </div>
          ) : null}

          {currentStep === "agent" ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Agent first name</span>
                <Input value={draft.agentFirstName} onChange={(event) => updateDraft({ agentFirstName: event.target.value })} placeholder="Jane" aria-invalid={Boolean(errors.agentFirstName)} aria-describedby={errors.agentFirstName ? "onboarding-agent-first-name-error" : undefined} />
                {errors.agentFirstName ? <p id="onboarding-agent-first-name-error" className="text-sm text-rose-400">{errors.agentFirstName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Agent last name</span>
                <Input value={draft.agentLastName} onChange={(event) => updateDraft({ agentLastName: event.target.value })} placeholder="Smith" aria-invalid={Boolean(errors.agentLastName)} aria-describedby={errors.agentLastName ? "onboarding-agent-last-name-error" : undefined} />
                {errors.agentLastName ? <p id="onboarding-agent-last-name-error" className="text-sm text-rose-400">{errors.agentLastName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Company or brokerage</span>
                <Input value={draft.agentCompanyName} onChange={(event) => updateDraft({ agentCompanyName: event.target.value })} placeholder="Smith Realty Group" aria-invalid={Boolean(errors.agentCompanyName)} aria-describedby={errors.agentCompanyName ? "onboarding-agent-company-error" : undefined} />
                {errors.agentCompanyName ? <p id="onboarding-agent-company-error" className="text-sm text-rose-400">{errors.agentCompanyName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">SMS alert phone</span>
                <Input value={draft.agentPhone} onChange={(event) => updateDraft({ agentPhone: event.target.value })} placeholder="(555) 555-5555" inputMode="tel" aria-invalid={Boolean(errors.agentPhone)} aria-describedby={errors.agentPhone ? "onboarding-agent-phone-help onboarding-agent-phone-error" : "onboarding-agent-phone-help"} />
                <p id="onboarding-agent-phone-help" className="text-xs leading-5 text-muted-foreground">
                  Use a US or Canada number so lead alerts can be routed correctly.
                </p>
                {errors.agentPhone ? <p id="onboarding-agent-phone-error" className="text-sm text-rose-400">{errors.agentPhone}</p> : null}
              </label>
            </div>
          ) : null}

          {currentStep === "plan" ? (
            <div className="mt-6 grid items-stretch gap-4">
              {SELECTABLE_PLAN_TIERS.map((tier) => (
                <PlanChoiceCard
                  key={tier}
                  tier={tier}
                  active
                  onClick={() => updateDraft({ planTier: "pro" })}
                />
              ))}
              <div className="rounded-[22px] border border-cyan-300/16 bg-cyan-300/[0.045] p-4 text-sm leading-6 text-cyan-50/78">
                <p className="font-semibold text-white">One plan only.</p>
                <p className="mt-1">
                  Performance usage billing and guided-launch-only behavior are archived for new signups.
                  Existing users keep their current access, but new campaigns activate through Operator Launch at $297/month.
                </p>
              </div>
            </div>
          ) : null}

          {currentStep === "review" ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-[22px] border border-emerald-300/18 bg-emerald-300/[0.045] p-5">
                <div className="flex items-start gap-3">
                  <IconTile icon={ShieldCheck} tone="green" />
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.04em]">Ready to build campaign preview</h3>
                    <p className="mt-2 text-sm leading-7 text-white/64">
                      {canUseExistingLaunchAccess
                        ? "Continue saves the campaign, updates the agent profile for lead alerts, and opens creative selection. No live ad, payment, message, or media action runs here."
                        : "Continue saves the campaign, updates the agent profile for lead alerts, and opens Pro activation. No live ad, message, or media action runs here."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {[
                  ["Agent", [draft.agentFirstName, draft.agentLastName].filter(Boolean).join(" ")],
                  ["Campaign mode", modeCopy.title],
                  ["Market", draft.market],
                  ["Property type", draft.propertyType],
                  ["Price/deal size", draft.priceRange],
                  ["Daily ad spend", formatDailyBudgetFromDraft(draft)],
                  ["30-day estimate", formatMonthlyEstimateFromDraft(draft)?.replace("Estimated 30-day media spend: ", "").replace(/\.$/, "") ?? "Not set"],
                  ["Offer", normalizedDraft.offer],
                  [
                    "Launch access",
                    canUseExistingLaunchAccess
                      ? billingStatus?.hasUnlimitedCampaigns
                        ? "Pro access: unlimited campaign slots"
                        : "Existing plan: campaign slot available"
                      : getPlanPresentation(draft.planTier).positioning,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-xs text-white/48">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-white/86">{value}</p>
                  </div>
                ))}
              </div>
              {errors.submit ? <p className="text-sm text-rose-300">{errors.submit}</p> : null}
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <Button type="button" variant="secondary" onClick={resetDraft} disabled={submitting}>
              Start over
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={goBack} disabled={currentStepIndex === 0 || submitting}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button type="button" onClick={continueFlow} disabled={submitting}>
                {submitting ? (
                  <>
                    Saving campaign
                    <Loader2 className="size-4 animate-spin" />
                  </>
                ) : currentStep === "review" ? (
                  <>
                    {canUseExistingLaunchAccess ? "Continue to creatives" : "Activate Pro"}
                    {canUseExistingLaunchAccess ? <ArrowRight className="size-4" /> : <BarChart3 className="size-4" />}
                  </>
                ) : (
                  <>
                    Continue to {visibleSteps[currentStepIndex + 1]?.label.toLowerCase()}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        <PrepaywallCampaignPreview
          density="sidecar"
          draft={normalizedDraft}
          variant={currentStep === "review" ? "package" : "compact"}
        />
      </div>
    </PageShell>
  );
}
