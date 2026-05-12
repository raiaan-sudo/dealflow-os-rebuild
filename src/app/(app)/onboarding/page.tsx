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
import { normalizePhone } from "@/lib/phone";
import { normalizeOfferForCampaign, type NormalizedOfferResult } from "@/lib/services/offer-normalization-service";
import { cn } from "@/lib/utils";

type CampaignMode = "buyer" | "seller" | "investor" | "commercial";
type OnboardingStepKey = "intent" | "market" | "property" | "offer" | "agent" | "plan" | "review";

type DraftState = {
  agentFirstName: string;
  agentLastName: string;
  agentCompanyName: string;
  agentPhone: string;
  campaignMode: CampaignMode;
  market: string;
  audience: string;
  propertyType: string;
  priceRange: string;
  monthlyBudget: string;
  offer: string;
  planTier: Extract<BillingPlanTier, "starter" | "pro">;
  idempotencySeed: string;
};

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
  campaignLimitLabel: string;
};

const STORAGE_KEY = "dealflow-guided-onboarding-v3";

const STEPS: { key: OnboardingStepKey; label: string; title: string }[] = [
  { key: "intent", label: "Type", title: "Choose campaign type" },
  { key: "market", label: "Market", title: "Pick the city or market" },
  { key: "property", label: "Property", title: "Choose inventory focus" },
  { key: "offer", label: "Offer", title: "Shape the audience and offer" },
  { key: "agent", label: "Agent", title: "Identify the agent" },
  { key: "plan", label: "Plan", title: "Select behavior" },
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
    propertyType: "Detached homes",
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
    { label: "Detached homes", description: "Move-ready detached inventory for active residential buyers." },
    { label: "Townhomes", description: "Townhome shoppers comparing space, schools, and affordability." },
    { label: "Condos", description: "Condo buyers looking for sharper building and neighborhood fit." },
    { label: "First-time buyer homes", description: "Entry-point options for buyers who need a clearer first step." },
    { label: "Move-up homes", description: "Families upgrading into more space or a better location." },
    { label: "New construction", description: "Builder inventory, pre-construction, and newer homes." },
    { label: "Luxury homes", description: "Higher-intent buyers seeking premium private access." },
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
  monthlyBudget: "3000",
  offer: MODE_DEFAULTS.buyer.offer,
  planTier: "starter",
  idempotencySeed: "",
};

