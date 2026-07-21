"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  directlyPersistedOnboardingRevisionMatches,
  onboardingDraftSchema,
  queuedOnboardingDraftSaveIsCurrent,
  type CampaignAdDestination,
  type CampaignMode,
  type FunnelLanguage,
  type LeadCaptureMode,
  type OnboardingDraft,
  type OnboardingStepKey,
} from "@/lib/onboarding-contract";
import { normalizePhone } from "@/lib/phone";
import { resolveMetaInstantFormQualificationQuestions } from "@/lib/meta-instant-form-qualification";
import { normalizeOfferForCampaign, type NormalizedOfferResult } from "@/lib/services/offer-normalization-service";
import { cn } from "@/lib/utils";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { getProductIntlLocale, type ProductLocale } from "@/lib/i18n/config";
import type { ProductMessageKey } from "@/lib/i18n/messages";
import {
  getOnboardingOptionCatalog,
  localizeKnownOnboardingValue,
} from "@/lib/i18n/onboarding-options";

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

const STEPS: { key: OnboardingStepKey }[] = [
  { key: "intent" },
  { key: "market" },
  { key: "property" },
  { key: "audience" },
  { key: "budget" },
  { key: "setup" },
  { key: "offer" },
  { key: "agent" },
  { key: "plan" },
  { key: "review" },
];

const MODE_ICONS: Record<CampaignMode, typeof Home> = {
  buyer: Home,
  seller: Building2,
  investor: CircleDollarSign,
  commercial: Store,
};

const DEFAULT_BUYER_COPY = getOnboardingOptionCatalog("en").modes.buyer;

