"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type CreativeOption = {
  id: string;
  headline: string;
  primaryText: string;
  cta: string;
  score: number;
  recommended?: boolean;
  imageUrl?: string | null;
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
  const fallbackCreative = topCreatives[0] ?? rankedCreatives[0] ?? null;
  const recommendedCreative =
    topCreatives.find((creative) => creative.recommended) ?? fallbackCreative;
  const [selectedId, setSelectedId] = useState(recommendedCreative?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCreative =
    rankedCreatives.find((creative) => creative.id === selectedId) ?? recommendedCreative;
  const otherCreatives = rankedCreatives.filter((creative) => creative.id !== selectedCreative?.id);

  async function handleNext() {
    if (!selectedCreative?.id || saving) {
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
          body: JSON.stringify({ selectedAdId: selectedCreative.id }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save selected ad.");
      }

      const persistedSelectedAdId =
        typeof data?.selected_ad_id === "string" && data.selected_ad_id.length > 0
          ? data.selected_ad_id
          : selectedCreative.id;

      const params = new URLSearchParams();
      params.set("campaignId", campaignId);
      params.set("selectedAdId", persistedSelectedAdId);

      router.push(`/preview?${params.toString()}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save selected ad.");
    } finally {
      setSaving(false);
    }
  }

  if (!selectedCreative) {
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
            <p className="text-sm font-medium text-muted-foreground">Recommended Ad</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {selectedCreative.headline || "Untitled ad"}
            </h2>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Best option
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          {selectedCreative.imageUrl ? (
            <div
              className="aspect-[16/9] w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${selectedCreative.imageUrl})` }}
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-muted text-sm text-muted-foreground">
              Preview image not available yet
            </div>
          )}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Headline</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{selectedCreative.headline}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Primary Text</p>
              <p className="mt-1 text-sm leading-7 text-foreground">{selectedCreative.primaryText}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">CTA</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedCreative.cta || "Learn More"}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button asChild type="button" variant="secondary">
            <Link href={`/build/funnel?campaignId=${encodeURIComponent(campaignId)}`}>
              Back
            </Link>
          </Button>
          <Button onClick={() => void handleNext()} type="button" disabled={saving}>
            {saving ? "Saving..." : "Use This Ad → Next"}
          </Button>
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            View breakdown
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Hook:</strong> {selectedCreative.breakdown?.hook || "Not available"}</p>
            <p><strong className="text-foreground">Concept:</strong> {selectedCreative.breakdown?.concept || "Not available"}</p>
          </div>
        </details>
      </section>

      <details className="rounded-2xl border border-border bg-card p-6">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          See other options
        </summary>
        <div className="mt-4 space-y-4">
          {otherCreatives.length > 0 ? (
            otherCreatives.map((creative) => (
              <div
                key={creative.id}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <p className="text-base font-semibold text-foreground">{creative.headline || "Untitled ad"}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{creative.primaryText}</p>
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSelectedId(creative.id)}
                  >
                    Select this ad
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No other options were generated.</p>
          )}
        </div>
      </details>
    </div>
  );
}
