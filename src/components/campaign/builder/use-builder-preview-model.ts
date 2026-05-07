"use client";

import { useMemo } from "react";
import type { BuiltCampaign } from "@/lib/services/campaign-orchestrator";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { CreativeScoreBreakdown } from "@/lib/services/creative-scoring-service";

type UseBuilderPreviewModelOptions = {
  savedStaticAds?: StaticCreativeAsset[] | null;
  generatedVideos?: Record<
    number,
    {
      status?: "idle" | "starting" | "processing" | "completed" | "failed";
      video?: {
        url: string;
        hook: string;
        script: string[];
        scenes: Array<string | { type: "hook" | "body" | "cta"; text: string }>;
      };
    }
  >;
};

export function useBuilderPreviewModel(
  campaign: BuiltCampaign,
  recommendedOffer: string,
  options?: UseBuilderPreviewModelOptions,
) {
  const savedStaticAds = useMemo(
    () => options?.savedStaticAds ?? [],
    [options?.savedStaticAds],
  );
  const generatedVideos = options?.generatedVideos ?? {};

  const staticAdRows = useMemo(() => {
    const creativeRows = (campaign.creatives || [])
      .filter(Boolean)
      .slice(0, 3)
      .map((creative, index) => {
        const matchingItem =
          (campaign.items || []).find(
            (item) => item.kind === "static" && item.hook === creative.hook,
          ) ??
          (campaign.items || []).filter((item) => item.kind === "static")[index] ??
          null;

        return {
          creative: {
            ...creative,
            assetRefs: matchingItem?.assetRefs ?? null,
          },
          copy: campaign.copy[index],
          index,
        };
      });

    if (creativeRows.length > 0) {
      return creativeRows;
    }

    return [...((campaign.items || []).filter(Boolean).filter((item) => item.kind === "static"))]
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((item, index) => ({
        creative: {
          hook: item.hook,
          angle: item.angle,
          format: item.format,
          concept: item.concept,
          visual_direction: item.visualDirection,
          assetRefs: item.assetRefs ?? null,
        },
        copy: {
          hook: item.hook,
          primary_text: item.primaryText,
          script: item.scriptLines.join("\n"),
          headline: item.headline,
          cta: item.cta,
        },
        index,
      }));
  }, [campaign]);

  const videoRows = useMemo(() => {
    const creativeRows = (campaign.creatives || [])
      .filter(Boolean)
      .filter((creative) => creative.format !== "montage")
      .slice(0, 2)
      .map((creative, index) => {
        const matchingItem =
          (campaign.items || []).find(
            (item) => item.kind === "video" && item.hook === creative.hook,
          ) ??
          (campaign.items || []).filter((item) => item.kind === "video")[index] ??
          null;

        return {
          index,
          creative: {
            ...creative,
            assetRefs: matchingItem?.assetRefs ?? null,
          },
          copy: campaign.copy[index],
        };
      });

    if (creativeRows.length > 0) {
      return creativeRows;
    }

    const itemRows = ((campaign.items || []).filter(Boolean).filter((item) => item.kind === "video")).slice(0, 2);
    if (itemRows.length > 0) {
      return itemRows.map((item, index) => ({
        index,
        creative: {
          hook: item.hook,
          angle: item.angle,
          format: item.format,
          concept: item.concept,
          visual_direction: item.visualDirection,
          assetRefs: item.assetRefs ?? null,
        },
        copy: {
          hook: item.hook,
          primary_text: item.primaryText,
          script: item.scriptLines.join("\n"),
          headline: item.headline,
          cta: item.cta,
        },
      }));
    }

    return [];
  }, [campaign]);

  const previewOffer = recommendedOffer || campaign.strategy.offer;
  const previewMarket = campaign.strategy.location || "your market";
  const previewAudience = campaign.strategy.audience || "qualified prospects";
  const previewHeadline =
    campaign.funnel.headline ||
    (previewOffer ? `${previewOffer} in ${previewMarket}` : `${previewMarket} campaign preview`);
  const previewSubheadline =
    campaign.funnel.subheadline ||
    (previewOffer
      ? `${previewOffer} for ${previewAudience} without guessing what to do next.`
      : `A focused campaign preview for ${previewMarket}.`);
  const previewCta = campaign.funnel.cta || (previewOffer ? "Review the offer" : "Request details");

  const previewAds = useMemo(() => {
    const rankedSavedAds = [...savedStaticAds]
      .filter(Boolean)
      .sort((left, right) => {
        if (left.recommended !== right.recommended) {
          return left.recommended ? -1 : 1;
        }

        return (right.score ?? 0) - (left.score ?? 0);
      })
      .slice(0, 3);

    if (rankedSavedAds.length > 0 && staticAdRows.length > 0) {
      return staticAdRows.map(({ creative, copy, index }) => {
        const savedAd = rankedSavedAds[index] ?? null;

        return {
          id: savedAd?.id || `${creative?.format || "creative"}-${creative?.angle || "angle"}-${index}`,
          overlayText: creative?.hook || "",
          primaryText: copy?.primary_text || "",
          headline: copy?.headline || "",
          cta: copy?.cta || "Book My Strategy Call",
          imageUrl: savedAd?.imageUrl || creative?.assetRefs?.imageUrl || null,
          recommended: index === 0 ? true : Boolean(savedAd?.recommended),
          score: savedAd?.score ?? 0,
          scoreBreakdown: savedAd?.scoreBreakdown ?? null,
          imageGenerationState: savedAd?.imageGenerationState ?? ("unavailable" as const),
          imageGenerationMessage: savedAd?.imageGenerationMessage ?? null,
        };
      });
    }

    if (rankedSavedAds.length > 0) {
      return rankedSavedAds.map((ad, index) => ({
        id: ad.id || `saved-static-${index}`,
        overlayText: ad.overlayText || ad.hook || "",
        primaryText: ad.primaryText || "",
        headline: ad.headline || "",
        cta: ad.cta || "Book My Strategy Call",
        imageUrl: ad.imageUrl || null,
        recommended: index === 0 ? true : Boolean(ad.recommended),
        score: ad.score ?? 0,
        scoreBreakdown: ad.scoreBreakdown,
        imageGenerationState: ad.imageGenerationState,
        imageGenerationMessage: ad.imageGenerationMessage,
      }));
    }

    if (staticAdRows.length > 0) {
      return staticAdRows.map(({ creative, copy, index }) => ({
        id: `${creative?.format || "creative"}-${creative?.angle || "angle"}-${index}`,
        overlayText: creative?.hook || "",
        primaryText: copy?.primary_text || "",
        headline: copy?.headline || "",
        cta: copy?.cta || "Book My Strategy Call",
        imageUrl: creative?.assetRefs?.imageUrl || null,
        recommended: index === 0,
        score: 0,
        scoreBreakdown: null as CreativeScoreBreakdown | null,
        imageGenerationState: "unavailable" as const,
        imageGenerationMessage: null,
      }));
    }

    return [];
  }, [savedStaticAds, staticAdRows]);

  const previewVideos = videoRows.length
    ? videoRows.map(({ creative, copy, index }) => ({
        id: `${creative?.format || "video"}-${creative?.angle || "angle"}-${index}`,
        title: `Video ${index + 1}`,
        hook: generatedVideos[index]?.video?.hook || creative?.hook || copy?.hook || "",
        script: generatedVideos[index]?.video?.script.join("\n") || copy?.script || "",
        scenes:
          generatedVideos[index]?.video?.scenes?.map((scene) =>
            typeof scene === "string" ? scene : scene.text,
          ) || [
            "Open with the core hook.",
            "Explain why this works now.",
            "Close with a direct CTA.",
          ],
        videoUrl: generatedVideos[index]?.video?.url || creative?.assetRefs?.videoUrl || undefined,
      }))
    : [];

  const previewAssets = previewAds.slice(0, 3).map((ad, index) => ({
    title: `Asset ${index + 1}`,
    subtitle: ad.headline || ad.overlayText || "Preview asset",
    status:
      ad.imageGenerationState === "generated"
        ? ("ready" as const)
        : ad.imageGenerationState === "generating"
          ? ("draft" as const)
          : ("draft" as const),
  }));

  return {
    staticAdRows,
    videoRows,
    previewHeadline,
    previewSubheadline,
    previewCta,
    previewAds,
    previewVideos,
    previewAssets,
  };
}
