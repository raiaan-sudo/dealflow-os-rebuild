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

function formatPublishState(state: CampaignPublishState) {
  if (state === "published") {
    return "Published";
  }

  if (state === "staged") {
    return "Staged";
  }

  return "Draft";
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

  const livePath = publish?.slug ? `/f/${publish.slug}` : normalizedSlug ? `/f/${normalizedSlug}` : null;
  const livePublished = publish?.state === "published" && publish.hasPublishedSnapshot;
  const publishedWithoutSnapshot = publish?.state === "published" && !publish.hasPublishedSnapshot;
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
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Save before staging or publishing</h3>
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
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Stage or publish the public funnel</h3>
          <p className="mt-3 max-w-[760px] text-sm leading-7 text-muted-foreground">
            Draft edits stay private. Staging captures a snapshot, and publishing updates the live public funnel from that immutable snapshot.
          </p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">
          {formatPublishState(publish?.state ?? "draft")}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">State</p>
          <p className="mt-3 text-sm font-semibold">{formatPublishState(publish?.state ?? "draft")}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Slug</p>
          <p className="mt-3 break-words text-sm font-semibold">{publish?.slug ?? (normalizedSlug || "Not set")}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Staged</p>
          <p className="mt-3 text-sm font-semibold">{formatTimestamp(publish?.stagedAt ?? null)}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Published</p>
          <p className="mt-3 text-sm font-semibold">{formatTimestamp(publish?.publishedAt ?? null)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(260px,340px)_1fr]">
        <label className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Public slug</p>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="my-campaign-slug"
          />
        </label>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live URL</p>
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
          ) : (
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Add or accept a slug to prepare the public URL.
            </p>
          )}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The public funnel route renders only from the published snapshot. Draft edits remain private until you publish again.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => void updatePublishState("draft")}
          disabled={loadingRecord || loadingState !== null}
        >
          {loadingState === "draft" ? "Saving Draft..." : "Keep as Draft"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void updatePublishState("staged")}
          disabled={loadingRecord || loadingState !== null || !normalizedSlug}
        >
          {loadingState === "staged" ? "Staging..." : "Stage Snapshot"}
        </Button>
        <Button
          onClick={() => void updatePublishState("published")}
          disabled={loadingRecord || loadingState !== null || !normalizedSlug}
        >
          {loadingState === "published" ? "Publishing..." : "Publish Live"}
        </Button>
      </div>

      {loadingRecord ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading publish state...</p>
      ) : null}
      {visibleError ? <p className="mt-4 text-sm text-rose-300">{visibleError}</p> : null}
      {publishedWithoutSnapshot ? (
        <p className="mt-4 text-sm text-amber-300">
          The funnel has a published status, but the live snapshot is not ready. Click Publish Live to rebuild the public snapshot.
        </p>
      ) : null}
      {livePublished ? (
        <p className="mt-4 text-sm text-emerald-300">
          The public funnel is serving from the published snapshot only. Draft edits will not change the live page until you publish again.
        </p>
      ) : null}
    </Card>
  );
}
