"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticCreativePreviewCard } from "@/components/campaign/static-creative-preview-card";
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

export function CreativeWizard({ campaignId, creatives }: CreativeWizardProps) {
  const router = useRouter();
  const rankedCreatives = useMemo(
    () => [...creatives].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)),
    [creatives],
  );
  const topCreatives = rankedCreatives.slice(0, 3);
  const defaultSelectedIds = topCreatives.length > 0
    ? topCreatives.map((creative) => creative.id)
    : rankedCreatives.slice(0, 1).map((creative) => creative.id);
  const minSelected = Math.min(2, rankedCreatives.length);
  const maxSelected = Math.min(6, rankedCreatives.length);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCreatives = rankedCreatives.filter((creative) => selectedIds.includes(creative.id));
  const primaryCreative = selectedCreatives[0] ?? rankedCreatives[0] ?? null;
  const canContinue = selectedCreatives.length >= minSelected && selectedCreatives.length <= maxSelected;

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
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Recommended test set</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {selectedCreatives.length} creatives selected
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Launch starts with the strongest selected creative and keeps the full set saved for
              testing, rotation, and optimization.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Test 2-6
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
          offer={primaryCreative.offer}
          overlayText={primaryCreative.overlayText}
          primaryText={primaryCreative.primaryText}
          qualityGate={primaryCreative.qualityGate}
          score={primaryCreative.score}
          selectedCount={selectedCreatives.length}
          visualPromptBrief={primaryCreative.visualPromptBrief}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button asChild type="button" variant="secondary">
            <Link href={`/build/funnel?campaignId=${encodeURIComponent(campaignId)}`}>
              Back
            </Link>
          </Button>
          <Button onClick={() => void handleNext()} type="button" disabled={saving}>
            {saving ? "Saving..." : "Save Test Set → Next"}
          </Button>
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            View breakdown
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Hook:</strong> {primaryCreative.breakdown?.hook || "Not available"}</p>
            <p><strong className="text-foreground">Concept:</strong> {primaryCreative.breakdown?.concept || "Not available"}</p>
          </div>
        </details>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
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
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {rankedCreatives.map((creative, index) => {
            const selected = selectedIds.includes(creative.id);
            return (
              <button
                aria-pressed={selected}
                className={`rounded-2xl border p-3 text-left transition ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/40"
                }`}
                key={creative.id}
                onClick={() => toggleCreative(creative.id)}
                type="button"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Creative {index + 1}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {selected ? "Selected" : "Add"}
                  </span>
                </div>
                <StaticCreativePreviewCard
                  category={creative.category}
                  compact
                  cta={creative.cta}
                  headline={creative.headline}
                  imageGenerationMessage={creative.imageGenerationMessage}
                  imageGenerationState={creative.imageGenerationState}
                  imageUrl={creative.imageUrl}
                  location={creative.location}
                  offer={creative.offer}
                  overlayText={creative.overlayText}
                  primaryText={creative.primaryText}
                  qualityGate={creative.qualityGate}
                  score={creative.score}
                  selectedCount={selectedCreatives.length}
                  visualPromptBrief={creative.visualPromptBrief}
                />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
