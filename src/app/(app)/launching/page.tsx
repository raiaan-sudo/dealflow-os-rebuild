"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type LaunchStepKey = "campaign" | "ad_set" | "creative" | "ad";

type LaunchStepStatus = "pending" | "active" | "success" | "failed";

type LaunchStep = {
  key: LaunchStepKey;
  label: string;
};

type LaunchApiResponse = {
  campaign_id?: string;
  adset_id?: string;
  creative_id?: string;
  ad_id?: string;
  error?: string;
  stage?: LaunchStepKey;
};

const LAUNCH_STEPS: LaunchStep[] = [
  { key: "campaign", label: "Creating campaign" },
  { key: "ad_set", label: "Creating ad set" },
  { key: "creative", label: "Creating creative" },
  { key: "ad", label: "Creating ad" },
];

function getStageDisplayLabel(step: LaunchStepKey | null) {
  if (step === "ad_set") {
    return "adset";
  }

  if (step === "creative") {
    return "creative";
  }

  if (step === "ad") {
    return "ad";
  }

  return "campaign";
}

function getNextStage(step: LaunchStepKey | null): LaunchStepKey {
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

function getFailureTitle(step: LaunchStepKey | null) {
  if (step === "ad_set") {
    return "Ad set creation failed";
  }

  if (step === "creative") {
    return "Creative creation failed";
  }

  if (step === "ad") {
    return "Ad creation failed";
  }

  return "Campaign creation failed";
}

function getStepStatuses(payload: LaunchApiResponse | null, failedStage: LaunchStepKey | null) {
  const statuses: Record<LaunchStepKey, LaunchStepStatus> = {
    campaign: "pending",
    ad_set: "pending",
    creative: "pending",
    ad: "pending",
  };

  if (!payload && !failedStage) {
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
    statuses.ad = "active";
  } else if (failedStage === "creative") {
    statuses.creative = "failed";
    return statuses;
  } else if (payload?.campaign_id && payload?.adset_id) {
    statuses.creative = "active";
  }

  if (payload?.ad_id) {
    statuses.ad = "success";
  } else if (failedStage === "ad") {
    statuses.ad = "failed";
  }

  return statuses;
}

export default function LaunchingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const hasLaunchIntent = searchParams.get("launchIntent") === "ready";
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failedStep, setFailedStep] = useState<LaunchStepKey | null>(null);
  const [launchState, setLaunchState] = useState<LaunchApiResponse | null>(null);
  const startedAttemptRef = useRef<string | null>(null);

  const lastSuccessfulStep: LaunchStepKey | null = launchState?.ad_id
    ? "ad"
    : launchState?.creative_id
      ? "creative"
      : launchState?.adset_id
        ? "ad_set"
        : launchState?.campaign_id
          ? "campaign"
          : null;
  const resumeStage = failedStep ?? (lastSuccessfulStep ? getNextStage(lastSuccessfulStep) : null);
  const showResumeState = Boolean(lastSuccessfulStep) || attempt > 0;

  useEffect(() => {
    if (!campaignId) {
      setError("Missing campaign id.");
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

          throw new Error(data?.error || "Launch failed.");
        }

        if (cancelled) {
          return;
        }

        setLaunchState(data);

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
          setError(launchError instanceof Error ? launchError.message : "Launch failed.");
        }
      }
    }

    void runLaunch();

    return () => {
      cancelled = true;
    };
  }, [attempt, campaignId, router]);

  const stepStatuses = getStepStatuses(launchState, failedStep);
  const launchReviewHref = campaignId
    ? `/launch?campaignId=${encodeURIComponent(campaignId)}`
    : "/launch";

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8">
      <PageHeader
        eyebrow="Launch"
        title="Launching campaign"
        description="Your campaign is being sent to Meta. Stay on this page while each object is created and confirmed."
      />

      <Card className="p-6 sm:p-8">
        {error ? (
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
              Launch paused
            </div>
            {showResumeState ? (
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Resuming from last successful step</p>
                <p className="mt-2">
                  Current stage: {getStageDisplayLabel(resumeStage)}
                </p>
              </div>
            ) : null}
            <p className="text-lg font-semibold text-foreground">
              {getFailureTitle(failedStep)}
            </p>
            {failedStep ? (
              <p className="text-sm font-medium text-foreground">
                Failed step: {LAUNCH_STEPS.find((step) => step.key === failedStep)?.label ?? "Creating campaign"}
              </p>
            ) : null}
            {lastSuccessfulStep ? (
              <p className="text-sm text-muted-foreground">
                Last successful step: {LAUNCH_STEPS.find((step) => step.key === lastSuccessfulStep)?.label ?? "Creating campaign"}
              </p>
            ) : null}
            <p className="text-sm text-rose-400">Error: {error}</p>
            <Button
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry failed step
            </Button>
          </div>
        ) : attempt < 1 ? (
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
              Confirmation required
            </div>
            <p className="text-lg font-semibold text-foreground">
              Launch is ready, but it will not start from page load.
            </p>
            {hasLaunchIntent ? (
              <>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  This prevents browser restores, shared URLs, and accidental refreshes from creating or retrying Meta objects.
                  Start launch only when you are ready to intentionally run the PAUSED Meta launch flow.
                </p>
                <Button
                  onClick={() => {
                    setError(null);
                    setAttempt(1);
                  }}
                >
                  Start PAUSED launch
                </Button>
              </>
            ) : (
              <>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  Open the launch checklist first so billing, Meta selections, selected creative, published funnel,
                  budget cap, and the provider launch switch are visible before any launch attempt.
                </p>
                <Button asChild>
                  <Link href={launchReviewHref}>Review launch gates</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Spinner className="size-3.5" />
              Launch in progress
            </div>
            {showResumeState ? (
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Resuming from last successful step</p>
                <p className="mt-2">
                  Current stage: {getStageDisplayLabel(resumeStage)}
                </p>
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {LAUNCH_STEPS.find((step) => stepStatuses[step.key] === "active")?.label ??
                  "Waiting for launch result..."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LAUNCH_STEPS.map((item) => {
                const status = stepStatuses[item.key];
                const toneClass =
                  status === "success"
                    ? "text-emerald-300"
                    : status === "failed"
                      ? "text-rose-300"
                      : status === "active"
                        ? "text-foreground"
                        : "text-muted-foreground";

                return (
                <div
                  key={item.key}
                  className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                  <p className={`mt-2 text-sm font-medium ${toneClass}`}>
                    {status === "success"
                      ? "✔ Success"
                      : status === "failed"
                        ? "❌ Failed"
                        : status === "active"
                          ? "In progress"
                          : "Waiting"}
                  </p>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
