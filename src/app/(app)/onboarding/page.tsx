"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type CampaignFocus = "seller" | "buyer";
type PipelineStepKey = "funnel" | "creatives" | "campaign";
type OnboardingProgressStep = "plan" | "funnel" | "creatives" | "payload" | "complete";
type StepStatus = "pending" | "active" | "complete" | "failed";

type PipelineStep = {
  key: PipelineStepKey;
  title: string;
  label: string;
  endpoint: string;
};

type FieldErrors = {
  businessName?: string;
  market?: string;
  priceRange?: string;
  budget?: string;
};

type PersistedOnboardingProgress = {
  businessName: string;
  market: string;
  focus: CampaignFocus;
  priceRange: string;
  budget: string;
  goal: string;
  campaignId: string | null;
  currentStep: OnboardingProgressStep;
  failedStep: PipelineStepKey | null;
  error: string | null;
};

const CREATE_PLAN_TIMEOUT_MS = 20_000;
const PIPELINE_STEP_TIMEOUT_MS = 45_000;
const ONBOARDING_PROGRESS_STORAGE_KEY = "dealflow-onboarding-progress-v2";

const PIPELINE_STEPS: PipelineStep[] = [
  {
    key: "funnel",
    title: "Step 1 of 3",
    label: "Generating funnel preview",
    endpoint: "/api/generate-funnel",
  },
  {
    key: "creatives",
    title: "Step 2 of 3",
    label: "Generating ads and creative angles",
    endpoint: "/api/generate-creatives",
  },
  {
    key: "campaign",
    title: "Step 3 of 3",
    label: "Building launch-ready campaign",
    endpoint: "/api/build-campaign",
  },
];

const PRICE_RANGE_OPTIONS = [
  "$400k-$600k",
  "$600k-$900k",
  "$900k-$1.5M",
  "$1.5M+",
] as const;

const BUDGET_OPTIONS = [
  { label: "$1.5k/mo", value: "1500" },
  { label: "$3k/mo", value: "3000" },
  { label: "$5k/mo", value: "5000" },
  { label: "$7.5k+/mo", value: "7500" },
] as const;

const DEFAULT_GOALS: Record<CampaignFocus, string> = {
  seller: "Free home value strategy call",
  buyer: "Private listings + buyer consult",
};

const FOCUS_SUMMARY: Record<CampaignFocus, string> = {
  seller: "Seller leads",
  buyer: "Buyer leads",
};

const FOCUS_HELP: Record<CampaignFocus, string> = {
  seller: "Best for listing appointments, home valuation offers, and seller nurture.",
  buyer: "Best for home search offers, buyer consultations, and tour-ready leads.",
};

function getStepErrorMessage(value: unknown, fallbackLabel: string) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error.trim().length > 0
  ) {
    return value.error;
  }

  return `${fallbackLabel} failed.`;
}

function isPipelineStepKey(value: unknown): value is PipelineStepKey {
  return value === "funnel" || value === "creatives" || value === "campaign";
}

function isProgressStep(value: unknown): value is OnboardingProgressStep {
  return (
    value === "plan" ||
    value === "funnel" ||
    value === "creatives" ||
    value === "payload" ||
    value === "complete"
  );
}

function isCampaignFocus(value: unknown): value is CampaignFocus {
  return value === "seller" || value === "buyer";
}

function createInitialStepStatuses(): Record<PipelineStepKey, StepStatus> {
  return {
    funnel: "pending",
    creatives: "pending",
    campaign: "pending",
  };
}

function getProgressStepFromPipelineStep(step: PipelineStepKey): OnboardingProgressStep {
  if (step === "campaign") {
    return "payload";
  }

  return step;
}

function getNextProgressStep(step: PipelineStepKey): OnboardingProgressStep {
  if (step === "funnel") {
    return "creatives";
  }

  if (step === "creatives") {
    return "payload";
  }

  return "complete";
}

