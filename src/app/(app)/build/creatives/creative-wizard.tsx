"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
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
  ugcConcepts: Array<{
    id: string;
    title: string;
    hook: string;
    script: string[];
    shotList: string[];
    onScreenText: string[];
    cta: string;
    creatorStyle: string;
    format: string;
  }>;
};

function UgcConceptCard({
  concept,
  index,
}: {
  concept: CreativeWizardProps["ugcConcepts"][number];
  index: number;
}) {
  const { t } = useProductI18n();

  return (
    <div className="h-full rounded-2xl border border-cyan-200/15 bg-[linear-gradient(145deg,rgba(14,165,233,0.09),rgba(2,6,23,0.34))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
            {t("creativeWizard.aiUgc", { number: index + 1 })}
          </p>
          <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-6 text-foreground">{concept.title}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-200/15 bg-cyan-300/[0.08] px-2.5 py-1 text-xs font-semibold text-cyan-100">
          {concept.format}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{concept.hook}</p>
      <div className="mt-4 grid gap-3">
        <div className="rounded-xl border border-white/8 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("creativeWizard.spokenScript")}</p>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-foreground">{concept.script.slice(0, 4).join(" ")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("creativeWizard.visualDirection")}</p>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {concept.shotList.slice(0, 3).join(" / ") || concept.creatorStyle}
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("creativePreview.cta")}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{concept.cta}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreativeWizard({ campaignId, creatives, ugcConcepts }: CreativeWizardProps) {
  const router = useRouter();
  const { href, t } = useProductI18n();
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
  const selectedPreviewCreatives = selectedCreatives.length > 0 ? selectedCreatives : rankedCreatives.slice(0, 3);
  const primaryCreative = selectedPreviewCreatives[0] ?? rankedCreatives[0] ?? null;
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
          ? t("creativeWizard.selectRangeError", { min: minSelected, max: maxSelected })
          : t("creativeWizard.selectOneError"),
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
        throw new Error(data?.error || t("creativeWizard.saveError"));
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

      router.push(href(`/preview?${params.toString()}`));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("creativeWizard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!primaryCreative) {
    return (
      <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
        {t("creativeWizard.noOptions")}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t("creativeWizard.recommended")}</p>
            <h2
              id="creative-selection-status"
              aria-atomic="true"
              aria-live="polite"
              className="mt-1 text-2xl font-semibold text-foreground"
            >
              {t("creativeWizard.selectedCount", { count: selectedCreatives.length })}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("creativeWizard.intro")}
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {t("creativeWizard.testRange", { min: minSelected, max: maxSelected })}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {selectedPreviewCreatives.slice(0, 3).map((creative) => (
            <StaticCreativePreviewCard
              category={creative.category}
              compact
              cta={creative.cta}
              headline={creative.headline}
              imageGenerationMessage={creative.imageGenerationMessage}
              imageGenerationState={creative.imageGenerationState}
              imageUrl={creative.imageUrl}
              key={creative.id}
              location={creative.location}
              offer={creative.offer}
              overlayText={creative.overlayText}
              primaryText={creative.primaryText}
              qualityGate={creative.qualityGate}
              score={creative.score}
              selectedCount={selectedCreatives.length}
              visualPromptBrief={creative.visualPromptBrief}
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {ugcConcepts.slice(0, 2).map((concept, index) => (
            <UgcConceptCard concept={concept} index={index} key={concept.id} />
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button asChild type="button" variant="secondary">
            <Link href={`/build/funnel?campaignId=${encodeURIComponent(campaignId)}`}>
              {t("common.back")}
            </Link>
          </Button>
          <Button onClick={() => void handleNext()} type="button" disabled={saving}>
            {saving ? t("creativeWizard.saving") : t("creativeWizard.saveNext")}
          </Button>
        </div>
        {error ? (
          <p aria-live="assertive" className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}

        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {t("creativeWizard.breakdown")}
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">{t("creativeWizard.hook")}:</strong> {primaryCreative.breakdown?.hook || t("creativeWizard.notAvailable")}</p>
            <p><strong className="text-foreground">{t("creativeWizard.concept")}:</strong> {primaryCreative.breakdown?.concept || t("creativeWizard.notAvailable")}</p>
          </div>
        </details>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t("creativeWizard.queue")}</p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              {t("creativeWizard.selectCreatives", { min: minSelected, max: maxSelected })}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("creativeWizard.ratioSelected", { count: selectedCreatives.length, max: maxSelected })}
          </p>
        </div>
        <div
          aria-label={t("creativeWizard.testSetAria")}
          className="mt-5 grid gap-4 lg:grid-cols-2"
          role="group"
        >
          {rankedCreatives.map((creative, index) => {
            const selected = selectedIds.includes(creative.id);
            return (
              <button
                aria-describedby="creative-selection-status"
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
                    {t("creativeWizard.creativeNumber", { number: index + 1 })}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {selected ? t("creativeWizard.selected") : t("creativeWizard.add")}
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
