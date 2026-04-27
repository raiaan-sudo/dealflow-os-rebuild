// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import type { BuiltCampaign } from "@/lib/services/campaign-orchestrator";
import type { FunnelSection } from "@/lib/services/funnel-engine";
import type { CreativeAsset } from "@/lib/types/creative-assets";
import {
  type AdvancedInspectorTab,
  type SectionAiAction,
  ADVANCED_SECTION_OPTIONS,
  buildAdvancedSectionTemplate,
  buildSectionFromBlueprint,
  createSectionId,
  getSectionCategory,
  getSectionGroupLabel,
  SECTION_VARIANT_OPTIONS,
  trimWords,
} from "@/components/campaign/builder/funnel-editor-shared";

type SetCampaign = React.Dispatch<React.SetStateAction<BuiltCampaign>>;

export function useAdvancedFunnelEditor({
  campaign,
  onMarkRevision,
  savedCampaignId,
  ensureSavedCampaign,
  setCampaign,
}: {
  campaign: BuiltCampaign;
  onMarkRevision: (source: "ai" | "manual", label: string) => void;
  savedCampaignId: string | null;
  ensureSavedCampaign: () => Promise<string>;
  setCampaign: SetCampaign;
}) {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [advancedInspectorTab, setAdvancedInspectorTab] =
    useState<AdvancedInspectorTab>("content");
  const [sectionHistory, setSectionHistory] = useState<FunnelSection[][]>([]);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverSectionIndex, setDragOverSectionIndex] = useState<number | null>(null);
  const [campaignAssets, setCampaignAssets] = useState<CreativeAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetActionLoading, setAssetActionLoading] = useState(false);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const [sectionAiLoading, setSectionAiLoading] = useState<SectionAiAction | null>(null);
  const [sectionAiError, setSectionAiError] = useState<string | null>(null);
  const videoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailUploadInputRef = useRef<HTMLInputElement | null>(null);

  const sections = useMemo(
    () => (Array.isArray(campaign.funnel.sections) ? campaign.funnel.sections : []),
    [campaign.funnel.sections],
  );
  const selectedSection = sections[selectedSectionIndex] ?? null;
  const visibleCount = sections.filter((section) => section.visible !== false).length;
  const mediaCount = sections.filter(
    (section) => section.type === "vsl" || section.type === "image",
  ).length;

  const groupedSections = useMemo(() => {
    const groups = ["Core Story", "Proof & Trust", "Media", "Conversion"] as const;
    return groups
      .map((group) => ({
        group,
        items: sections
          .map((section, index) => ({ section, index }))
          .filter(({ section }) => getSectionGroupLabel(section.type) === group),
      }))
      .filter((group) => group.items.length > 0);
  }, [sections]);

  const sectionVariantOptions = selectedSection
    ? SECTION_VARIANT_OPTIONS[selectedSection.type] ?? []
    : [];

  const mediaLibrary = useMemo(
    () =>
      campaignAssets.filter((asset) => {
        if (selectedSection?.type === "vsl") {
          return ["talking_head_video", "ugc_video", "montage_video"].includes(
            asset.asset_type,
          );
        }

        if (selectedSection?.type === "image") {
          return asset.asset_type === "image_frame";
        }

        return false;
      }),
    [campaignAssets, selectedSection?.type],
  );

  const thumbnailLibrary = useMemo(
    () => campaignAssets.filter((asset) => asset.asset_type === "thumbnail"),
    [campaignAssets],
  );

  useEffect(() => {
    if (selectedSectionIndex > sections.length - 1) {
      setSelectedSectionIndex(Math.max(0, sections.length - 1));
    }
  }, [sections.length, selectedSectionIndex]);

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    setAdvancedInspectorTab(getSectionCategory(selectedSection.type));
  }, [selectedSection]);

  async function loadCampaignAssets(campaignId: string) {
    setAssetsLoading(true);
    setAssetsError(null);

    try {
      const response = await fetchWithRetry(`/api/campaigns/${campaignId}/assets`, {
        method: "GET",
        retries: 0,
        timeoutMs: 10000,
      });
      const data = (await response.json()) as CreativeAsset[] | { error?: string };

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          !Array.isArray(data) && "error" in data && data.error
            ? data.error
            : "Unable to load media assets.",
        );
      }

      setCampaignAssets(data);
    } catch (error) {
      setAssetsError(
        error instanceof Error ? error.message : "Unable to load media assets.",
      );
    } finally {
      setAssetsLoading(false);
    }
  }

  useEffect(() => {
    if (!savedCampaignId) {
      setCampaignAssets([]);
      return;
    }

    void loadCampaignAssets(savedCampaignId);
  }, [savedCampaignId]);

  function updateSelectedSection(updater: (section: FunnelSection) => FunnelSection) {
    setSectionHistory((current) => [...current.slice(-19), sections]);
    setCampaign((current) => ({
      ...current,
      funnel: {
        ...current.funnel,
        sections: (current.funnel.sections || []).map((section, index) =>
          index === selectedSectionIndex ? updater(section as FunnelSection) : section,
        ),
      },
    }));
  }

  function reorderSection(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= sections.length) {
      return;
    }

    setSectionHistory((current) => [...current.slice(-19), sections]);
    setCampaign((current) => {
      const items = [...(current.funnel.sections || [])];
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      setSelectedSectionIndex(toIndex);

      return {
        ...current,
        funnel: {
          ...current.funnel,
          sections: items,
        },
      };
    });
  }

  function handleSectionDragStart(index: number) {
    setDraggedSectionIndex(index);
    setDragOverSectionIndex(index);
  }

  function handleSectionDrop(index: number) {
    if (draggedSectionIndex === null) {
      return;
    }

    reorderSection(draggedSectionIndex, index);
    setDraggedSectionIndex(null);
    setDragOverSectionIndex(null);
  }

  function handleSectionDragEnd() {
    setDraggedSectionIndex(null);
    setDragOverSectionIndex(null);
  }

  function addSection(option: (typeof ADVANCED_SECTION_OPTIONS)[number]) {
    const nextSection = buildAdvancedSectionTemplate(option);
    setSectionHistory((current) => [...current.slice(-19), sections]);
    setCampaign((current) => ({
      ...current,
      funnel: {
        ...current.funnel,
        sections: [...(current.funnel.sections || []), nextSection],
      },
    }));
    setSelectedSectionIndex(sections.length);
  }

  function removeSelectedSection() {
    setSectionHistory((current) => [...current.slice(-19), sections]);
    setCampaign((current) => ({
      ...current,
      funnel: {
        ...current.funnel,
        sections: (current.funnel.sections || []).filter(
          (_, index) => index !== selectedSectionIndex,
        ),
      },
    }));
    setSelectedSectionIndex((current) => Math.max(0, current - 1));
  }

  function duplicateSelectedSection() {
    if (!selectedSection) {
      return;
    }

    const duplicate = buildSectionFromBlueprint(selectedSection.type, {
      ...selectedSection,
      id: createSectionId(selectedSection.type),
      title: `${selectedSection.title} Copy`,
      content: [...selectedSection.content],
      style: { ...selectedSection.style },
      media: selectedSection.media ? { ...selectedSection.media } : null,
    });

    setSectionHistory((current) => [...current.slice(-19), sections]);
    setCampaign((current) => {
      const nextSections = [...(current.funnel.sections || [])];
      nextSections.splice(selectedSectionIndex + 1, 0, duplicate);

      return {
        ...current,
        funnel: {
          ...current.funnel,
          sections: nextSections,
        },
      };
    });
    setSelectedSectionIndex(selectedSectionIndex + 1);
  }

  function resetSelectedSection() {
    if (!selectedSection) {
      return;
    }

    updateSelectedSection((section) =>
      buildSectionFromBlueprint(section.type, {
        id: section.id,
        visible: section.visible,
      }),
    );
  }

  function undoSectionChange() {
    setSectionHistory((current) => {
      const previous = current[current.length - 1];

      if (!previous) {
        return current;
      }

      setCampaign((campaignState) => ({
        ...campaignState,
        funnel: {
          ...campaignState.funnel,
          sections: previous,
        },
      }));

      if (selectedSectionIndex > Math.max(0, previous.length - 1)) {
        setSelectedSectionIndex(Math.max(0, previous.length - 1));
      }

      return current.slice(0, -1);
    });
  }

  function applySectionPreset(mode: "shorter" | "stronger" | "luxury") {
    if (!selectedSection) {
      return;
    }

    updateSelectedSection((section) => {
      if (mode === "shorter") {
        return {
          ...section,
          content: section.content.map((line) => trimWords(line, 10)),
        };
      }

      if (mode === "stronger") {
        return {
          ...section,
          title:
            section.type === "closing_cta" || section.type === "form"
              ? section.title || campaign.funnel.cta || "Take the next step"
              : section.title,
          content: section.content.map((line) =>
            line.includes("now") ? line : `${line.replace(/[.!?]+$/, "")} now.`,
          ),
        };
      }

      return {
        ...section,
        variant: section.variant === "luxury" ? section.variant : "luxury",
        style: {
          ...section.style,
          spacing:
            section.style?.spacing === "spacious" ? "spacious" : "comfortable",
          theme: section.style?.theme === "dark" ? "dark" : "accent",
        },
        content: section.content.map((line) =>
          line.includes("premium") || line.includes("elevated")
            ? line
            : `Premium ${line.charAt(0).toLowerCase()}${line.slice(1)}`,
        ),
      };
    });
  }

  async function handleSectionAiAction(action: SectionAiAction) {
    if (!selectedSection) {
      return;
    }

    setSectionAiLoading(action);
    setSectionAiError(null);

    try {
      const response = await fetchWithRetry("/api/builder/section-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          section: selectedSection,
          campaignContext: {
            location: campaign.strategy.location,
            audience: campaign.strategy.audience,
            offer: campaign.strategy.offer,
            marketType: campaign.strategy.market_type,
            funnelHeadline: campaign.funnel.headline,
            funnelCta: campaign.funnel.cta,
          },
        }),
        retries: 0,
        timeoutMs: 20000,
      });

      const payload = (await response.json()) as {
        title?: string;
        content?: string[];
        variant?: string;
        label?: string;
        caption?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Section AI edit failed.");
      }

      onMarkRevision(
        "ai",
        action === "rewrite"
          ? "AI rewrote section"
          : action === "shorter"
            ? "AI shortened section"
            : action === "stronger_cta"
              ? "AI strengthened CTA"
              : action === "more_luxury"
                ? "AI made section more luxury"
                : "AI made section more direct-response",
      );

      updateSelectedSection((section) => ({
        ...section,
        title: payload.title?.trim() || section.title,
        content:
          Array.isArray(payload.content) && payload.content.length > 0
            ? payload.content.map((line) => (line ?? "").toString().trim()).filter(Boolean)
            : section.content,
        variant: payload.variant?.trim() || section.variant,
        media: section.media
          ? {
              ...section.media,
              label: payload.label?.trim() || section.media.label,
              caption: payload.caption?.trim() || section.media.caption,
            }
          : section.media,
      }));
    } catch (error) {
      if (action === "shorter") {
        onMarkRevision("ai", "AI shortened section");
        applySectionPreset("shorter");
      } else if (action === "stronger_cta") {
        onMarkRevision("ai", "AI strengthened CTA");
        applySectionPreset("stronger");
      } else if (action === "more_luxury") {
        onMarkRevision("ai", "AI made section more luxury");
        applySectionPreset("luxury");
      }

      setSectionAiError(
        error instanceof Error ? error.message : "Section AI edit failed.",
      );
    } finally {
      setSectionAiLoading(null);
    }
  }

  async function ensureCampaignIdForAssets() {
    setAssetActionError(null);

    if (savedCampaignId) {
      return savedCampaignId;
    }

    try {
      return await ensureSavedCampaign();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Save the campaign before managing media.";
      setAssetActionError(message);
      throw error;
    }
  }

  function bindAssetToSelectedSection(
    asset: CreativeAsset,
    role: "primary" | "thumbnail" = "primary",
  ) {
    if (
      !selectedSection ||
      (selectedSection.type !== "vsl" && selectedSection.type !== "image")
    ) {
      return;
    }

    updateSelectedSection((section) => {
      const existingMedia = section.media ?? {
        kind: section.type === "vsl" ? ("video" as const) : ("image" as const),
      };

      if (role === "thumbnail") {
        return {
          ...section,
          media: {
            ...existingMedia,
            thumbnailAssetId: asset.id,
            thumbnailUrl: asset.file_url || asset.thumbnail_url || undefined,
          },
        };
      }

      return {
        ...section,
        media: {
          ...existingMedia,
          assetId: asset.id,
          url: asset.file_url || asset.thumbnail_url || undefined,
          label:
            typeof asset.metadata === "object" &&
            asset.metadata &&
            "label" in asset.metadata &&
            typeof asset.metadata.label === "string"
              ? asset.metadata.label
              : existingMedia.label,
          caption:
            typeof asset.metadata === "object" &&
            asset.metadata &&
            "caption" in asset.metadata &&
            typeof asset.metadata.caption === "string"
              ? asset.metadata.caption
              : existingMedia.caption,
          thumbnailUrl:
            section.type === "vsl"
              ? asset.thumbnail_url || existingMedia.thumbnailUrl
              : asset.file_url || asset.thumbnail_url || existingMedia.thumbnailUrl,
          thumbnailAssetId:
            section.type === "vsl" ? existingMedia.thumbnailAssetId : asset.id,
        },
      };
    });
  }

  function clearSelectedSectionMedia(role: "primary" | "thumbnail" = "primary") {
    if (
      !selectedSection ||
      !selectedSection.media ||
      (selectedSection.type !== "vsl" && selectedSection.type !== "image")
    ) {
      return;
    }

    updateSelectedSection((section) => {
      const media = section.media;
      if (!media) {
        return section;
      }

      if (role === "thumbnail") {
        return {
          ...section,
          media: {
            ...media,
            thumbnailAssetId: undefined,
            thumbnailUrl: undefined,
          },
        };
      }

      return {
        ...section,
        media: {
          ...media,
          assetId: undefined,
          url: undefined,
          label: undefined,
          ...(section.type === "image"
            ? { thumbnailAssetId: undefined, thumbnailUrl: undefined }
            : {}),
        },
      };
    });
  }

  async function handleAssetUpload(file: File, kind: "video" | "image" | "thumbnail") {
    const campaignId = await ensureCampaignIdForAssets();
    setAssetActionLoading(true);
    setAssetActionError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      formData.append("label", file.name);

      const response = await fetchWithRetry(`/api/campaigns/${campaignId}/assets`, {
        method: "POST",
        body: formData,
        retries: 0,
        timeoutMs: 45000,
      });
      const payload = (await response.json()) as {
        asset?: CreativeAsset;
        error?: string;
      };

      if (!response.ok || !payload.asset) {
        throw new Error(payload.error || "Media upload failed.");
      }

      await loadCampaignAssets(campaignId);
      bindAssetToSelectedSection(
        payload.asset,
        kind === "thumbnail" ? "thumbnail" : "primary",
      );
    } catch (error) {
      setAssetActionError(
        error instanceof Error ? error.message : "Media upload failed.",
      );
    } finally {
      setAssetActionLoading(false);
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setAssetActionLoading(true);
    setAssetActionError(null);

    try {
      const response = await fetchWithRetry(`/api/assets/${assetId}`, {
        method: "DELETE",
        retries: 0,
        timeoutMs: 15000,
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Media delete failed.");
      }

      if (selectedSection?.media?.assetId === assetId) {
        clearSelectedSectionMedia("primary");
      }
      if (selectedSection?.media?.thumbnailAssetId === assetId) {
        clearSelectedSectionMedia("thumbnail");
      }

      if (savedCampaignId) {
        await loadCampaignAssets(savedCampaignId);
      }
    } catch (error) {
      setAssetActionError(
        error instanceof Error ? error.message : "Media delete failed.",
      );
    } finally {
      setAssetActionLoading(false);
    }
  }

  return {
    selectedSectionIndex,
    setSelectedSectionIndex,
    advancedInspectorTab,
    setAdvancedInspectorTab,
    sectionHistory,
    draggedSectionIndex,
    dragOverSectionIndex,
    setDragOverSectionIndex,
    campaignAssets,
    assetsLoading,
    assetsError,
    assetActionLoading,
    assetActionError,
    sectionAiLoading,
    sectionAiError,
    videoUploadInputRef,
    imageUploadInputRef,
    thumbnailUploadInputRef,
    sections,
    selectedSection,
    visibleCount,
    mediaCount,
    groupedSections,
    sectionVariantOptions,
    mediaLibrary,
    thumbnailLibrary,
    updateSelectedSection,
    reorderSection,
    handleSectionDragStart,
    handleSectionDrop,
    handleSectionDragEnd,
    addSection,
    removeSelectedSection,
    duplicateSelectedSection,
    resetSelectedSection,
    undoSectionChange,
    handleSectionAiAction,
    handleAssetUpload,
    handleDeleteAsset,
    bindAssetToSelectedSection,
    clearSelectedSectionMedia,
  };
}