function getStatusesForProgressStep(step: OnboardingProgressStep) {
  if (step === "plan") {
    return createInitialStepStatuses();
  }

  if (step === "funnel") {
    return createInitialStepStatuses();
  }

  if (step === "creatives") {
    return {
      funnel: "complete",
      creatives: "pending",
      campaign: "pending",
    } satisfies Record<PipelineStepKey, StepStatus>;
  }

  if (step === "payload") {
    return {
      funnel: "complete",
      creatives: "complete",
      campaign: "pending",
    } satisfies Record<PipelineStepKey, StepStatus>;
  }

  return {
    funnel: "complete",
    creatives: "complete",
    campaign: "complete",
  } satisfies Record<PipelineStepKey, StepStatus>;
}

function getStartStepIndex(step: OnboardingProgressStep) {
  if (step === "creatives") {
    return 1;
  }

  if (step === "payload") {
    return 2;
  }

  return 0;
}

function buildOnboardingIdempotencySeed(params: {
  businessName: string;
  market: string;
  focus: CampaignFocus;
  priceRange: string;
  budget: string;
  goal: string;
}) {
  return [
    params.businessName,
    params.market,
    params.focus,
    params.priceRange,
    params.budget,
    params.goal,
  ]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

async function fetchJsonWithTimeout<T>(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    let data: T | null = null;

    try {
      data = (await response.json()) as T;
    } catch (error) {
      console.error("JSON PARSE FAILED:", error);
      throw new Error("Invalid JSON response");
    }

    return {
      response,
      data,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out.");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function validateFields(params: {
  businessName: string;
  market: string;
  priceRange: string;
  budget: string;
}) {
  const errors: FieldErrors = {};
  const budgetValue = Number.parseFloat(params.budget.replace(/[^0-9.]/g, ""));

  if (params.businessName.trim().length === 0) {
    errors.businessName = "Add your name, team, or brokerage so we can personalize the preview.";
  }

  if (params.market.trim().length === 0) {
    errors.market = "Enter the city or market you want to advertise in.";
  }

  if (params.priceRange.trim().length === 0) {
    errors.priceRange = "Choose the price range you want this campaign to focus on.";
  }

  if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
    errors.budget = "Choose a monthly ad budget so the preview uses a realistic spend plan.";
  }

  return errors;
}

