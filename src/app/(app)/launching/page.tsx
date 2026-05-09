"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Clock3, Loader2, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { syncCampaignStatus } from "@/components/campaign/launch/launch-runtime-api";

type LaunchApiStage = "campaign" | "ad_set" | "creative" | "ad";
type LaunchStepStatus = "pending" | "active" | "success" | "failed";

type LaunchApiResponse = {
  campaign_id?: string;
  adset_id?: string;
  creative_id?: string;
  ad_id?: string;
  error?: string;
  stage?: LaunchApiStage;
};

type LaunchSequenceStep = {
  key: "prepare" | "campaign" | "ad_set" | "creative" | "send_paused" | "confirm";
  label: string;
  description: string;
};

const LAUNCH_SEQUENCE: LaunchSequenceStep[] = [
  {
    key: "prepare",
    label: "Preparing campaign",
    description: "Checking launch intent, campaign assets, and the saved launch room.",
  },
  {
    key: "campaign",
    label: "Creating Meta campaign",
    description: "Opening the campaign shell in Meta with DealFlow safety controls.",
  },
  {
    key: "ad_set",
    label: "Building ad set",
    description: "Attaching budget, audience, placement, Page, pixel, and destination.",
  },
  {
    key: "creative",
    label: "Publishing creative",
    description: "Sending the selected ad creative package into the Meta campaign.",
  },
  {
    key: "send_paused",
    label: "Sending paused launch to Meta",
    description: "Creating the ad in PAUSED mode so delivery stays controlled.",
  },
  {
    key: "confirm",
    label: "Confirming launch record",
    description: "Saving the launch receipt and requesting a fresh Meta status check.",
  },
];

function getNextStage(step: LaunchApiStage | null): LaunchApiStage {
  if (step === "campaign") {
    return "ad_set";
  }

  if (step === "ad_set") {
    return "creative";
  }

  if (step === "creative") {
    return "ad";
  }

  return "campaign";
}

function getFailureTitle(step: LaunchApiStage | null) {
  if (step === "ad_set") {
    return "Ad set needs attention";
  }

  if (step === "creative") {
    return "Creative publish needs attention";
  }

  if (step === "ad") {
    return "Paused ad send needs attention";
  }

  return "Meta campaign needs attention";
}

function isAuthOrAccountError(value: string | null) {
  return Boolean(value && /auth|oauth|token|permission|account|connect|login|session/i.test(value));
}

function getLaunchProgress(payload: LaunchApiResponse | null, failedStage: LaunchApiStage | null, attempt: number) {
  const completed = [
    attempt > 0 ? "prepare" : null,
    payload?.campaign_id ? "campaign" : null,
    payload?.adset_id ? "ad_set" : null,
    payload?.creative_id ? "creative" : null,
    payload?.ad_id ? "send_paused" : null,
  ].filter(Boolean);
  const successCount = completed.length;

  if (payload?.campaign_id && payload.adset_id && payload.creative_id && payload.ad_id) {
    return 100;
  }

  if (failedStage) {
    return Math.max(12, Math.round((successCount / LAUNCH_SEQUENCE.length) * 100));
  }

  return Math.max(attempt > 0 ? 14 : 0, Math.round(((successCount + (attempt > 0 ? 0.5 : 0)) / LAUNCH_SEQUENCE.length) * 100));
}

function getSequenceStatuses(payload: LaunchApiResponse | null, failedStage: LaunchApiStage | null, attempt: number) {
  const statuses: Record<LaunchSequenceStep["key"], LaunchStepStatus> = {
    prepare: attempt > 0 ? "success" : "pending",
    campaign: "pending",
    ad_set: "pending",
    creative: "pending",
    send_paused: "pending",
    confirm: "pending",
  };

  if (attempt > 0 && !payload && !failedStage) {
    statuses.campaign = "active";
    return statuses;
  }

  if (payload?.campaign_id) {
    statuses.campaign = "success";
    statuses.ad_set = "active";
  } else if (failedStage === "campaign") {
    statuses.campaign = "failed";
    return statuses;
  }

  if (payload?.adset_id) {
    statuses.ad_set = "success";
    statuses.creative = "active";
  } else if (failedStage === "ad_set") {
    statuses.ad_set = "failed";
    return statuses;
  }

  if (payload?.creative_id) {
    statuses.creative = "success";
    statuses.send_paused = "active";
  } else if (failedStage === "creative") {
    statuses.creative = "failed";
    return statuses;
  }

  if (payload?.ad_id) {
    statuses.send_paused = "success";
    statuses.confirm = "active";
  } else if (failedStage === "ad") {
    statuses.send_paused = "failed";
  }

  return statuses;
}

