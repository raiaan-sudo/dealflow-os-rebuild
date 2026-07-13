"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import type { ProductMessageKey } from "@/lib/i18n/messages";
import { slugify } from "@/lib/utils";
import type { CampaignPublishState, FullCampaignRecord } from "@/lib/types/campaign-records";

type CampaignPublishView = FullCampaignRecord["publish"];

type Props = {
  campaignId: string | null;
  initialPublish?: CampaignPublishView | null;
  campaignName?: string | null;
  compact?: boolean;
};

function publishStateKey(state: CampaignPublishState): ProductMessageKey {
  if (state === "published") {
    return "publish.published";
  }

  if (state === "staged") {
    return "publish.staged";
  }

  return "publish.draft";
}

function publishErrorKey(message: string): ProductMessageKey {
  if (/032_public_funnel_publishing\.sql|publishing migration is missing/i.test(message)) {
    return "publish.migrationError";
  }

  return "publish.updateError";
}

export function CampaignPublishPanel({
  campaignId,
  initialPublish = null,
  campaignName = null,
  compact = false,
}: Props) {
  const { t, dateTime } = useProductI18n();
  const [publish, setPublish] = useState<CampaignPublishView | null>(initialPublish);
  const [slug, setSlug] = useState(initialPublish?.slug ?? "");
  const [loadingState, setLoadingState] = useState<CampaignPublishState | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublish(initialPublish);
    setSlug(initialPublish?.slug ?? "");
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
              : null) ?? t("publish.loadError"),
          );
        }

        if (!active) {
          return;
        }

        setPublish(data.publish);
        setSlug(data.publish.slug ?? "");
      } catch {
        if (!active) {
          return;
        }

        setError(t("publish.loadError"));
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
  }, [campaignId, initialPublish, t]);

  const normalizedSlug = useMemo(() => {
    const direct = slugify(slug);
    if (direct) {
      return direct;
    }

    return slugify(campaignName || "");
  }, [campaignName, slug]);

  const livePath = publish?.slug ? `/f/${publish.slug}` : normalizedSlug ? `/f/${normalizedSlug}` : null;

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
              : null) ?? t("publish.updateError"),
        );
      }

      setPublish(data.publish);
      setSlug(data.publish.slug ?? normalizedSlug);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? t(publishErrorKey(publishError.message))
          : t("publish.updateError"),
      );
    } finally {
      setLoadingState(null);
    }
  }

  if (!campaignId) {
    return (
      <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {t("publish.eyebrow")}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{t("publish.saveTitle")}</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t("publish.saveBody")}
        </p>
      </Card>
    );
  }

  return (
    <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t("publish.eyebrow")}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{t("publish.title")}</h3>
          <p className="mt-3 max-w-[760px] text-sm leading-7 text-muted-foreground">
            {t("publish.description")}
          </p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">
          {t(publishStateKey(publish?.state ?? "draft"))}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.state")}</p>
          <p className="mt-3 text-sm font-semibold">{t(publishStateKey(publish?.state ?? "draft"))}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.slug")}</p>
          <p className="mt-3 break-words text-sm font-semibold">{publish?.slug ?? (normalizedSlug || t("common.notSet"))}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.staged")}</p>
          <p className="mt-3 text-sm font-semibold">{publish?.stagedAt ? dateTime(publish.stagedAt) : "—"}</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.published")}</p>
          <p className="mt-3 text-sm font-semibold">{publish?.publishedAt ? dateTime(publish.publishedAt) : "—"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(260px,340px)_1fr]">
        <label className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.publicSlug")}</p>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="my-campaign-slug"
          />
        </label>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("publish.liveUrl")}</p>
          {livePath ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {publish?.state === "published" ? (
                <>
                  <Link href={livePath} target="_blank" className="text-sm font-semibold text-primary hover:underline">
                    {livePath}
                  </Link>
                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    {t("publish.public")}
                  </Badge>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-muted-foreground">{livePath}</span>
                  <Badge className="border-white/10 bg-white/[0.06] text-muted-foreground">
                    {t("publish.notLive")}
                  </Badge>
                </>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t("publish.addSlug")}
            </p>
          )}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("publish.snapshotBody")}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => void updatePublishState("draft")}
          disabled={loadingRecord || loadingState !== null}
        >
          {loadingState === "draft" ? t("publish.savingDraft") : t("publish.keepDraft")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void updatePublishState("staged")}
          disabled={loadingRecord || loadingState !== null || !normalizedSlug}
        >
          {loadingState === "staged" ? t("publish.staging") : t("publish.stageSnapshot")}
        </Button>
        <Button
          onClick={() => void updatePublishState("published")}
          disabled={loadingRecord || loadingState !== null || !normalizedSlug}
        >
          {loadingState === "published" ? t("publish.publishing") : t("publish.publishLive")}
        </Button>
      </div>

      {loadingRecord ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("publish.loading")}</p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      {publish?.state === "published" ? (
        <p className="mt-4 text-sm text-emerald-300">
          {t("publish.liveBody")}
        </p>
      ) : null}
    </Card>
  );
}