function formatProgressLabel(step: OnboardingProgressStep) {
  switch (step) {
    case "plan":
      return "Step 1 of 2: campaign setup";
    case "funnel":
      return "Step 2 of 2: generating funnel";
    case "creatives":
      return "Step 2 of 2: generating ads";
    case "payload":
      return "Step 2 of 2: preparing launch";
    case "complete":
      return "Step 2 of 2: ready to review";
    default:
      return "Step 1 of 2: campaign setup";
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const latestPlanRequestIdRef = useRef(0);
  const activePlanAbortControllerRef = useRef<AbortController | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [market, setMarket] = useState("");
  const [focus, setFocus] = useState<CampaignFocus>("seller");
  const [priceRange, setPriceRange] = useState<string>(PRICE_RANGE_OPTIONS[1]);
  const [budget, setBudget] = useState<string>(BUDGET_OPTIONS[1].value);
  const [goal, setGoal] = useState<string>(DEFAULT_GOALS.seller);
  const [goalTouched, setGoalTouched] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<Record<PipelineStepKey, StepStatus>>(createInitialStepStatuses);
  const [currentStep, setCurrentStep] = useState<OnboardingProgressStep>("plan");
  const [failedStep, setFailedStep] = useState<PipelineStepKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);

  const normalizedGoal = goal.trim() || DEFAULT_GOALS[focus];

  const idempotencySeed = useMemo(
    () =>
      buildOnboardingIdempotencySeed({
        businessName,
        market,
        focus,
        priceRange,
        budget,
        goal: normalizedGoal,
      }),
    [budget, businessName, focus, market, normalizedGoal, priceRange],
  );

  useEffect(() => {
    if (!goalTouched) {
      setGoal(DEFAULT_GOALS[focus]);
    }
  }, [focus, goalTouched]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(ONBOARDING_PROGRESS_STORAGE_KEY);

    if (!raw) {
      setHydrated(true);
      return;
    }

    try {
      const saved = JSON.parse(raw) as Partial<PersistedOnboardingProgress>;
      const restoredStep = isProgressStep(saved.currentStep) ? saved.currentStep : "plan";
      const restoredFailedStep = isPipelineStepKey(saved.failedStep) ? saved.failedStep : null;
      const restoredFocus = isCampaignFocus(saved.focus) ? saved.focus : "seller";
      const restoredGoal = typeof saved.goal === "string" && saved.goal.trim().length > 0
        ? saved.goal
        : DEFAULT_GOALS[restoredFocus];

      setBusinessName(typeof saved.businessName === "string" ? saved.businessName : "");
      setMarket(typeof saved.market === "string" ? saved.market : "");
      setFocus(restoredFocus);
      setPriceRange(
        typeof saved.priceRange === "string" && saved.priceRange.trim().length > 0
          ? saved.priceRange
          : PRICE_RANGE_OPTIONS[1],
      );
      setBudget(
        typeof saved.budget === "string" && saved.budget.trim().length > 0
          ? saved.budget
          : BUDGET_OPTIONS[1].value,
      );
      setGoal(restoredGoal);
      setGoalTouched(restoredGoal !== DEFAULT_GOALS[restoredFocus]);
      setCampaignId(typeof saved.campaignId === "string" && saved.campaignId.trim().length > 0 ? saved.campaignId : null);
      setCurrentStep(restoredStep);
      setStepStatuses(getStatusesForProgressStep(restoredStep));
      setFailedStep(restoredFailedStep);
      setError(typeof saved.error === "string" ? saved.error : null);
      setHasSavedProgress(restoredStep !== "complete" || typeof saved.campaignId === "string");
    } catch {
      window.localStorage.removeItem(ONBOARDING_PROGRESS_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    const progress: PersistedOnboardingProgress = {
      businessName,
      market,
      focus,
      priceRange,
      budget,
      goal: normalizedGoal,
      campaignId,
      currentStep,
      failedStep,
      error,
    };

    const hasMeaningfulState =
      Boolean(
        businessName.trim() ||
          market.trim() ||
          priceRange.trim() ||
          budget.trim() ||
          goal.trim() ||
          campaignId ||
          currentStep !== "plan" ||
          failedStep ||
          error,
      ) && currentStep !== "complete";

    if (hasMeaningfulState) {
      window.localStorage.setItem(ONBOARDING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
      setHasSavedProgress(true);
    } else {
      window.localStorage.removeItem(ONBOARDING_PROGRESS_STORAGE_KEY);
      setHasSavedProgress(false);
    }

    const url = new URL(window.location.href);

    if (campaignId) {
      url.searchParams.set("campaignId", campaignId);
    } else {
      url.searchParams.delete("campaignId");
    }

    if (hasMeaningfulState) {
      url.searchParams.set("step", currentStep);
    } else {
      url.searchParams.delete("step");
    }

    window.history.replaceState({}, "", url.toString());
  }, [budget, businessName, campaignId, currentStep, error, failedStep, focus, goal, hydrated, market, normalizedGoal, priceRange]);

  function clearSavedProgress() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ONBOARDING_PROGRESS_STORAGE_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("campaignId");
      url.searchParams.delete("step");
      window.history.replaceState({}, "", url.toString());
    }

    setBusinessName("");
    setMarket("");
    setFocus("seller");
    setPriceRange(PRICE_RANGE_OPTIONS[1]);
    setBudget(BUDGET_OPTIONS[1].value);
    setGoal(DEFAULT_GOALS.seller);
    setGoalTouched(false);
    setCampaignId(null);
    setCurrentStep("plan");
    setStepStatuses(createInitialStepStatuses());
    setFailedStep(null);
    setError(null);
    setFieldErrors({});
    setHasSavedProgress(false);
    setLoading(false);
  }

  async function runPipeline(startStepIndex: number, currentCampaignId: string) {
    for (let index = startStepIndex; index < PIPELINE_STEPS.length; index += 1) {
      const step = PIPELINE_STEPS[index];

      setCurrentStep(getProgressStepFromPipelineStep(step.key));
      setStepStatuses((current) => ({
        ...current,
        [step.key]: "active",
      }));
      setFailedStep(null);
      setError(null);

      try {
        const { response, data } = await fetchJsonWithTimeout<Record<string, unknown>>(
          step.endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ campaignId: currentCampaignId }),
          },
          PIPELINE_STEP_TIMEOUT_MS,
        );

        if (!response.ok) {
          throw new Error(getStepErrorMessage(data, step.label));
        }

        setStepStatuses((current) => ({
          ...current,
          [step.key]: "complete",
        }));
        setCurrentStep(getNextProgressStep(step.key));
      } catch (stepError) {
        const message =
          stepError instanceof Error && stepError.message === "Request timed out."
            ? `${step.label} timed out. Retry this step to continue.`
            : stepError instanceof Error
              ? stepError.message
              : `${step.label} failed.`;
        setStepStatuses((current) => ({
          ...current,
          [step.key]: "failed",
        }));
        setFailedStep(step.key);
        setError(message);
        throw stepError;
      }
    }

    setCurrentStep("complete");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ONBOARDING_PROGRESS_STORAGE_KEY);
    }
    setHasSavedProgress(false);
    router.push(`/build/funnel?campaignId=${encodeURIComponent(currentCampaignId)}`);
  }

  async function createOrReuseCampaignPlan() {
    activePlanAbortControllerRef.current?.abort();

    const controller = new AbortController();
    activePlanAbortControllerRef.current = controller;
    const requestId = Date.now();
    latestPlanRequestIdRef.current = requestId;

    const { response, data } = await fetchJsonWithTimeout<
      { success?: boolean; campaignId?: string; error?: string; stack?: string | null }
    >(
      "/api/onboarding/plan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          business_type: "Real Estate",
          business_name: businessName,
          market,
          focus,
          price_range: priceRange,
          budget,
          goal: normalizedGoal,
          idempotencySeed,
        }),
      },
      CREATE_PLAN_TIMEOUT_MS,
    );

    if (requestId !== latestPlanRequestIdRef.current) {
      console.warn("IGNORING STALE ONBOARDING RESPONSE:", { requestId });
      throw new Error("Stale onboarding response ignored");
    }

    if (!data || typeof data.campaignId !== "string" || data.campaignId.trim().length === 0) {
      console.error("INVALID RESPONSE:", data);
      throw new Error(data?.error ?? "Invalid onboarding response");
    }

    if (!response.ok) {
      throw new Error(data.error ?? "Invalid onboarding response");
    }

    return data.campaignId;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const nextFieldErrors = validateFields({
      businessName,
      market,
      priceRange,
      budget,
    });

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setError("Fix the highlighted fields, then generate your preview.");
      return;
    }

    setLoading(true);
    setError(null);
    setFailedStep(null);
    setCurrentStep("plan");
    setCampaignId(null);
    setStepStatuses(createInitialStepStatuses());

    try {
      const nextCampaignId = await createOrReuseCampaignPlan();
      setCampaignId(nextCampaignId);
      setCurrentStep("funnel");
      await runPipeline(0, nextCampaignId);
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message === "Request timed out."
          ? "Creating your campaign took too long. Your answers are saved, so you can retry without starting over."
          : submitError instanceof Error
            ? submitError.message
            : "We could not create your campaign preview.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry() {
    if (loading || !campaignId || !failedStep) {
      return;
    }

    const failedStepIndex = PIPELINE_STEPS.findIndex((step) => step.key === failedStep);

    if (failedStepIndex < 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await runPipeline(failedStepIndex, campaignId);
    } catch (retryError) {
      setError(
        retryError instanceof Error && retryError.message === "Request timed out."
          ? "That step timed out again. Retry when the service responds."
          : retryError instanceof Error
            ? retryError.message
            : "Retry failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setFailedStep(null);

    try {
      if (!campaignId) {
        const nextCampaignId = await createOrReuseCampaignPlan();
        setCampaignId(nextCampaignId);
        setCurrentStep("funnel");
        await runPipeline(getStartStepIndex("funnel"), nextCampaignId);
        return;
      }

      if (currentStep === "complete") {
        router.push(`/build/funnel?campaignId=${encodeURIComponent(campaignId)}`);
        return;
      }

      await runPipeline(getStartStepIndex(currentStep), campaignId);
    } catch (resumeError) {
      setError(
        resumeError instanceof Error && resumeError.message === "Request timed out."
          ? "Resuming took too long. Retry the current step when the service responds."
          : resumeError instanceof Error
            ? resumeError.message
            : "Resume failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  function renderChoiceButton(params: {
    active: boolean;
    label: string;
    description?: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={params.onClick}
        disabled={loading}
        className={`rounded-2xl border px-4 py-4 text-left transition ${
          params.active
            ? "border-foreground bg-foreground text-background"
            : "border-border/70 bg-background text-foreground hover:border-foreground/40"
        }`}
      >
        <p className="text-sm font-semibold">{params.label}</p>
        {params.description ? (
          <p className={`mt-1 text-sm ${params.active ? "text-background/75" : "text-muted-foreground"}`}>
            {params.description}
          </p>
        ) : null}
      </button>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-8">
      <WizardSteps current="onboarding" />
      <PageHeader
        eyebrow="Campaign setup"
        title="Build your real estate campaign preview"
        description="Answer a few quick questions, then we will generate your funnel, ads, and launch-ready preview. Most teams finish this in about 2 minutes."
      />

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {formatProgressLabel(currentStep)}
          </p>
          <p className="text-sm text-muted-foreground">
            About 60 seconds for setup, then about 90 seconds to generate the preview.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Resume is always saved. If generation slows down, you can come back without losing progress.
        </div>
      </Card>

      {hydrated && hasSavedProgress ? (
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Resume campaign build</p>
            <p className="text-sm text-muted-foreground">
              {campaignId
                ? `Resume from ${currentStep === "payload" ? "building the launch package" : currentStep}. Your saved answers and generated assets are still attached to this campaign.`
                : "Your answers are saved. Resume from campaign creation without creating a duplicate plan."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={clearSavedProgress} disabled={loading}>
              Start over
            </Button>
            <Button type="button" onClick={handleResume} disabled={loading}>
              {loading ? (
                <>
                  <Spinner />
                  Resuming...
                </>
              ) : (
                "Resume build"
              )}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="p-6 sm:p-8">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Agent, team, or brokerage name</span>
              <Input
                required
                value={businessName}
                onChange={(event) => {
                  setBusinessName(event.target.value);
                  setFieldErrors((current) => ({ ...current, businessName: undefined }));
                }}
                disabled={loading}
                placeholder="Northline Realty Group"
              />
              {fieldErrors.businessName ? <p className="text-sm text-rose-400">{fieldErrors.businessName}</p> : null}
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">City or market</span>
              <Input
                required
                value={market}
                onChange={(event) => {
                  setMarket(event.target.value);
                  setFieldErrors((current) => ({ ...current, market: undefined }));
                }}
                disabled={loading}
                placeholder="Toronto, ON"
              />
              {fieldErrors.market ? <p className="text-sm text-rose-400">{fieldErrors.market}</p> : null}
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Campaign focus</p>
              <p className="text-sm text-muted-foreground">Start with the side of the business you want the fastest preview for.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {renderChoiceButton({
                active: focus === "seller",
                label: "Seller campaign",
                description: FOCUS_HELP.seller,
                onClick: () => setFocus("seller"),
              })}
              {renderChoiceButton({
                active: focus === "buyer",
                label: "Buyer campaign",
                description: FOCUS_HELP.buyer,
                onClick: () => setFocus("buyer"),
              })}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Property price range</p>
                <p className="text-sm text-muted-foreground">Pick the part of the market you want this preview to target.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRICE_RANGE_OPTIONS.map((option) => (
                  <div key={option}>
                    {renderChoiceButton({
                      active: priceRange === option,
                      label: option,
                      onClick: () => {
                        setPriceRange(option);
                        setFieldErrors((current) => ({ ...current, priceRange: undefined }));
                      },
                    })}
                  </div>
                ))}
              </div>
              {fieldErrors.priceRange ? <p className="text-sm text-rose-400">{fieldErrors.priceRange}</p> : null}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Monthly ad budget</p>
                <p className="text-sm text-muted-foreground">We use this to shape the preview and launch settings.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {BUDGET_OPTIONS.map((option) => (
                  <div key={option.value}>
                    {renderChoiceButton({
                      active: budget === option.value,
                      label: option.label,
                      onClick: () => {
                        setBudget(option.value);
                        setFieldErrors((current) => ({ ...current, budget: undefined }));
                      },
                    })}
                  </div>
                ))}
              </div>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Or enter a custom monthly budget</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={budget}
                  onChange={(event) => {
                    setBudget(event.target.value);
                    setFieldErrors((current) => ({ ...current, budget: undefined }));
                  }}
                  disabled={loading}
                  placeholder="3000"
                />
              </label>
              {fieldErrors.budget ? <p className="text-sm text-rose-400">{fieldErrors.budget}</p> : null}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Offer or goal</span>
              <Input
                value={goal}
                onChange={(event) => {
                  setGoal(event.target.value);
                  setGoalTouched(true);
                }}
                disabled={loading}
                placeholder={DEFAULT_GOALS[focus]}
              />
              <p className="text-sm text-muted-foreground">
                Leave this as-is if you want the default {FOCUS_SUMMARY[focus].toLowerCase()} angle.
              </p>
            </label>

            <div className="rounded-3xl border border-border/70 bg-muted/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Preview summary</p>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                <p><span className="text-muted-foreground">Market:</span> {market || "Your city"}</p>
                <p><span className="text-muted-foreground">Focus:</span> {FOCUS_SUMMARY[focus]}</p>
                <p><span className="text-muted-foreground">Price range:</span> {priceRange}</p>
                <p><span className="text-muted-foreground">Budget:</span> ${budget || BUDGET_OPTIONS[1].value}/month</p>
                <p><span className="text-muted-foreground">Offer:</span> {normalizedGoal}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Generation progress</p>
                <p className="text-sm text-muted-foreground">
                  We save each step as it finishes so you can resume without rebuilding the whole campaign.
                </p>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Spinner />
                  {currentStep === "plan" ? "Creating campaign" : "Generating preview"}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3">
              {PIPELINE_STEPS.map((step) => {
                const status = stepStatuses[step.key];
                const isActive = status === "active";
                const isComplete = status === "complete";
                const isFailed = status === "failed";

                return (
                  <div
                    key={step.key}
                    className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
                  >
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{step.title}</p>
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {isActive ? <Spinner /> : null}
                      <span
                        className={
                          isFailed
                            ? "text-rose-400"
                            : isComplete
                              ? "text-emerald-400"
                              : isActive
                                ? "text-foreground"
                                : "text-muted-foreground"
                        }
                      >
                        {isComplete
                          ? "Done"
                          : isFailed
                            ? "Failed"
                            : isActive
                              ? "In progress"
                              : "Waiting"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {campaignId ? (
              <p className="text-xs text-muted-foreground">
                Campaign ID: <span className="font-mono text-foreground">{campaignId}</span>
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              This creates your preview first. You will still review funnel and ad details before any live launch.
            </p>

            <div className="flex flex-wrap gap-3">
              {hasSavedProgress ? (
                <Button type="button" variant="secondary" onClick={clearSavedProgress} disabled={loading}>
                  Start over
                </Button>
              ) : null}
              {failedStep ? (
                <Button type="button" variant="secondary" onClick={handleRetry} disabled={loading}>
                  {loading ? (
                    <>
                      <Spinner />
                      Retrying failed step...
                    </>
                  ) : (
                    "Retry failed step"
                  )}
                </Button>
              ) : null}
              <Button disabled={loading} type="submit">
                {loading ? (
                  <>
                    <Spinner />
                    {failedStep ? "Retrying..." : "Generating preview..."}
                  </>
                ) : (
                  "Generate campaign preview"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
