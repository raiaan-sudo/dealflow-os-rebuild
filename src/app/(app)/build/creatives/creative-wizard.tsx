"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StaticCreativePreviewCard,
  StaticCreativeSummaryCard,
} from "@/components/campaign/static-creative-preview-card";
import { Button } from "@/components/ui/button";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

type CreativeOption = {
  id: string;
  headline: string;
  primaryText: string;
  cta: string;
  score: number;
  recommended?: boolean;
  imageUrl?: string | null;
  imageGenerationState?: string | null;
  imageGenerationMessage?: string | null;
  overlayText?: string | null;
  offer?: string | null;
  category?: CampaignCategory | string | null;
  location?: string | null;
  formatLabel?: string | null;
  qualityGate?: {
    score?: number | null;
    accepted?: boolean | null;
    hardFailures?: string[] | null;
  } | null;
  visualPromptBrief?: {
    category?: CampaignCategory | string | null;
    proofStyle?: string | null;
    mechanism?: string | null;
    visualLogic?: string[] | null;
    overlayLogic?: string[] | null;
  } | null;
  breakdown?: {
    hook?: string;
    concept?: string;
  };
};

type CreativeWizardProps = {
  campaignId: string;
  creatives: CreativeOption[];
};

type SystemJob = {
  id: string;
  kind?: string | null;
  status?: string | null;
  error_message?: string | null;
};