const PRICE_RANGES = ["$400k-$600k", "$600k-$900k", "$900k-$1.5M", "$1.5M+"] as const;
const INVESTOR_PRICE_RANGES = ["<$500k", "$500k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const COMMERCIAL_PRICE_RANGES = ["Lease-ready", "$750k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const BUDGETS = [
  { label: "$1.5k/mo", value: "1500" },
  { label: "$3k/mo", value: "3000" },
  { label: "$5k/mo", value: "5000" },
  { label: "$7.5k+/mo", value: "7500" },
] as const;

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

function isCampaignMode(value: unknown): value is CampaignMode {
  return value === "buyer" || value === "seller" || value === "investor" || value === "commercial";
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
  const budget = Number.parseFloat(draft.monthlyBudget.replace(/[^0-9.]/g, ""));

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

  if (step === "offer" || step === "review") {
    if (!draft.audience.trim()) errors.audience = "Describe who the campaign should attract.";
    if (!draft.priceRange.trim()) errors.priceRange = "Choose a price range.";
    if (!Number.isFinite(budget) || budget <= 0) errors.monthlyBudget = "Choose or enter a realistic monthly ad budget.";
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
      <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        {steps.map((step, index) => {
          const active = step.key === currentStep;
          const available = index <= furthestStepIndex;

          return (
            <button
              key={step.key}
              type="button"
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [isNewCampaignFlow, setIsNewCampaignFlow] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const canUseExistingLaunchAccess =
    billingStatus?.launchAllowed === true &&
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
  const normalizedDraft = useMemo(
    () => ({ ...draft, offer: offerInsight.normalizedOffer }),
    [draft, offerInsight.normalizedOffer],
  );

  const stepTitle = useMemo(
    () => visibleSteps.find((step) => step.key === currentStep)?.title ?? "Build campaign",
    [currentStep, visibleSteps],
  );

  useEffect(() => {
    const shouldStartFresh = new URLSearchParams(window.location.search).get("new") === "1";
    setIsNewCampaignFlow(shouldStartFresh);
    if (shouldStartFresh) {
      window.localStorage.removeItem(STORAGE_KEY);
      setDraft({ ...DEFAULT_DRAFT, idempotencySeed: createIdempotencySeed() });
      setCurrentStep("intent");
      setFurthestStepIndex(0);
      setHydrated(true);
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    let nextDraft = { ...DEFAULT_DRAFT, idempotencySeed: createIdempotencySeed() };

    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<DraftState> & {
          currentStep?: OnboardingStepKey;
          furthestStepIndex?: number;
        };
        const campaignMode = isCampaignMode(saved.campaignMode) ? saved.campaignMode : "buyer";
        nextDraft = {
          ...nextDraft,
          ...saved,
          campaignMode,
          planTier: saved.planTier === "pro" ? "pro" : "starter",
          idempotencySeed: saved.idempotencySeed || nextDraft.idempotencySeed,
        };
        setDraft(nextDraft);
        if (saved.currentStep && STEPS.some((step) => step.key === saved.currentStep)) {
          setCurrentStep(saved.currentStep);
        }
        if (typeof saved.furthestStepIndex === "number") {
          setFurthestStepIndex(Math.min(Math.max(saved.furthestStepIndex, 0), STEPS.length - 1));
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        setDraft(nextDraft);
      }
    } else {
      setDraft(nextDraft);
    }

    setHydrated(true);
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
    if (!hydrated || !draft.idempotencySeed) return;

    void recordActivationEvent({
      eventName: "onboarding_started",
      idempotencyKey: `onboarding_started:${draft.idempotencySeed}`,
      metadata: {
        route: "onboarding",
        mode: draft.campaignMode,
        planTier: draft.planTier,
      },
    });
  }, [draft.campaignMode, draft.idempotencySeed, draft.planTier, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...draft,
        currentStep,
        furthestStepIndex,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [currentStep, draft, furthestStepIndex, hydrated]);

  function updateDraft(nextDraft: Partial<DraftState>) {
    setDraft((current) => ({ ...current, ...nextDraft }));
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

  function goToStep(step: OnboardingStepKey) {
    setCurrentStep(step);
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
      const response = await fetch("/api/onboarding/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_type: "Real Estate",
          business_name: draft.agentCompanyName,
          agent_first_name: draft.agentFirstName,
          agent_last_name: draft.agentLastName,
          agent_phone: draft.agentPhone,
          agent_company_name: draft.agentCompanyName,
          market: preparedDraft.market,
          location: preparedDraft.market,
          focus: preparedDraft.campaignMode,
          service: preparedDraft.offer,
          property_type: preparedDraft.propertyType,
          price_range: preparedDraft.priceRange,
          budget: preparedDraft.monthlyBudget,
          goal: preparedDraft.offer,
          idempotencySeed: preparedDraft.idempotencySeed,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; campaignId?: string; data?: { campaignId?: string }; error?: string }
        | null;
      const campaignId = data?.campaignId ?? data?.data?.campaignId ?? null;

      if (!response.ok || !data?.success || !campaignId) {
        throw new Error(data?.error ?? "Campaign could not be created.");
      }

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...preparedDraft,
          currentStep: "review",
          furthestStepIndex: visibleSteps.length - 1,
          campaignId,
          completedAt: new Date().toISOString(),
        }),
      );
      router.push(
        canUseExistingLaunchAccess
          ? `/build/creatives?campaignId=${encodeURIComponent(campaignId)}`
          : `/paywall?campaignId=${encodeURIComponent(campaignId)}&plan=${preparedDraft.planTier}`,
      );
    } catch (error) {
      setSubmitting(false);
      setErrors((current) => ({
        ...current,
        submit: error instanceof Error ? error.message : "Campaign could not be created.",
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
    window.localStorage.removeItem(STORAGE_KEY);
    setDraft(freshDraft);
    setCurrentStep("intent");
    setFurthestStepIndex(0);
    setErrors({});
  }

  return (
    <PageShell className="w-full max-w-[1240px] gap-3 py-4 sm:py-5">
      <Card className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Campaign setup</Badge>
              <Badge className="border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100">Safe build</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.055em] sm:text-[2rem]">
              Step-by-step campaign builder
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/62 sm:text-sm">
              One decision at a time. DealFlow recommends the strategy, updates the preview, and keeps the next click obvious.
            </p>
          </div>
        </div>
      </Card>

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
                <Input value={draft.market} onChange={(event) => updateDraft({ market: event.target.value })} placeholder="Toronto, ON" />
                {errors.market ? <p className="text-sm text-rose-400">{errors.market}</p> : null}
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

          {currentStep === "offer" ? (
            <div className="mt-6 grid gap-6">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Recommended audience</span>
                <Input value={draft.audience} onChange={(event) => updateDraft({ audience: event.target.value })} placeholder={modeCopy.audience} />
                <p className="text-xs leading-5 text-cyan-100/72">{AUDIENCE_REASONS[draft.campaignMode]}</p>
                {errors.audience ? <p className="text-sm text-rose-400">{errors.audience}</p> : null}
              </label>

              <div>
                <p className="text-sm font-medium text-foreground">Price range or deal size</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {priceRangeOptions.map((range) => (
                    <button
                      key={range}
                      type="button"
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
                {errors.priceRange ? <p className="mt-2 text-sm text-rose-400">{errors.priceRange}</p> : null}
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">Monthly ad budget</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {BUDGETS.map((budget) => (
                    <button
                      key={budget.value}
                      type="button"
                      onClick={() => updateDraft({ monthlyBudget: budget.value })}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        draft.monthlyBudget === budget.value
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {budget.label}
                    </button>
                  ))}
                </div>
                <Input className="mt-3" type="number" inputMode="numeric" value={draft.monthlyBudget} onChange={(event) => updateDraft({ monthlyBudget: event.target.value })} placeholder="3000" />
                {errors.monthlyBudget ? <p className="mt-2 text-sm text-rose-400">{errors.monthlyBudget}</p> : null}
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
                />
                {errors.offer ? <p className="text-sm text-rose-400">{errors.offer}</p> : null}
              </div>
              <OfferCoach insight={offerInsight} onApply={applyOffer} />
            </div>
          ) : null}

          {currentStep === "agent" ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Agent first name</span>
                <Input value={draft.agentFirstName} onChange={(event) => updateDraft({ agentFirstName: event.target.value })} placeholder="Jane" />
                {errors.agentFirstName ? <p className="text-sm text-rose-400">{errors.agentFirstName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Agent last name</span>
                <Input value={draft.agentLastName} onChange={(event) => updateDraft({ agentLastName: event.target.value })} placeholder="Smith" />
                {errors.agentLastName ? <p className="text-sm text-rose-400">{errors.agentLastName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Company or brokerage</span>
                <Input value={draft.agentCompanyName} onChange={(event) => updateDraft({ agentCompanyName: event.target.value })} placeholder="Smith Realty Group" />
                {errors.agentCompanyName ? <p className="text-sm text-rose-400">{errors.agentCompanyName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">SMS alert phone</span>
                <Input value={draft.agentPhone} onChange={(event) => updateDraft({ agentPhone: event.target.value })} placeholder="(555) 555-5555" inputMode="tel" />
                <p className="text-xs leading-5 text-muted-foreground">
                  Use a US or Canada number so lead alerts can be routed correctly.
                </p>
                {errors.agentPhone ? <p className="text-sm text-rose-400">{errors.agentPhone}</p> : null}
              </label>
            </div>
          ) : null}

          {currentStep === "plan" ? (
            <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2">
              {SELECTABLE_PLAN_TIERS.map((tier) => (
                <PlanChoiceCard
                  key={tier}
                  tier={tier}
                  active={draft.planTier === tier}
                  onClick={() => updateDraft({ planTier: tier })}
                />
              ))}
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
                        : "Continue saves the campaign, updates the agent profile for lead alerts, and opens checkout. No live ad, payment, message, or media action runs here."}
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
                  ["Budget", `$${draft.monthlyBudget}/month`],
                  ["Offer", normalizedDraft.offer],
                  [
                    "Launch access",
                    canUseExistingLaunchAccess
                      ? billingStatus?.hasUnlimitedCampaigns
                        ? "Active Pro access: unlimited campaign slots"
                        : "Active plan: campaign slot available"
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
                    {canUseExistingLaunchAccess ? "Continue to creatives" : "Continue to checkout"}
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
