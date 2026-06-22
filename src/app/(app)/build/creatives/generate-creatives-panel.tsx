"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

type GenerateCreativesPanelProps = {
  campaignId: string;
  campaignName: string;
  offer: string;
  market: string;
};

export function GenerateCreativesPanel({
  campaignId,
  campaignName,
  offer,
  market,
}: GenerateCreativesPanelProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildHref = `/builder?campaignId=${encodeURIComponent(campaignId)}`;

  async function handleGenerate() {
    if (generating) {
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-creatives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaignId }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Could not generate creatives yet.");
      }

      router.replace(`/build/creatives?campaignId=${encodeURIComponent(campaignId)}`);
      router.refresh();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Could not generate creatives yet.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <StatusPill tone="accent">Creative generation</StatusPill>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            Generate your creative test set
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your campaign details prepare static ads, copy angles, and video concepts before final review.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              "Static ad concepts",
              "Copy angles",
              "Video concepts",
            ].map((item) => (
              <div
                className="rounded-[18px] border border-cyan-300/15 bg-cyan-300/[0.055] p-4"
                key={item}
              >
                <CheckCircle2 className="size-4 text-emerald-200" />
                <p className="mt-3 text-sm font-semibold text-foreground">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[20px] border border-white/10 bg-black/18 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Safe campaign creative prep</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Static concepts and scripts are prepared here. Full AI media generation remains locked until generation credits and media rendering access are enabled.
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-[18px] border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void handleGenerate()} disabled={generating} size="lg" type="button">
              {generating ? "Generating..." : "Generate creatives"}
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={buildHref}>Back to Build</Link>
            </Button>
          </div>
        </section>

        <aside className="min-w-0 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Campaign summary</p>
          <h3 className="mt-3 line-clamp-2 text-xl font-semibold text-foreground">{campaignName}</h3>
          <div className="mt-5 space-y-3">
            {[
              { label: "Market", value: market },
              { label: "Offer", value: offer },
              { label: "Next", value: "Save creative test set" },
            ].map((item) => (
              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4" key={item.label}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{item.value || "Ready"}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Card>
  );
}