export function CreativeWizard({ campaignId, creatives }: CreativeWizardProps) {
  const router = useRouter();
  const jobStreamsRef = useRef<Map<string, EventSource>>(new Map());
  const autoRenderStartedRef = useRef(false);
  const buildHref = `/builder?campaignId=${encodeURIComponent(campaignId)}`;
  const rankedCreatives = useMemo(
    () => [...creatives].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)),
    [creatives],
  );
  const topCreatives = rankedCreatives.slice(0, 3);
  const topUgcCreative = rankedCreatives.find((creative) => /\bugc\b/i.test(`${creative.id} ${creative.formatLabel ?? ""}`));
  const defaultSelectedIds = topCreatives.length > 0
    ? Array.from(
        new Set(
          topUgcCreative && !topCreatives.some((creative) => creative.id === topUgcCreative.id)
            ? [...topCreatives.slice(0, 2), topUgcCreative].map((creative) => creative.id)
            : topCreatives.map((creative) => creative.id),
        ),
      )
    : rankedCreatives.slice(0, 1).map((creative) => creative.id);
  const minSelected = Math.min(2, rankedCreatives.length);
  const maxSelected = Math.min(6, rankedCreatives.length);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [saving, setSaving] = useState(false);
  const [renderingImages, setRenderingImages] = useState(false);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCreatives = rankedCreatives.filter((creative) => selectedIds.includes(creative.id));
  const primaryCreative = selectedCreatives[0] ?? rankedCreatives[0] ?? null;
  const canContinue = selectedCreatives.length >= minSelected && selectedCreatives.length <= maxSelected;
  const allImagesMissing = rankedCreatives.every((creative) => !creative.imageUrl);
  const hasGeneratedImages = rankedCreatives.some(
    (creative) => creative.imageGenerationState === "generated" && Boolean(creative.imageUrl),
  );
  const hasAttemptedImageGeneration = rankedCreatives.some(
    (creative) => Boolean(creative.imageGenerationMessage) || Boolean(creative.imageGenerationState),
  );
  const hasCreditBlocker = rankedCreatives.some((creative) =>
    /insufficient credits|add at least/i.test(creative.imageGenerationMessage ?? ""),
  );
  const autoRenderStorageKey = hasCreditBlocker
    ? `dealflow:auto-image-render:credit-overdraft:${campaignId}`
    : `dealflow:auto-image-render:${campaignId}`;

  const subscribeToJob = useCallback((jobId: string) => {
    if (jobStreamsRef.current.has(jobId)) {
      return;
    }

    const source = new EventSource(`/api/system-jobs/${encodeURIComponent(jobId)}/stream`);
    jobStreamsRef.current.set(jobId, source);

    source.addEventListener("job", (event) => {
      try {
        const job = JSON.parse((event as MessageEvent).data) as SystemJob;

        if (job.status === "completed") {
          setRenderMessage("Image previews are ready.");
          source.close();
          jobStreamsRef.current.delete(jobId);
          router.refresh();
        } else if (job.status === "failed") {
          setRenderMessage(job.error_message || "Image preview rendering failed.");
          source.close();
          jobStreamsRef.current.delete(jobId);
          router.refresh();
        }
      } catch {
        source.close();
        jobStreamsRef.current.delete(jobId);
      }
    });

    source.addEventListener("error", () => {
      source.close();
      jobStreamsRef.current.delete(jobId);
    });
  }, [router]);

  const queueImagePreviews = useCallback(async ({ force = false, automatic = false } = {}) => {
    if (renderingImages) {
      return;
    }

    setRenderingImages(true);
    setError(null);
    setRenderMessage(
      automatic
        ? "Preparing image previews automatically. You can review the creative set while visuals finish."
        : "Preparing image previews.",
    );

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-static-ads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: SystemJob | null; error?: string | null }
        | null;

      if (!response.ok || !data?.job?.id) {
        throw new Error(data?.error || "Image preview rendering could not start.");
      }

      setRenderMessage("Image previews are being prepared. This page will update when the visuals are ready.");
      subscribeToJob(data.job.id);
    } catch (renderError) {
      setRenderMessage(null);
      setError(renderError instanceof Error ? renderError.message : "Image preview rendering could not start.");
    } finally {
      setRenderingImages(false);
    }
  }, [campaignId, renderingImages, subscribeToJob]);

  useEffect(() => {
    if (!allImagesMissing || hasGeneratedImages || autoRenderStartedRef.current) {
      return;
    }

    if (typeof window !== "undefined" && window.sessionStorage.getItem(autoRenderStorageKey) === "started") {
      return;
    }

    autoRenderStartedRef.current = true;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(autoRenderStorageKey, "started");
    }

    void queueImagePreviews({ force: hasCreditBlocker, automatic: true });
  }, [allImagesMissing, autoRenderStorageKey, hasCreditBlocker, hasGeneratedImages, queueImagePreviews]);

  function toggleCreative(creativeId: string) {
    setSelectedIds((current) => {
      if (current.includes(creativeId)) {
        return current.filter((id) => id !== creativeId);
      }

      if (current.length >= maxSelected) {
        return current;
      }

      return [...current, creativeId];
    });
    setError(null);
  }

  async function handleNext() {
    if (saving) {
      return;
    }

    if (!canContinue || !primaryCreative) {
      setError(
        rankedCreatives.length >= 2
          ? `Select ${minSelected}-${maxSelected} creatives to continue.`
          : "Select at least one creative to continue.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/select-ad`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedAdId: primaryCreative.id,
            selectedAdIds: selectedCreatives.map((creative) => creative.id),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save selected ad.");
      }

      const persistedSelectedAdIds = Array.isArray(data?.selected_ad_ids)
        ? data.selected_ad_ids.map(String).filter(Boolean)
        : [];
      const persistedSelectedAdId =
        typeof data?.selected_ad_id === "string" && data.selected_ad_id.length > 0
          ? data.selected_ad_id
          : primaryCreative.id;

      const params = new URLSearchParams();
      params.set("campaignId", campaignId);
      params.set("selectedAdId", persistedSelectedAdId);
      if (persistedSelectedAdIds.length > 0) {
        params.set("selectedAdIds", persistedSelectedAdIds.join(","));
      }

      router.push(`/preview?${params.toString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save selected ad.");
    } finally {
      setSaving(false);
    }
  }

  if (!primaryCreative) {
    return (
      <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
        No saved creative options are ready yet. Go back and generate creatives first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(420px,1.1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Primary creative</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Lead with the strongest ad</h2>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {selectedCreatives.length}/{maxSelected} selected
            </span>
          </div>
          <StaticCreativePreviewCard
            category={primaryCreative.category}
            cta={primaryCreative.cta}
            headline={primaryCreative.headline}
            imageGenerationMessage={primaryCreative.imageGenerationMessage}
            imageGenerationState={primaryCreative.imageGenerationState}
            imageUrl={primaryCreative.imageUrl}
            location={primaryCreative.location}
            formatLabel={primaryCreative.formatLabel}
            offer={primaryCreative.offer}
            overlayText={primaryCreative.overlayText}
            primaryText={primaryCreative.primaryText}
            qualityGate={primaryCreative.qualityGate}
            score={primaryCreative.score}
            selectedCount={selectedCreatives.length}
            visualPromptBrief={primaryCreative.visualPromptBrief}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Recommended test set</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {selectedCreatives.length} creatives selected
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              DealFlow will launch with the strongest selected creative and keep the set ready for rotation and optimization.
            </p>
          </div>
          {renderMessage || hasGeneratedImages ? (
            <div className="flex flex-wrap items-center gap-3">
              {hasGeneratedImages ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void queueImagePreviews({ force: true })}
                  disabled={renderingImages}
                >
                  {renderingImages ? "Refreshing previews..." : "Refresh image previews"}
                </Button>
              ) : null}
              {renderMessage ? (
                <span className="text-sm leading-6 text-muted-foreground">{renderMessage}</span>
              ) : null}
            </div>
          ) : null}
          {allImagesMissing ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {hasCreditBlocker
                ? "Your strategy, copy, and creative concepts are ready. The previous render stopped before credit overdraft was enabled."
                : "Your strategy, copy, and creative concepts are ready. DealFlow is preparing image previews automatically so this step stays focused on choosing the best test set."}
              {hasCreditBlocker ? (
                <button
                  type="button"
                  className="ml-2 font-semibold text-amber-50 underline decoration-amber-200/50 underline-offset-4"
                  onClick={() => void queueImagePreviews({ force: true })}
                  disabled={renderingImages}
                >
                  Retry image previews
                </button>
              ) : hasAttemptedImageGeneration && !renderingImages ? (
                <button
                  type="button"
                  className="ml-2 font-semibold text-amber-50 underline decoration-amber-200/50 underline-offset-4"
                  onClick={() => void queueImagePreviews({ force: true })}
                >
                  Retry image previews
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid content-start gap-3">
            {selectedCreatives.map((creative) => (
              <StaticCreativeSummaryCard
                angleLabel={creative.visualPromptBrief?.mechanism || creative.breakdown?.hook}
                category={creative.category}
                cta={creative.cta}
                headline={creative.headline}
                imageGenerationMessage={creative.imageGenerationMessage}
                imageGenerationState={creative.imageGenerationState}
                imageUrl={creative.imageUrl}
                key={creative.id}
                location={creative.location}
                formatLabel={creative.formatLabel}
                offer={creative.offer}
                overlayText={creative.overlayText}
                primaryText={creative.primaryText}
                qualityGate={creative.qualityGate}
                score={creative.score}
                selected
                selectedCount={selectedCreatives.length}
                visualPromptBrief={creative.visualPromptBrief}
              />
            ))}
          </div>

          <div className="mt-auto rounded-2xl border border-white/10 bg-black/18 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button asChild type="button" variant="secondary">
                <Link href={buildHref}>
                  Back to build
                </Link>
              </Button>
              <Button onClick={() => void handleNext()} type="button" disabled={saving || !canContinue}>
                {saving ? "Saving..." : "Save test set"}
              </Button>
            </div>
            <p className={error ? "mt-3 text-sm text-rose-400" : "mt-3 text-sm text-muted-foreground"}>
              {error ??
                (rankedCreatives.length >= 2
                  ? `Use ${minSelected}-${maxSelected} creatives. The recommended set is already selected.`
                  : "Select at least one creative to continue.")}
            </p>
          </div>

          <details className="rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              View creative reasoning
            </summary>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">Hook:</strong> {primaryCreative.breakdown?.hook || "Not available"}</p>
              <p><strong className="text-foreground">Concept:</strong> {primaryCreative.breakdown?.concept || "Not available"}</p>
            </div>
          </details>
        </div>
      </section>

      <details className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Change selected creatives
        </summary>
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Creative test queue</p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">
                Select {minSelected}-{maxSelected} creatives
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedCreatives.length}/{maxSelected} selected
            </p>
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-3">
            {rankedCreatives.map((creative, index) => {
              const selected = selectedIds.includes(creative.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`min-w-0 rounded-2xl border p-2 text-left transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                  key={creative.id}
                  onClick={() => toggleCreative(creative.id)}
                  type="button"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Creative {index + 1}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {selected ? "Selected" : "Add"}
                    </span>
                  </div>
                  <StaticCreativeSummaryCard
                    angleLabel={creative.visualPromptBrief?.mechanism || creative.breakdown?.hook}
                    category={creative.category}
                    cta={creative.cta}
                    headline={creative.headline}
                    imageGenerationMessage={creative.imageGenerationMessage}
                    imageGenerationState={creative.imageGenerationState}
                    imageUrl={creative.imageUrl}
                    location={creative.location}
                    formatLabel={creative.formatLabel}
                    offer={creative.offer}
                    overlayText={creative.overlayText}
                    primaryText={creative.primaryText}
                    qualityGate={creative.qualityGate}
                    score={creative.score}
                    selected={selected}
                    index={index}
                    selectedCount={selectedCreatives.length}
                    visualPromptBrief={creative.visualPromptBrief}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
  }
