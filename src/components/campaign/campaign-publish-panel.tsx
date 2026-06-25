"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { slugify } from "@/lib/utils";
import type { CampaignPublishState, FullCampaignRecord } from "@/lib/types/campaign-records";

type CampaignPublishView = FullCampaignRecord["publish"];

type Props = {
  campaignId: string | null;
  initialPublish?: CampaignPublishView | null;
  campaignName?: string | null;
  compact?: boolean;
};

function formatPublishErrorMessage(message: string) {
  if (/032_public_funnel_publishing\.sql|publishing migration is missing/i.test(message)) {
    return "Publishing is not available in this environment yet. Apply 032_public_funnel_publishing.sql in Supabase to enable staging and live public funnels.";
  }

  return message;
}

export function CampaignPublishPanel({
  campaignId,
  initialPublish = null,
  campaignName = null,
  compact = false,
}: Props) {
  const router = useRouter();
  const [publish, setPublish] = useState<CampaignPublishView | null>(initialPublish);
  const [slug, setSlug] = useState(initialPublish?.slug ?? "");
  const [loadingState, setLoadingState] = useState<CampaignPublishState | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublish(initialPublish);
    setSlug(initialPublish?.slug ?? "");
    if (initialPublish?.state === "published" && initialPublish.hasPublishedSnapshot) {
      setError(null);
    }
  }, [initialPublish]);

  useEffect(() => {
    if (!campaignId || initialPublish) {
      return;
    }

    let active = true;

    async function loadPublishState() {
      setLoadingRecord(true);
      setError(null);

      try {
        const response = await fetchWithRetry(`/api/campaigns/${campaignId}`, {
          cache: "no-store",
          timeoutMs: 8000,
          retries: 1,
        });
        const data = (await response.json().catch(() => null)) as
          | FullCampaignRecord
          | { error?: string }
          | null;

        if (!response.ok || !data || "error" in data || !("publish" in data)) {
          throw new Error(
            (data && "error" in data && typeof data.error === "string"
              ? data.error
              : null) ?? "Publish state could not be loaded.",
          );
        }

        if (!active) {
          return;
        }

        setPublish(data.publish);
        setSlug(data.publish.slug ?? "");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Publish state could not be loaded.",
        );
      } finally {
        if (active) {
          setLoadingRecord(false);
        }
      }
    }

    void loadPublishState();

    return () => {
      active = false;
    };
  }, [campaignId, initialPublish]);

  const normalizedSlug = useMemo(() => {
    const direct = slugify(slug);
    if (direct) {
      return direct;
    }

    return slugify(campaignName || "");
  }, [campaignName, slug]);

  const persistedSlug = publish?.slug ? slugify(publish.slug) : null;
  const preparedPath = normalizedSlug ? `/f/${normalizedSlug}` : null;
  const livePath = persistedSlug ? `/f/${persistedSlug}` : null;
  const livePublished =
    publish?.state === "published" &&
    publish.hasPublishedSnapshot &&
    Boolean(persistedSlug);
  const publishedWithoutSnapshot =
    publish?.state === "published" &&
    !publish.hasPublishedSnapshot;
  const publishedWithoutPublicSlug =
    publish?.state === "published" &&
    publish.hasPublishedSnapshot &&
    !persistedSlug;
  const visibleError = livePublished ? null : error;

  async function updatePublishState(nextState: CampaignPublishState) {
    if (!campaignId) {
      return;
    }

    setLoadingState(nextState);
    setError(null);

    try {
      const response = await fetchWithRetry(`/api/campaigns/${campaignId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: nextState,
          slug: normalizedSlug || undefined,
        }),
        timeoutMs: 10000,
        retries: 0,
      });
      const data = (await response.json().catch(() => null)) as
        | FullCampaignRecord
        | { error?: string }
        | null;

      if (!response.ok || !data || "error" in data || !("publish" in data)) {
        throw new Error(
          (data && "error" in data && typeof data.error === "string"
            ? data.error
            : null) ?? "Publish state could not be updated.",
        );
      }

      setPublish(data.publish);
      setSlug(data.publish.slug ?? normalizedSlug);
      setError(null);
      router.refresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? formatPublishErrorMessage(publishError.message)
          : "Publish state could not be updated.",
      );
    } finally {
      setLoadingState(null);
    }
  }

  if (!campaignId) {
    return (
      <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Publishing
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Save before publishing</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          This workflow becomes available after the campaign is saved.
        </p>
      </Card>
    );
  }

  return (
    <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Publishing
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Publish the public funnel</h3>
          <p className="mt-3 max-w-[760px] text-sm leading-7 text-muted-foreground">
            Choose the public link your visitors should use, then publish the funnel live.
          </p>
        </div>
        {livePublished ? (
          <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
            Live
          </Badge>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(260px,420px)_1fr]">
        <label className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">What would you like your public slug to be?</p>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="my-campaign-slug"
          />
          {normalizedSlug ? (
            <p className="text-xs leading-5 text-muted-foreground">
              We’ll publish this as <span className="font-semibold text-foreground">/f/{normalizedSlug}</span>.
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              Use lowercase letters, numbers, and dashes. We’ll format it automatically.
            </p>
          )}
        </label>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Public link</p>
          {livePath ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {livePublished ? (
                <>
                  <Link href={livePath} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">
                    {livePath}
                  </Link>
                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    Public
                  </Badge>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-muted-foreground">{livePath}</span>
                  <Badge className="border-white/10 bg-white/[0.06] text-muted-foreground">
                    Not live yet
                  </Badge>
                </>
              )}
            </div>
          ) : preparedPath && publish?.state !== "published" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground">{preparedPath}</span>
              <Badge className="border-white/10 bg-white/[0.06] text-muted-foreground">
                Not live yet
              </Badge>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {publishedWithoutPublicSlug
                ? "No live public URL is available until a slug is saved and the funnel is republished."
                : "Add or accept a slug to prepare the public link."}
            </p>
          )}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Publish live updates the customer-facing funnel at this link.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          onClick={() => void updatePublishState("published")}
          disabled={loadingRecord || loadingState !== null || !normalizedSlug}
          className="min-w-[180px]"
        >
          {loadingState === "published" ? "Publishing..." : "Publish live"}
        </Button>
      </div>

      {loadingRecord ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading publish state...</p>
      ) : null}
      {visibleError ? <p className="mt-4 text-sm text-rose-300">{visibleError}</p> : null}
      {publishedWithoutSnapshot ? (
        <p className="mt-4 text-sm text-amber-300">
          The live funnel needs to be refreshed. Click Publish live to rebuild the public page.
        </p>
      ) : null}
      {publishedWithoutPublicSlug ? (
        <p className="mt-4 text-sm text-amber-300">
          Add a public slug and publish live to create the public link.
        </p>
      ) : null}
      {livePublished ? (
        <p className="mt-4 text-sm text-emerald-300">
          Your public funnel is live. Publish again whenever you want this link to reflect the latest saved changes.
        </p>
      ) : null}
    </Card>
  );
}