const DEFAULT_DRAFT: DraftState = {
  agentFirstName: "",
  agentLastName: "",
  agentCompanyName: "",
  agentPhone: "",
  campaignMode: "buyer",
  market: "Toronto, ON",
  audience: DEFAULT_BUYER_COPY.audience,
  propertyType: DEFAULT_BUYER_COPY.propertyType,
  priceRange: DEFAULT_BUYER_COPY.priceRange,
  dailyBudget: "30",
  offer: DEFAULT_BUYER_COPY.offer,
  funnelLanguage: "en",
  adDestination: "website",
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

function createLocalizedDefaultDraft(locale: ProductLocale): DraftState {
  const buyer = getOnboardingOptionCatalog(locale).modes.buyer;
  return {
    ...DEFAULT_DRAFT,
    audience: buyer.audience,
    propertyType: buyer.propertyType,
    priceRange: buyer.priceRange,
    offer: buyer.offer,
    funnelLanguage: locale,
  };
}

function localizeKnownDraftValues(draft: DraftState, locale: ProductLocale): DraftState {
  return {
    ...draft,
    audience: localizeKnownOnboardingValue(draft.audience, draft.campaignMode, locale),
    propertyType: localizeKnownOnboardingValue(draft.propertyType, draft.campaignMode, locale),
    priceRange: localizeKnownOnboardingValue(draft.priceRange, draft.campaignMode, locale),
    offer: localizeKnownOnboardingValue(draft.offer, draft.campaignMode, locale),
    leadFormQuestions: draft.leadFormQuestions.map((question) =>
      localizeKnownOnboardingValue(question, draft.campaignMode, locale)),
  };
}

const PRICE_RANGES = ["$400k-$600k", "$600k-$900k", "$900k-$1.5M", "$1.5M+"] as const;
const INVESTOR_PRICE_RANGES = ["<$500k", "$500k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const COMMERCIAL_PRICE_RANGES = ["Lease-ready", "$750k-$1.5M", "$1.5M-$3M", "$3M+"] as const;
const DAILY_BUDGETS = ["10", "20", "30", "50", "75", "100"] as const;
const MIN_DAILY_BUDGET_CENTS = 500;
const MAX_DAILY_BUDGET_CENTS: number | null = null;

const LEAD_CAPTURE_MODE_ORDER: LeadCaptureMode[] = ["volume_lead_form", "quality_funnel", "deep_qualification"];

function normalizeHexColor(value: string, fallback: string) {
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function normalizeOfferForLocale(
  offer: string,
  mode: CampaignMode,
  locale: ProductLocale,
): NormalizedOfferResult {
  if (locale === "en") {
    return normalizeOfferForCampaign(offer, mode);
  }

  const normalizedOffer = offer.trim().replace(/\s+/g, " ");
  return {
    rawOffer: offer,
    normalizedOffer,
    cta: normalizedOffer,
    intent: "generic",
    changed: normalizedOffer !== offer,
    coachNote: "",
    alternates: [],
  };
}

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

function formatAdSpend(value: number, locale: ProductLocale) {
  return new Intl.NumberFormat(getProductIntlLocale(locale), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDailyBudgetFromDraft(
  draft: Pick<DraftState, "dailyBudget">,
  locale: ProductLocale,
  t: (key: ProductMessageKey, values?: Record<string, string | number>) => string,
) {
  const cents = dailyBudgetCentsFromDraft(draft);

  if (!cents || cents <= 0) {
    return t("onboarding.dailyNotSet");
  }

  const dayLabel = locale === "fr" ? "jour" : locale === "es" ? "día" : "day";
  return `${formatAdSpend(dailyBudgetDollarsFromCents(cents), locale)}/${dayLabel}`;
}

function formatMonthlyEstimateFromDraft(
  draft: Pick<DraftState, "dailyBudget">,
  locale: ProductLocale,
  t: (key: ProductMessageKey, values?: Record<string, string | number>) => string,
) {
  const cents = dailyBudgetCentsFromDraft(draft);

  if (!cents || cents <= 0) {
    return null;
  }

  return t("onboarding.estimatedSpend", {
    value: formatAdSpend(monthlyCapDollarsFromDailyCents(cents), locale),
  });
}

function recommendLeadCaptureMode(dailyBudgetCents: number | null): LeadCaptureMode {
  if (!dailyBudgetCents || dailyBudgetCents < 3000) return "volume_lead_form";
  if (dailyBudgetCents >= 10000) return "deep_qualification";
  return "quality_funnel";
}

function getLeadCaptureRecommendation(
  dailyBudgetCents: number | null,
) {
  const mode = recommendLeadCaptureMode(dailyBudgetCents);
  return { mode };
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

function validateStep(
  step: OnboardingStepKey,
  draft: DraftState,
  t: (key: ProductMessageKey) => string,
) {
  const errors: FieldErrors = {};
  const dailyBudgetCents = dailyBudgetCentsFromDraft(draft);

  if (step === "agent" || step === "review") {
    if (!draft.agentFirstName.trim()) errors.agentFirstName = t("onboarding.validation.firstName");
    if (!draft.agentLastName.trim()) errors.agentLastName = t("onboarding.validation.lastName");
    if (!draft.agentCompanyName.trim()) errors.agentCompanyName = t("onboarding.validation.company");
    if (!draft.agentPhone.trim()) errors.agentPhone = t("onboarding.validation.phone");
    else if (!normalizePhone(draft.agentPhone)) errors.agentPhone = t("onboarding.validation.phoneFormat");
  }

  if (step === "market" || step === "review") {
    if (!draft.market.trim()) errors.market = t("onboarding.validation.market");
  }

  if (step === "property" || step === "review") {
    if (!draft.propertyType.trim()) errors.propertyType = t("onboarding.validation.property");
  }

  if (step === "audience" || step === "review") {
    if (!draft.audience.trim()) errors.audience = t("onboarding.validation.audience");
    if (!draft.priceRange.trim()) errors.priceRange = t("onboarding.validation.price");
  }

  if (step === "budget" || step === "review") {
    if (!dailyBudgetCents || dailyBudgetCents < MIN_DAILY_BUDGET_CENTS) {
      errors.dailyBudget = t("onboarding.validation.budgetMin");
    } else if (MAX_DAILY_BUDGET_CENTS !== null && dailyBudgetCents > MAX_DAILY_BUDGET_CENTS) {
      errors.dailyBudget = t("onboarding.validation.budgetMax");
    }
  }

  if (step === "setup" || step === "review") {
    if (draft.leadFormQuestions.length > 3) {
      errors.leadFormQuestionDraft = t("onboarding.validation.questions");
    }
  }

  if (step === "offer" || step === "review") {
    if (!draft.offer.trim()) errors.offer = t("onboarding.validation.offer");
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
  onSelect: (step: OnboardingStepKey) => void | Promise<void>;
}) {
  const { t } = useProductI18n();
  const currentIndex = Math.max(steps.findIndex((step) => step.key === currentStep), 0);
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="df-eyebrow">{t("onboarding.progress")}</p>
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
              onClick={() => { if (available) void onSelect(step.key); }}
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
                  {t(`onboarding.step.${step.key}` as ProductMessageKey)}
                </span>
                <span className="mt-1 hidden text-xs leading-snug text-white/44 lg:line-clamp-2">
                  {t(`onboarding.title.${step.key}` as ProductMessageKey)}
                </span>
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
  const { t } = useProductI18n();
  const plan = getPlanPresentation(tier);
  const Icon = tier === "starter" ? Lightbulb : Rocket;
  const featureKeys: ProductMessageKey[] = [
    "onboarding.plan.feature.setup",
    "onboarding.plan.feature.preview",
    "onboarding.plan.feature.meta",
    "onboarding.plan.feature.review",
    "onboarding.plan.feature.workspace",
    "onboarding.plan.feature.unlimited",
    "onboarding.plan.feature.monitoring",
  ];

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
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/72">{t("onboarding.plan.eyebrow")}</p>
      <h4 className="mt-2 text-xl font-semibold tracking-[-0.05em] text-white">
        {t("onboarding.plan.name")} {plan.priceLabel}
      </h4>
      <div className="mt-3 w-fit rounded-full border border-cyan-300/18 bg-cyan-300/[0.06] px-3 py-1 text-xs font-semibold text-cyan-100">
        {t("onboarding.plan.positioning")}
      </div>
      <p className="mt-3 text-sm leading-6 text-white/64">{t("onboarding.plan.summary")}</p>
      <div className="mt-4 grid gap-2">
        {featureKeys.map((featureKey) => (
          <div key={featureKey} className="flex min-w-0 items-start gap-2 text-xs leading-5 text-white/70">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-cyan-100" />
            <span>{t(featureKey)}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 inline-flex w-fit rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
        {t("onboarding.plan.cta")}
      </div>
      <p className="mt-auto pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
        {t("onboarding.plan.footer")}
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
  const { locale, t } = useProductI18n();
  return (
    <div className="rounded-[20px] border border-cyan-200/16 bg-cyan-300/[0.045] p-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="cyan" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">{t("onboarding.offerCoach")}</p>
            {insight.changed ? (
              <Badge className="border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100">{t("onboarding.polished")}</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-cyan-50">{insight.normalizedOffer}</p>
          <p className="mt-1 text-xs leading-5 text-white/58">
            {locale === "en" ? insight.coachNote : t("onboarding.offerCoachBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply(insight.normalizedOffer)}
              className="rounded-full border border-cyan-200/18 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.09]"
            >
              {t("onboarding.usePolished")}
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
  const { href, locale, t } = useProductI18n();
  const optionCatalog = getOnboardingOptionCatalog(locale);
  const [hydrated, setHydrated] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStepKey>("intent");
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  const [draft, setDraft] = useState<DraftState>(() => createLocalizedDefaultDraft(locale));
  const [persistenceRevision, setPersistenceRevision] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [isNewCampaignFlow, setIsNewCampaignFlow] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const serverRevisionRef = useRef(0);
  const serverDigestRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftConflictRef = useRef(false);
  const directlyPersistedRevisionRef = useRef<number | null>(null);
  const stepTransitionRef = useRef(false);
  const draftNavigationEpochRef = useRef(0);
  const canUseExistingLaunchAccess =
    billingStatus?.canUseExistingLaunchAccess === true &&
    (!isNewCampaignFlow || billingStatus.canCreateAdditionalCampaign);
  const visibleSteps = useMemo(
    () => (canUseExistingLaunchAccess ? STEPS.filter((step) => step.key !== "plan") : STEPS),
    [canUseExistingLaunchAccess],
  );
  const currentStepIndex = Math.max(visibleSteps.findIndex((step) => step.key === currentStep), 0);
  const modeCopy = optionCatalog.modes[draft.campaignMode];
  const propertyTypeOptions = optionCatalog.properties[draft.campaignMode];
  const priceRangeOptions =
    draft.campaignMode === "commercial"
      ? [optionCatalog.modes.commercial.priceRange, ...COMMERCIAL_PRICE_RANGES.slice(1)]
      : draft.campaignMode === "investor"
        ? INVESTOR_PRICE_RANGES
        : PRICE_RANGES;
  const offerInsight = useMemo(
    () => normalizeOfferForLocale(draft.offer, draft.campaignMode, locale),
    [draft.campaignMode, draft.offer, locale],
  );
  const dailyBudgetCents = dailyBudgetCentsFromDraft(draft);
  const leadCaptureRecommendation = getLeadCaptureRecommendation(dailyBudgetCents);
  const shortLeadFormSelected = draft.leadCaptureMode === "volume_lead_form";
  const metaInstantFormSelected = draft.adDestination === "meta_instant_form";
  const effectiveMetaQuestions = useMemo(
    () =>
      resolveMetaInstantFormQualificationQuestions({
        leadCaptureMode: draft.leadCaptureMode,
        language: draft.funnelLanguage,
        customQuestions: draft.leadFormQuestions,
      }),
    [draft.funnelLanguage, draft.leadCaptureMode, draft.leadFormQuestions],
  );
  const lowBudgetLeadForm = (dailyBudgetCents ?? 0) < 3000;
  const normalizedDraft = useMemo(
    () => ({ ...draft, offer: offerInsight.normalizedOffer }),
    [draft, offerInsight.normalizedOffer],
  );

  const stepTitle = t(`onboarding.title.${currentStep}` as ProductMessageKey);

  function enqueueDraftSave(params: {
    draft: DraftState;
    currentStep: OnboardingStepKey;
    furthestStepIndex: number;
    navigationEpoch?: number;
  }) {
    const operation = saveQueueRef.current.then(async () => {
      if (!queuedOnboardingDraftSaveIsCurrent({
        queuedNavigationEpoch: params.navigationEpoch,
        currentNavigationEpoch: draftNavigationEpochRef.current,
      })) {
        return null;
      }
      const envelope = buildOnboardingDraftEnvelope(params);
      const writeAtRevision = async (expectedRevision: number) => {
        const response = await fetch("/api/onboarding/plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...envelope, expectedRevision }),
        });
        const data = (await response.json().catch(() => null)) as
          | { revision?: number; draftPayloadDigest?: string }
          | null;
        return { response, data };
      };

      let result = await writeAtRevision(serverRevisionRef.current);
      if (result.response.status === 409) {
        const authoritativeResponse = await fetch("/api/onboarding/plan", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const authoritative = (await authoritativeResponse.json().catch(() => null)) as
          | { found?: boolean; revision?: unknown; draftPayloadDigest?: unknown }
          | null;
        const authoritativeRevision = authoritative?.found === false
          ? 0
          : Number(authoritative?.revision);
        if (
          !authoritativeResponse.ok ||
          !Number.isInteger(authoritativeRevision) ||
          authoritativeRevision < 0
        ) {
          draftConflictRef.current = true;
          throw new Error("onboarding_draft_conflict_read_failed");
        }
        serverRevisionRef.current = authoritativeRevision;
        serverDigestRef.current = typeof authoritative?.draftPayloadDigest === "string"
          ? authoritative.draftPayloadDigest
          : null;
        result = await writeAtRevision(authoritativeRevision);
      }

      const { response, data } = result;
      if (!response.ok || !Number.isInteger(data?.revision) || typeof data?.draftPayloadDigest !== "string") {
        draftConflictRef.current = true;
        throw new Error("onboarding_draft_save_failed");
      }
      serverRevisionRef.current = data.revision as number;
      serverDigestRef.current = data.draftPayloadDigest;
      draftConflictRef.current = false;
      return { revision: data.revision as number, draftPayloadDigest: data.draftPayloadDigest };
    });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function deleteServerDraft() {
    draftNavigationEpochRef.current += 1;
    directlyPersistedRevisionRef.current = null;
    const operation = saveQueueRef.current.then(async () => {
      const response = await fetch("/api/onboarding/plan", { method: "DELETE" });
      if (!response.ok) throw new Error("onboarding_draft_delete_failed");
      serverRevisionRef.current = 0;
      serverDigestRef.current = null;
      draftConflictRef.current = false;
    });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }

  useEffect(() => {
    let cancelled = false;
    for (const legacyStorageKey of LEGACY_PII_STORAGE_KEYS) {
      window.localStorage.removeItem(legacyStorageKey);
    }
    const searchParams = new URLSearchParams(window.location.search);
    const shouldStartFresh = searchParams.get("new") === "1" || (!searchParams.get("resume") && !searchParams.get("campaignId"));
    setIsNewCampaignFlow(shouldStartFresh);

    if (shouldStartFresh) {
      void deleteServerDraft()
        .catch(() => {
          draftConflictRef.current = true;
          if (!cancelled) setErrors({ submit: t("onboarding.error.create") });
        })
        .finally(() => {
          if (cancelled) return;
          setDraft({ ...createLocalizedDefaultDraft(locale), idempotencySeed: createIdempotencySeed() });
          setCurrentStep("intent");
          setFurthestStepIndex(0);
          setPersistenceRevision(0);
          setHydrated(true);
        });
      return () => { cancelled = true; };
    }

    async function loadServerDraft() {
      let nextDraft = { ...createLocalizedDefaultDraft(locale), idempotencySeed: createIdempotencySeed() };
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
              revision?: unknown;
              draftPayloadDigest?: unknown;
            }
          | null;
        const parsedDraft = onboardingDraftSchema.safeParse(data?.draft);

        if (response.ok && data?.found && parsedDraft.success) {
          nextDraft = localizeKnownDraftValues(parsedDraft.data, locale);
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
          if (Number.isInteger(data.revision) && Number(data.revision) >= 1) {
            serverRevisionRef.current = Number(data.revision);
          }
          if (typeof data.draftPayloadDigest === "string") {
            serverDigestRef.current = data.draftPayloadDigest;
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
  }, [locale, t]);

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
      const nextFurthestStepIndex = Math.max(furthestStepIndex, reviewIndex);
      draftNavigationEpochRef.current += 1;
      void enqueueDraftSave({
        draft,
        currentStep: "review",
        furthestStepIndex: nextFurthestStepIndex,
      })
        .then(() => {
          directlyPersistedRevisionRef.current = persistenceRevision;
          setCurrentStep("review");
          setFurthestStepIndex(nextFurthestStepIndex);
        })
        .catch(() => {
          setErrors((current) => ({
            ...current,
            submit: t("onboarding.error.create"),
          }));
        });
    }
  }, [canUseExistingLaunchAccess, currentStep, draft, furthestStepIndex, persistenceRevision, t, visibleSteps]);

  useEffect(() => {
    // Hydration, billing reads, and automatic routing are observational. A
    // durable draft write begins only after an explicit user interaction has
    // incremented the revision.
    if (!hydrated || submitting) return;
    if (directlyPersistedRevisionRef.current !== null) {
      const directlyPersistedRevision = directlyPersistedRevisionRef.current;
      directlyPersistedRevisionRef.current = null;
      if (directlyPersistedOnboardingRevisionMatches({
        directlyPersistedRevision,
        currentPersistenceRevision: persistenceRevision,
      })) {
        return;
      }
    }
    if (persistenceRevision === 0 || draftConflictRef.current) return;
    const navigationEpoch = draftNavigationEpochRef.current;

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

      void enqueueDraftSave({ ...envelope, navigationEpoch }).catch(() => undefined);
    }, 800);

    return () => window.clearTimeout(saveTimer);
  }, [currentStep, draft, furthestStepIndex, hydrated, persistenceRevision, submitting]);

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

  function selectAdDestination(destination: CampaignAdDestination) {
    if (draft.adDestination === destination) return;
    const nextDraft = { ...draft, adDestination: destination };
    const destinationNavigationEpoch = draftNavigationEpochRef.current + 1;
    draftNavigationEpochRef.current = destinationNavigationEpoch;
    // The explicit selection is persisted directly. Suppress only the passive
    // effect for this exact render; any newer edit changes the revision and
    // remains eligible for its own ordered save.
    directlyPersistedRevisionRef.current = persistenceRevision;
    setDraft(nextDraft);
    setErrors((current) => {
      const next = { ...current };
      delete next.adDestination;
      delete next.submit;
      return next;
    });
    // Explicit user selections must never be discarded by the passive-write
    // navigation epoch filter. The queue already serializes this write after
    // any older operation, and any newer explicit selection is serialized
    // after it, so the latest user choice remains authoritative.
    void enqueueDraftSave({
      draft: nextDraft,
      currentStep,
      furthestStepIndex,
    })
      .then((savedDraft) => {
        if (!savedDraft && draftNavigationEpochRef.current === destinationNavigationEpoch) {
          throw new Error("onboarding_destination_save_superseded");
        }
      })
      .catch(() => {
        if (draftNavigationEpochRef.current !== destinationNavigationEpoch) return;
        setErrors((current) => ({
          ...current,
          submit: t("onboarding.error.create"),
        }));
      });
  }

  function selectMode(campaignMode: CampaignMode) {
    const defaults = optionCatalog.modes[campaignMode];
    updateDraft({
      campaignMode,
      audience: defaults.audience,
      propertyType: defaults.propertyType,
      priceRange: defaults.priceRange,
      offer: defaults.offer,
    });
  }

  function applyOffer(offer: string) {
    updateDraft({ offer: normalizeOfferForLocale(offer, draft.campaignMode, locale).normalizedOffer });
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

  async function goToStep(step: OnboardingStepKey, nextDraft: DraftState = draft) {
    if (stepTransitionRef.current) return;
    const nextStepIndex = Math.max(visibleSteps.findIndex((candidate) => candidate.key === step), 0);
    const nextFurthestStepIndex = Math.max(furthestStepIndex, nextStepIndex);
    stepTransitionRef.current = true;
    draftNavigationEpochRef.current += 1;
    try {
      await enqueueDraftSave({
        draft: nextDraft,
        currentStep: step,
        furthestStepIndex: nextFurthestStepIndex,
      });
      directlyPersistedRevisionRef.current = persistenceRevision;
      setDraft(nextDraft);
      setCurrentStep(step);
      setFurthestStepIndex(nextFurthestStepIndex);
      setErrors({});
    } catch {
      setErrors((current) => ({
        ...current,
        submit: t("onboarding.error.create"),
      }));
    } finally {
      stepTransitionRef.current = false;
    }
  }

  function goBack() {
    if (currentStepIndex > 0) {
      void goToStep(visibleSteps[currentStepIndex - 1].key);
    }
  }

  async function submitOnboarding() {
    const preparedDraft = { ...draft, offer: normalizeOfferForLocale(draft.offer, draft.campaignMode, locale).normalizedOffer };
    const nextErrors = validateStep("review", preparedDraft, t);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);

    let failureKey: ProductMessageKey = "onboarding.error.create";

    try {
      draftNavigationEpochRef.current += 1;
      const submission = buildOnboardingSubmission(preparedDraft);
      const savedDraft = await enqueueDraftSave({
        draft: preparedDraft,
        currentStep: "review",
        furthestStepIndex: 9,
      });
      if (!savedDraft) throw new Error("onboarding_draft_save_superseded");
      const response = await fetch("/api/onboarding/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submission,
          expectedRevision: savedDraft.revision,
          draftPayloadDigest: savedDraft.draftPayloadDigest,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; campaignId?: string; data?: { campaignId?: string }; error?: string }
        | null;
      const campaignId = data?.campaignId ?? data?.data?.campaignId ?? null;

      if (!response.ok || !data?.success || !campaignId) {
        throw new Error("campaign_create_failed");
      }

      if (canUseExistingLaunchAccess) {
        router.push(href(`/build/creatives?campaignId=${encodeURIComponent(campaignId)}`));
        return;
      }

      failureKey = "onboarding.error.checkout";
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
        throw new Error("checkout_start_failed");
      }

      window.location.assign(checkoutData.url);
    } catch {
      setSubmitting(false);
      setErrors((current) => ({
        ...current,
        submit: t(failureKey),
      }));
    }
  }

  async function continueFlow() {
    const preparedDraft =
      currentStep === "offer" || currentStep === "review"
        ? { ...draft, offer: normalizeOfferForLocale(draft.offer, draft.campaignMode, locale).normalizedOffer }
        : draft;
    const nextErrors = validateStep(currentStep, preparedDraft, t);
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
    void recordActivationEvent({
      eventName: "onboarding_step_completed",
      idempotencyKey: `onboarding_step_completed:${draft.idempotencySeed}:${currentStep}`,
      metadata: {
        stepKey: currentStep,
        mode: draft.campaignMode,
        planTier: draft.planTier,
      },
    });
    await goToStep(visibleSteps[nextIndex].key, preparedDraft);
  }

  function resetDraft() {
    const freshDraft = { ...createLocalizedDefaultDraft(locale), idempotencySeed: createIdempotencySeed() };
    directlyPersistedRevisionRef.current = null;
    setIsNewCampaignFlow(true);
    setDraft(freshDraft);
    setCurrentStep("intent");
    setFurthestStepIndex(0);
    setPersistenceRevision(0);
    setHydrated(false);
    setErrors({});
    void deleteServerDraft()
      .then(() => setHydrated(true))
      .catch(() => {
        draftConflictRef.current = true;
        setErrors({ submit: t("onboarding.error.create") });
        setHydrated(true);
      });
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
              <p className="df-eyebrow">{t("onboarding.currentStep")}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">{stepTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-white/64">
                {t("onboarding.answerStep")}
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
              <p className="font-semibold">{t("onboarding.fixField")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {activeErrorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {currentStep === "intent" ? (
            <>
              <p className="mt-6 text-sm font-medium text-foreground">{t("onboarding.question.attract")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(Object.keys(optionCatalog.modes) as CampaignMode[]).map((mode) => {
                  const item = optionCatalog.modes[mode];
                  return (
                    <ChoiceCard
                      active={draft.campaignMode === mode}
                      body={item.summary}
                      detail={
                        draft.campaignMode === mode
                          ? t("onboarding.selected")
                          : t("onboarding.choose", {
                              value: t(`onboarding.campaignType.${mode}` as ProductMessageKey).toLowerCase(),
                            })
                      }
                      icon={MODE_ICONS[mode]}
                      key={mode}
                      onClick={() => selectMode(mode)}
                      title={t(`onboarding.campaignType.${mode}` as ProductMessageKey)}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          {currentStep === "market" ? (
            <div className="mt-6 grid gap-5">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t("onboarding.city")}</span>
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
                <p className="text-sm font-semibold text-white">{t("onboarding.currentType")}</p>
                <p className="mt-2 text-sm leading-7 text-white/64">
                  {modeCopy.path.replace("{{market}}", draft.market || modeCopy.marketFallback)}
                </p>
              </div>
            </div>
          ) : null}

          {currentStep === "property" ? (
            <div className="mt-6">
              <p className="text-sm font-medium text-foreground">{t("onboarding.question.property")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {propertyTypeOptions.map((option) => (
                  <button
                    key={option.id}
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
                      <IconTile icon={MODE_ICONS[draft.campaignMode]} tone={draft.propertyType === option.label ? "cyan" : "violet"} />
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
                <span className="text-muted-foreground">{t("onboarding.recommendedAudience")}</span>
                <Input
                  value={draft.audience}
                  onChange={(event) => updateDraft({ audience: event.target.value })}
                  placeholder={modeCopy.audience}
                  aria-invalid={Boolean(errors.audience)}
                  aria-describedby={errors.audience ? "onboarding-audience-error" : undefined}
                />
                <p className="text-xs leading-5 text-cyan-100/72">{optionCatalog.audienceReasons[draft.campaignMode]}</p>
                {errors.audience ? <p id="onboarding-audience-error" className="text-sm text-rose-400">{errors.audience}</p> : null}
              </label>

              <div>
                <p className="text-sm font-medium text-foreground">{t("onboarding.priceRange")}</p>
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
                <span className="text-muted-foreground">{t("onboarding.customPrice")}</span>
                <Input
                  value={draft.priceRange}
                  onChange={(event) => updateDraft({ priceRange: event.target.value })}
                  placeholder={t("onboarding.customPricePlaceholder")}
                  aria-invalid={Boolean(errors.priceRange)}
                  aria-describedby={errors.priceRange ? "onboarding-price-range-error" : undefined}
                />
              </label>
            </div>
          ) : null}

          {currentStep === "budget" ? (
            <div className="mt-6 grid gap-6">
              <div>
                <p className="text-sm font-medium text-foreground">{t("onboarding.dailyBudget")}</p>
                <p className="mt-1 text-sm leading-6 text-white/58">
                  {t("onboarding.budgetMediaHelp")}
                </p>
                <div className="mt-3 rounded-[20px] border border-emerald-300/18 bg-emerald-300/[0.055] p-4">
                  <p className="text-sm font-semibold text-emerald-100">{t("onboarding.recommendedBudget")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/58">
                    {t("onboarding.budgetRangeHelp")}
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {DAILY_BUDGETS.map((budget) => (
                    <button
                      key={budget}
                      type="button"
                      aria-pressed={draft.dailyBudget === budget}
                      onClick={() => updateDailyBudget(budget)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        draft.dailyBudget === budget
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {formatDailyBudgetFromDraft({ dailyBudget: budget }, locale, t)}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">{t("onboarding.customDaily")}</span>
                  <Input
                    type="number"
                    min={5}
                    step="1"
                    inputMode="decimal"
                    value={draft.dailyBudget}
                    onChange={(event) => updateDailyBudget(event.target.value)}
                    placeholder="30"
                    aria-label={t("onboarding.customDailyAria")}
                    aria-invalid={Boolean(errors.dailyBudget)}
                    aria-describedby={errors.dailyBudget ? "onboarding-daily-budget-error" : undefined}
                  />
                </label>
                <p className="mt-2 text-xs leading-5 text-white/52">
                  {t("onboarding.budgetControl")}
                </p>
                {formatMonthlyEstimateFromDraft(draft, locale, t) ? (
                  <p className="mt-1 text-xs leading-5 text-white/42">
                    {formatMonthlyEstimateFromDraft(draft, locale, t)}
                  </p>
                ) : null}
                {errors.dailyBudget ? <p id="onboarding-daily-budget-error" className="mt-2 text-sm text-rose-400">{errors.dailyBudget}</p> : null}
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("onboarding.captureStyle")}</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      {t("onboarding.captureHelp")}
                    </p>
                  </div>
                  <Badge className="border-cyan-200/20 bg-cyan-300/[0.06] text-cyan-100">
                    {t(`onboarding.capture.${leadCaptureRecommendation.mode === "volume_lead_form" ? "volumeLabel" : leadCaptureRecommendation.mode === "quality_funnel" ? "qualityLabel" : "highestLabel"}` as ProductMessageKey)}
                  </Badge>
                </div>
                <div className="mt-3 rounded-[18px] border border-cyan-200/16 bg-cyan-300/[0.045] p-4 transition">
                  <p className="text-sm font-semibold text-cyan-100">
                    {t(`onboarding.capture.${leadCaptureRecommendation.mode === "volume_lead_form" ? "volume" : leadCaptureRecommendation.mode === "quality_funnel" ? "quality" : "highest"}` as ProductMessageKey)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/60">
                    {t(`onboarding.capture.${leadCaptureRecommendation.mode === "volume_lead_form" ? "volumeBody" : leadCaptureRecommendation.mode === "quality_funnel" ? "qualityBody" : "highestBody"}` as ProductMessageKey)}
                  </p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {LEAD_CAPTURE_MODE_ORDER.map((mode) => {
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
                        <span className="block text-sm font-semibold text-white">
                          {t(`onboarding.capture.${mode === "volume_lead_form" ? "volume" : mode === "quality_funnel" ? "quality" : "highest"}` as ProductMessageKey)}
                        </span>
                        <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
                          {t(`onboarding.capture.${mode === "volume_lead_form" ? "volumeLabel" : mode === "quality_funnel" ? "qualityLabel" : "highestLabel"}` as ProductMessageKey)}
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-white/58">
                          {t(`onboarding.capture.${mode === "volume_lead_form" ? "volumeBody" : mode === "quality_funnel" ? "qualityBody" : "highestBody"}` as ProductMessageKey)}
                        </span>
                        {recommended ? (
                          <span className="mt-3 block w-fit rounded-full border border-emerald-300/18 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            {t("common.recommended")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-sm font-medium text-foreground">{t("onboarding.destination")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">
                    {t("onboarding.destinationHelp")}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(["website", "meta_instant_form"] as CampaignAdDestination[]).map(
                      (destination) => {
                        const selected = draft.adDestination === destination;
                        return (
                          <button
                            key={destination}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => selectAdDestination(destination)}
                            className={cn(
                              "rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5",
                              selected
                                ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                                : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                            )}
                          >
                            <span className="block text-sm font-semibold text-white">
                              {t(destination === "website" ? "onboarding.destination.website" : "onboarding.destination.meta")}
                            </span>
                            <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
                              {t(destination === "website" ? "onboarding.destination.websiteLabel" : "onboarding.destination.metaLabel")}
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-white/58">
                              {t(destination === "website" ? "onboarding.destination.websiteBody" : "onboarding.destination.metaBody")}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === "setup" ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("onboarding.language")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">
                    {t("onboarding.languageHelp")}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(["en", "fr", "es"] as FunnelLanguage[]).map((language) => {
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
                          <span className="block text-sm font-semibold text-white">{t(`locale.name.${language}`)}</span>
                          <span className="mt-1 block text-xs leading-5 text-white/54">{t(`onboarding.language.${language}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {shortLeadFormSelected || metaInstantFormSelected ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {metaInstantFormSelected
                        ? t("onboarding.setup.metaQuestions")
                        : t("onboarding.setup.websiteQuestions")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      {metaInstantFormSelected
                        ? t("onboarding.setup.metaQuestionsBody")
                        : t("onboarding.setup.websiteQuestionsBody")}
                    </p>
                    <div
                      className={cn(
                        "mt-3 rounded-[18px] border p-4",
                        shortLeadFormSelected && lowBudgetLeadForm
                          ? "border-amber-300/20 bg-amber-300/[0.055]"
                          : "border-cyan-200/16 bg-cyan-300/[0.045]",
                      )}
                    >
                      <p className={cn("text-sm font-semibold", shortLeadFormSelected && lowBudgetLeadForm ? "text-amber-100" : "text-cyan-100")}>
                        {shortLeadFormSelected
                          ? lowBudgetLeadForm
                            ? t("onboarding.setup.lowBudgetTitle")
                            : t("onboarding.setup.volumeSelected")
                          : draft.leadCaptureMode === "deep_qualification"
                            ? t("onboarding.setup.threeQuestions")
                            : t("onboarding.setup.oneQuestion")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-white/60">
                        {shortLeadFormSelected
                          ? lowBudgetLeadForm
                            ? t("onboarding.setup.lowBudgetBody")
                            : t("onboarding.setup.volumeBody")
                          : t("onboarding.setup.defaultsBody")}
                      </p>
                      {metaInstantFormSelected && effectiveMetaQuestions.length > 0 ? (
                        <div className="mt-3 grid gap-2">
                          {effectiveMetaQuestions.map((question) => (
                            <div
                              key={question}
                              className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-medium leading-5 text-white/74"
                            >
                              {question}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {optionCatalog.leadQuestions.map((question) => {
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
                    <p className="mt-2 text-xs leading-5 text-white/48">
                      {t("onboarding.selectedQuestions", { count: draft.leadFormQuestions.length })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("onboarding.funnelBranding")}</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">
                      {t("onboarding.setup.brandingBody")}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        [t("onboarding.color.primary"), "themePrimaryColor"],
                        [t("onboarding.color.background"), "themeSecondaryColor"],
                        [t("onboarding.color.accent"), "themeAccentColor"],
                      ].map(([label, key]) => (
                        <label key={key} className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/48">
                          <span>{label}</span>
                          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/18 p-2">
                            <input
                              type="color"
                              value={draft[key as "themePrimaryColor" | "themeSecondaryColor" | "themeAccentColor"]}
                              onChange={(event) => updateDraft({ [key]: event.target.value } as Partial<DraftState>)}
                              className="h-9 w-10 rounded-md border border-white/10 bg-transparent"
                              aria-label={t("onboarding.color.pickerAria", { label })}
                            />
                            <Input
                              value={draft[key as "themePrimaryColor" | "themeSecondaryColor" | "themeAccentColor"]}
                              onChange={(event) => updateDraft({ [key]: event.target.value } as Partial<DraftState>)}
                              className="h-9"
                              aria-label={t("onboarding.color.hexAria", { label })}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block space-y-2 text-sm">
                      <span className="text-muted-foreground">{t("onboarding.logoOptional")}</span>
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
                  <p className="text-sm font-semibold text-white">{t("onboarding.whyMatters")}</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    {t("onboarding.offerWhyBody")}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{t("onboarding.whatGood")}</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    {t("onboarding.offerGoodBody")}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{t("onboarding.improveQuality")}</p>
                  <p className="mt-2 text-xs leading-5 text-white/58">
                    {t("onboarding.offerQualityBody")}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("onboarding.offer")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">
                    {t("onboarding.offerHelp")}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {optionCatalog.offers[draft.campaignMode].map((offer) => (
                    <button
                      type="button"
                      key={offer}
                      aria-pressed={
                        offerInsight.normalizedOffer ===
                        normalizeOfferForLocale(offer, draft.campaignMode, locale).normalizedOffer
                      }
                      onClick={() => applyOffer(offer)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                        offerInsight.normalizedOffer === normalizeOfferForLocale(offer, draft.campaignMode, locale).normalizedOffer
                          ? "border-cyan-200/28 bg-cyan-300/[0.07] text-cyan-100"
                          : "border-white/10 bg-white/[0.035] text-white/72 hover:border-cyan-200/18",
                      )}
                    >
                      {offer}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label={t("onboarding.offer")}
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
                <span className="text-muted-foreground">{t("onboarding.agentFirst")}</span>
                <Input value={draft.agentFirstName} onChange={(event) => updateDraft({ agentFirstName: event.target.value })} placeholder={t("onboarding.placeholder.firstName")} aria-invalid={Boolean(errors.agentFirstName)} aria-describedby={errors.agentFirstName ? "onboarding-agent-first-name-error" : undefined} />
                {errors.agentFirstName ? <p id="onboarding-agent-first-name-error" className="text-sm text-rose-400">{errors.agentFirstName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t("onboarding.agentLast")}</span>
                <Input value={draft.agentLastName} onChange={(event) => updateDraft({ agentLastName: event.target.value })} placeholder={t("onboarding.placeholder.lastName")} aria-invalid={Boolean(errors.agentLastName)} aria-describedby={errors.agentLastName ? "onboarding-agent-last-name-error" : undefined} />
                {errors.agentLastName ? <p id="onboarding-agent-last-name-error" className="text-sm text-rose-400">{errors.agentLastName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t("onboarding.company")}</span>
                <Input value={draft.agentCompanyName} onChange={(event) => updateDraft({ agentCompanyName: event.target.value })} placeholder={t("onboarding.placeholder.company")} aria-invalid={Boolean(errors.agentCompanyName)} aria-describedby={errors.agentCompanyName ? "onboarding-agent-company-error" : undefined} />
                {errors.agentCompanyName ? <p id="onboarding-agent-company-error" className="text-sm text-rose-400">{errors.agentCompanyName}</p> : null}
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">{t("onboarding.smsPhone")}</span>
                <Input value={draft.agentPhone} onChange={(event) => updateDraft({ agentPhone: event.target.value })} placeholder="(555) 555-5555" inputMode="tel" aria-invalid={Boolean(errors.agentPhone)} aria-describedby={errors.agentPhone ? "onboarding-agent-phone-help onboarding-agent-phone-error" : "onboarding-agent-phone-help"} />
                <p id="onboarding-agent-phone-help" className="text-xs leading-5 text-muted-foreground">
                  {t("onboarding.phoneHelp")}
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
                <p className="font-semibold text-white">{t("onboarding.onePlan")}</p>
                <p className="mt-1">
                  {t("onboarding.planArchived")}
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
                    <h3 className="text-xl font-semibold tracking-[-0.04em]">{t("onboarding.ready")}</h3>
                    <p className="mt-2 text-sm leading-7 text-white/64">
                      {canUseExistingLaunchAccess
                        ? t("onboarding.reviewExisting")
                        : t("onboarding.reviewActivate")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {[
                  { key: "agent", label: t("onboarding.review.agent"), value: [draft.agentFirstName, draft.agentLastName].filter(Boolean).join(" ") },
                  { key: "campaign-type", label: t("onboarding.step.type"), value: t(`onboarding.campaignType.${draft.campaignMode}` as ProductMessageKey) },
                  { key: "market", label: t("common.market"), value: draft.market },
                  { key: "property-type", label: t("onboarding.review.propertyType"), value: draft.propertyType },
                  { key: "price-deal-size", label: t("onboarding.review.priceDeal"), value: draft.priceRange },
                  { key: "daily-budget", label: t("onboarding.dailyBudget"), value: formatDailyBudgetFromDraft(draft, locale, t) },
                  { key: "monthly-estimate", label: t("onboarding.review.monthlyEstimate"), value: formatMonthlyEstimateFromDraft(draft, locale, t) ?? t("common.notSet") },
                  { key: "offer", label: t("onboarding.review.offer"), value: normalizedDraft.offer },
                  { key: "lead-capture-style", label: t("onboarding.captureStyle"), value: t(`onboarding.capture.${draft.leadCaptureMode === "volume_lead_form" ? "volume" : draft.leadCaptureMode === "quality_funnel" ? "quality" : "highest"}` as ProductMessageKey) },
                  { key: "destination", label: t("onboarding.destination"), value: t(draft.adDestination === "website" ? "onboarding.destination.website" : "onboarding.destination.meta") },
                  {
                    key: "launch-access",
                    label: t("onboarding.review.launchAccess"),
                    value: canUseExistingLaunchAccess
                      ? billingStatus?.hasUnlimitedCampaigns
                        ? t("onboarding.review.proUnlimited")
                        : t("onboarding.review.existingSlot")
                      : t("onboarding.plan.positioning"),
                  },
                ].map(({ key, label, value }) => (
                  <div key={key} data-testid={`onboarding-review-${key}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <p data-testid="onboarding-review-label" className="text-xs text-white/48">{label}</p>
                    <p data-testid="onboarding-review-value" className="mt-1 text-sm font-semibold text-white/86">{value}</p>
                  </div>
                ))}
              </div>
              {errors.submit ? <p className="text-sm text-rose-300">{errors.submit}</p> : null}
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <Button type="button" variant="secondary" onClick={resetDraft} disabled={submitting}>
              {t("onboarding.startOver")}
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={goBack} disabled={currentStepIndex === 0 || submitting}>
                <ArrowLeft className="size-4" />
                {t("common.back")}
              </Button>
              <Button type="button" onClick={continueFlow} disabled={submitting}>
                {submitting ? (
                  <>
                    {t("onboarding.savingCampaign")}
                    <Loader2 className="size-4 animate-spin" />
                  </>
                ) : currentStep === "review" ? (
                  <>
                    {canUseExistingLaunchAccess ? t("onboarding.continueCreatives") : t("onboarding.activatePro")}
                    {canUseExistingLaunchAccess ? <ArrowRight className="size-4" /> : <BarChart3 className="size-4" />}
                  </>
                ) : (
                  <>
                    {t("onboarding.continueTo", {
                      step: t(`onboarding.step.${visibleSteps[currentStepIndex + 1]?.key ?? "review"}` as ProductMessageKey).toLowerCase(),
                    })}
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