function StepIcon({ status }: { status: LaunchStepStatus }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 text-emerald-200" />;
  }

  if (status === "failed") {
    return <CircleAlert className="size-4 text-rose-200" />;
  }

  if (status === "active") {
    return <Loader2 className="size-4 animate-spin text-cyan-100" />;
  }

  return <Clock3 className="size-4 text-muted-foreground" />;
}

export default function LaunchingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const hasLaunchIntent = searchParams.get("launchIntent") === "ready";
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failedStep, setFailedStep] = useState<LaunchApiStage | null>(null);
  const [launchState, setLaunchState] = useState<LaunchApiResponse | null>(null);
  const startedAttemptRef = useRef<string | null>(null);

  const lastSuccessfulStep: LaunchApiStage | null = launchState?.ad_id
    ? "ad"
    : launchState?.creative_id
      ? "creative"
      : launchState?.adset_id
        ? "ad_set"
        : launchState?.campaign_id
          ? "campaign"
          : null;
  const resumeStage = failedStep ?? (lastSuccessfulStep ? getNextStage(lastSuccessfulStep) : null);
  const showResumeState = Boolean(lastSuccessfulStep) || attempt > 1;
  const stepStatuses = useMemo(
    () => getSequenceStatuses(launchState, failedStep, attempt),
    [attempt, failedStep, launchState],
  );
  const launchProgress = getLaunchProgress(launchState, failedStep, attempt);
  const activeStep =
    LAUNCH_SEQUENCE.find((step) => stepStatuses[step.key] === "active") ??
    LAUNCH_SEQUENCE.find((step) => stepStatuses[step.key] === "pending") ??
    LAUNCH_SEQUENCE[LAUNCH_SEQUENCE.length - 1];
  const launchReviewHref = campaignId
    ? `/launch?campaignId=${encodeURIComponent(campaignId)}`
    : "/launch";
  const reconnectHref = campaignId
    ? `/api/integrations/meta/connect?returnTo=${encodeURIComponent(launchReviewHref)}`
    : "/api/integrations/meta/connect?returnTo=/launch";

  useEffect(() => {
    if (!campaignId) {
      setError("Campaign id is missing. Return to launch settings and open this campaign again.");
      return;
    }

    if (attempt < 1) {
      return;
    }

    const currentCampaignId = campaignId;
    const attemptKey = `${currentCampaignId}:${attempt}`;
    if (startedAttemptRef.current === attemptKey) {
      return;
    }

    startedAttemptRef.current = attemptKey;
    let cancelled = false;

    async function runLaunch() {
      try {
        setLaunchState(null);
        setFailedStep(null);
        setError(null);
        const response = await fetch(`/api/campaigns/${encodeURIComponent(currentCampaignId)}/launch`, {
          method: "POST",
        });
        const data = (await response.json().catch(() => null)) as LaunchApiResponse | null;

        if (!response.ok) {
          if (!cancelled) {
            setLaunchState(data);
            setFailedStep(data?.stage ?? "campaign");
          }

          throw new Error(data?.error || "DealFlow could not complete the Meta launch sequence.");
        }

        if (cancelled) {
          return;
        }

        setLaunchState(data);

        await syncCampaignStatus(currentCampaignId).catch(() => null);

        const params = new URLSearchParams();
        params.set("campaignId", currentCampaignId);

        if (data?.campaign_id) {
          params.set("metaCampaignId", String(data.campaign_id));
        }

        if (data?.adset_id) {
          params.set("metaAdSetId", String(data.adset_id));
        }

        if (data?.creative_id) {
          params.set("metaCreativeId", String(data.creative_id));
        }

        if (data?.ad_id) {
          params.set("metaAdId", String(data.ad_id));
        }

        router.replace(`/launch-success?${params.toString()}`);
      } catch (launchError) {
        if (!cancelled) {
          setError(launchError instanceof Error ? launchError.message : "DealFlow could not complete the Meta launch sequence.");
        }
      }
    }

    void runLaunch();

    return () => {
      cancelled = true;
    };
  }, [attempt, campaignId, router]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-[1120px] items-center px-3 py-6 sm:px-6">
      <Card className="w-full rounded-[32px] border-cyan-300/15 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(140deg,rgba(6,10,24,0.98),rgba(12,13,34,0.94))] p-5 shadow-[0_40px_140px_-80px_rgba(34,211,238,0.8)] sm:p-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 shadow-[0_0_80px_rgba(34,211,238,0.24)]">
            <span className="absolute inset-0 animate-ping rounded-full border border-cyan-200/20" />
            <span className="absolute inset-3 rounded-full border border-violet-300/20" />
            <Rocket className="relative size-10 text-cyan-100" />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
              <ShieldCheck className="size-3.5" />
              Meta objects are created PAUSED
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
              <Sparkles className="size-3.5" />
              Premium launch sequence
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            {error ? "Launch needs attention" : attempt < 1 ? "Ready to launch" : "Launching campaign"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {error
              ? "The launch sequence paused before completion. Nothing was activated automatically; review the recovery step below and retry when ready."
              : attempt < 1
                ? "Start only when you intentionally want DealFlow to send the paused campaign build to Meta."
                : "DealFlow is creating the campaign structure, sending it to Meta in PAUSED mode, and preparing the launch receipt."}
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          <div className="h-3 overflow-hidden rounded-full border border-white/8 bg-white/[0.045]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#a78bfa,#34d399)] transition-all duration-700"
              style={{ width: `${launchProgress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>{activeStep.label}</span>
            <span>{launchProgress}%</span>
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-3 lg:grid-cols-3">
          {LAUNCH_SEQUENCE.map((step) => {
            const status = stepStatuses[step.key];
            const active = status === "active";

            return (
              <div
                key={step.key}
                className={`rounded-[22px] border p-4 text-left transition-all ${
                  active
                    ? "border-cyan-300/35 bg-cyan-300/10 shadow-[0_24px_70px_-48px_rgba(34,211,238,0.8)]"
                    : status === "success"
                      ? "border-emerald-300/20 bg-emerald-300/10"
                      : status === "failed"
                        ? "border-rose-300/25 bg-rose-300/10"
                        : "border-white/8 bg-white/[0.035]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-full border border-white/10 bg-black/20 p-2">
                    <StepIcon status={status} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{step.label}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          {error ? (
            <div className="rounded-[24px] border border-rose-300/25 bg-rose-300/10 p-5 text-left">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-100">
                    Recovery
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{getFailureTitle(failedStep)}</h2>
                  {showResumeState ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      DealFlow will continue from {resumeStage ? LAUNCH_SEQUENCE.find((step) => step.key === resumeStage)?.label ?? "the next launch step" : "the next launch step"}.
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm leading-6 text-rose-100">{error}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button
                    onClick={() => {
                      setError(null);
                      setAttempt((value) => value + 1);
                    }}
                  >
                    Retry launch
                  </Button>
                  {isAuthOrAccountError(error) ? (
                    <Button asChild variant="secondary">
                      <Link href={reconnectHref}>Reconnect Meta</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary">
                    <Link href={launchReviewHref}>Review launch settings</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : attempt < 1 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-left">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    Launch confirmation
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">
                    {hasLaunchIntent ? "Send this campaign to Meta in PAUSED mode" : "Review launch settings first"}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                    {hasLaunchIntent
                      ? "Browser restores and shared URLs will not start a launch. This button is the intentional launch action."
                      : "Open the launch checklist so billing, Meta selections, creative, funnel, budget policy, and provider switch are visible before any send attempt."}
                  </p>
                </div>
                {hasLaunchIntent ? (
                  <Button
                    size="lg"
                    onClick={() => {
                      setError(null);
                      setAttempt(1);
                    }}
                  >
                    Start paused launch
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <Link href={launchReviewHref}>Review launch settings</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 p-5 text-center">
              <div className="pointer-events-none absolute inset-0 opacity-60">
                <span className="absolute left-[12%] top-6 size-1 rounded-full bg-cyan-200 animate-pulse" />
                <span className="absolute left-[78%] top-10 size-1.5 rounded-full bg-violet-200 animate-pulse" />
                <span className="absolute left-[52%] bottom-8 size-1 rounded-full bg-emerald-200 animate-pulse" />
              </div>
              <p className="relative text-sm font-medium text-cyan-50">
                Hold tight. The launch receipt opens as soon as Meta IDs are saved and the confirmation check completes.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
