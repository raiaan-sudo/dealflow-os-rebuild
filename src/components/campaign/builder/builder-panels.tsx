// @ts-nocheck
"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CreativeOpsQaCard } from "@/components/campaign/creative-ops-qa-card";
import { generateCreativeCopyAssistant, improveCopyText, type CreativeCopyAssistantOutput } from "@/lib/services/copy-engine";
import type { BuiltCampaign, CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { assessCreativeOpsQuality } from "@/lib/services/creative-ops-qa-service";
import type { CreativeScoreBreakdown } from "@/lib/services/creative-scoring-service";
import type { PreviewPaneTab, GeneratedVideoState, BuilderEditingMode, BuilderPreviewDirection, BuilderThemePreset } from "@/components/campaign/builder/types";
import { GuidedStepFooter } from "@/components/campaign/builder/builder-navigation";
import type { FunnelSection, FunnelSectionStyle, FunnelSectionType } from "@/lib/services/funnel-engine";
import {
  ADVANCED_SECTION_OPTIONS,
  AutoTextarea,
  FieldLabel,
  InspectorTabButton,
  buildSectionLabel,
  getSectionGroupLabel,
  getVariantLabel,
  getPreviewDirection,
  sentenceCase,
  THEME_PRESET_LIBRARY,
  trimWords,
} from "@/components/campaign/builder/funnel-editor-shared";
import { useAdvancedFunnelEditor } from "@/components/campaign/builder/use-advanced-funnel-editor";

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function EditorDisclosure({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/62">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {badge}
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58 transition group-open:bg-primary/[0.08] group-open:text-primary">
            <span className="group-open:hidden">Open</span>
            <span className="hidden group-open:inline">Close</span>
          </span>
        </div>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function getInspectorPanelMeta(tab: "content" | "layout" | "media" | "ai") {
  if (tab === "layout") {
    return {
      title: "Layout",
      description: "Adjust visibility, spacing, width, and alignment for this selected block.",
    };
  }

  if (tab === "media") {
    return {
      title: "Media",
      description: "Attach or replace real campaign assets for this block only.",
    };
  }

  if (tab === "ai") {
    return {
      title: "AI tools",
      description: "Rewrite only the selected section without changing the rest of the funnel.",
    };
  }

  return {
    title: "Content",
    description: "Edit the wording, title, and variant of the selected section.",
  };
}

function getTypographyClasses(direction: BuilderPreviewDirection) {
  const displayClass =
    direction.typography.display === "cinematic"
      ? "tracking-[-0.08em]"
      : direction.typography.display === "editorial"
        ? "tracking-[-0.07em]"
        : direction.typography.display === "refined"
          ? "tracking-[-0.055em]"
          : direction.typography.display === "sharp"
            ? "tracking-[-0.045em] uppercase"
            : "tracking-[-0.05em]";

  const bodyClass =
    direction.typography.body === "dense"
      ? "leading-6"
      : direction.typography.body === "airy"
        ? "leading-8"
        : "leading-7";

  const labelClass =
    direction.typography.label === "minimal"
      ? "tracking-[0.12em]"
      : direction.typography.label === "premium"
        ? "tracking-[0.22em]"
        : "tracking-[0.18em]";

  return { displayClass, bodyClass, labelClass };
}

function getThemeSpacingPadding(direction: BuilderPreviewDirection, scope: "hero" | "section") {
  const spacing = direction.spacing[scope];

  if (scope === "hero") {
    return spacing === "compact"
      ? "px-6 py-8 sm:px-8 lg:py-10"
      : spacing === "spacious"
        ? "px-6 py-12 sm:px-8 lg:py-16"
        : "px-6 py-10 sm:px-8 lg:py-14";
  }

  return spacing === "compact"
    ? "px-5 py-5"
    : spacing === "spacious"
      ? "px-8 py-9"
      : "px-6 py-7";
}

const FunnelLivePreview = memo(function FunnelLivePreview({
  headline,
  subheadline,
  cta,
  location,
  sections,
  formFields,
  direction,
}: {
  headline: string;
  subheadline: string;
  cta: string;
  location: string;
  sections: FunnelSection[];
  formFields: string[];
  direction?: BuilderPreviewDirection | null;
}) {
  const theme = useMemo(() => getPreviewDirection(direction), [direction]);
  const typography = useMemo(() => getTypographyClasses(theme), [theme]);
  const visibleSections = useMemo(
    () => (sections || []).filter((section) => section?.visible !== false && section?.type !== "hero"),
    [sections],
  );

  function getSectionShellStyle(style?: Partial<FunnelSectionStyle>) {
    const spacing =
      style?.spacing === "compact"
        ? "px-5 py-5"
        : style?.spacing === "spacious"
          ? "px-8 py-9"
          : getThemeSpacingPadding(theme, "section");
    const width =
      style?.width === "narrow" ? "max-w-2xl mx-auto" : style?.width === "content" ? "max-w-4xl mx-auto" : "";
    const align = style?.align === "center" ? "text-center" : "text-left";
    const themeClass =
      style?.theme === "dark"
        ? "border-white/8 bg-[#09111b] text-white"
        : style?.theme === "accent"
          ? "border-[#7ac8ff]/15 bg-[#d9f0ff] text-[#07121d]"
          : "border-black/8 bg-white text-[#111827]";

    return `${spacing} ${width} ${align} ${themeClass}`;
  }

  function renderSection(section: FunnelSection, index: number) {
    const shellClass = `overflow-hidden rounded-[26px] border ${getSectionShellStyle(section.style)}`;

    if (section.type === "trust_bar") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={shellClass}>
          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
            {section.content.map((item) => (
              <div key={item} className="rounded-[16px] border border-current/10 bg-black/10 px-4 py-3 text-sm opacity-85">
                {item}
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (section.type === "proof_metrics" || section.type === "market_snapshot") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={shellClass}>
          <p className={`text-[11px] font-semibold uppercase opacity-60 ${typography.labelClass}`}>{section.type.replaceAll("_", " ")}</p>
          <h3 className={`mt-3 text-2xl font-semibold ${typography.displayClass}`}>{section.title}</h3>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {section.content.map((item) => (
              <div key={item} className="rounded-[20px] border border-current/10 bg-white/70 px-5 py-5 text-sm font-medium text-inherit shadow-[0_18px_48px_-38px_rgba(0,0,0,0.24)]">
                {item}
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (section.type === "vsl") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={shellClass}>
          <p className={`text-[11px] font-semibold uppercase opacity-60 ${typography.labelClass}`}>video block</p>
          <h3 className={`mt-3 text-2xl font-semibold ${typography.displayClass}`}>{section.title}</h3>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-black/50">
            {section.media?.url ? (
              <video
                src={section.media.url}
                controls
                poster={section.media.thumbnailUrl ?? undefined}
                className="aspect-video w-full bg-black object-cover"
              />
            ) : section.media?.thumbnailUrl ? (
              <div className="relative aspect-video w-full">
                <Image
                  src={section.media.thumbnailUrl}
                  alt={section.media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_28%),linear-gradient(135deg,#112338,#05080d)]" />
            )}
            <div className="px-5 py-4 text-sm text-white/72">
              {section.media?.caption || section.content[0] || "Add a VSL, Loom, or hosted video here."}
            </div>
          </div>
        </section>
      );
    }

    if (section.type === "image") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={shellClass}>
          <p className={`text-[11px] font-semibold uppercase opacity-60 ${typography.labelClass}`}>image block</p>
          <h3 className={`mt-3 text-2xl font-semibold ${typography.displayClass}`}>{section.title}</h3>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-current/10 bg-white/70">
            {section.media?.url ? (
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={section.media.url}
                  alt={section.media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : section.media?.thumbnailUrl ? (
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={section.media.thumbnailUrl}
                  alt={section.media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="aspect-[16/9] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_30%),linear-gradient(135deg,#77c7ff,#0c1829)]" />
            )}
            <div className="px-5 py-4 text-sm opacity-75">
              {section.media?.caption || section.content[0] || "Add listing photos, brand visuals, or proof imagery here."}
            </div>
          </div>
        </section>
      );
    }

    if (section.type === "form" || section.type === "closing_cta") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={shellClass}>
          <p className={`text-[11px] font-semibold uppercase opacity-60 ${typography.labelClass}`}>
            {section.type === "form" ? "conversion step" : "final CTA"}
          </p>
          <h3 className={`mt-3 text-2xl font-semibold ${typography.displayClass}`}>{section.title}</h3>
          <div className="mt-4 space-y-3">
            {section.content.map((item) => (
              <p key={item} className={`text-sm opacity-75 ${typography.bodyClass}`}>{item}</p>
            ))}
          </div>
          {section.type === "form" ? (
            <div className="mt-6 grid gap-3 xl:grid-cols-3">
              {formFields.map((field) => (
                <div key={field} className="rounded-[16px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm opacity-70">
                  {field}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold" style={{ backgroundColor: theme.palette.accent, color: theme.palette.ctaText }}>
            {cta || "Book My Strategy Call"}
          </div>
        </section>
      );
    }

    return (
      <section key={section.id || `${section.type}-${index}`} className={shellClass}>
        <p className={`text-[11px] font-semibold uppercase opacity-60 ${typography.labelClass}`}>
          {section.type.replaceAll("_", " ")}
        </p>
        <h3 className={`mt-3 text-2xl font-semibold ${typography.displayClass}`}>{section.title}</h3>
        <div className="mt-5 space-y-3">
          {section.content.map((item) => (
            <div key={item} className="flex gap-3">
              <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: theme.palette.accent }} />
              <p className={`text-sm opacity-75 ${typography.bodyClass}`}>{item}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-[28px] border border-white/8 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.68)]"
      style={{ backgroundColor: theme.palette.panel }}
    >
      <div className="border-b border-black/6 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
          <div className="h-3 w-3 rounded-full bg-[#ffd166]" />
          <div className="h-3 w-3 rounded-full bg-[#06d6a0]" />
        </div>
      </div>
      <div className="grid gap-0">
        <div
          className={`border-b border-black/6 lg:border-b-0 lg:border-r ${getThemeSpacingPadding(theme, "hero")}`}
          style={{
            color: theme.palette.text,
            background: `radial-gradient(circle at top, ${theme.palette.accent}33, transparent 30%), linear-gradient(180deg, ${theme.palette.background}, ${theme.palette.surface})`,
          }}
        >
          <div
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              border: `1px solid ${theme.palette.accent}55`,
              backgroundColor: `${theme.palette.accent}1f`,
              color: theme.palette.accent,
            }}
          >
            {(location || "your market").trim()} campaign
          </div>
          <h2 className={`mt-5 max-w-xl text-4xl font-semibold sm:text-5xl ${typography.displayClass}`}>
            {headline || "Campaign headline unavailable"}
          </h2>
          <p className={`mt-4 max-w-[680px] text-base ${typography.bodyClass}`} style={{ color: theme.palette.mutedText }}>
            {subheadline || "Campaign subheadline unavailable"}
          </p>
          <div
            className="mt-7 inline-flex rounded-full px-6 py-3 text-sm font-semibold"
            style={{ backgroundColor: theme.palette.accent, color: theme.palette.ctaText }}
          >
            {cta || "Campaign CTA unavailable"}
          </div>
        </div>

        <div className="px-6 py-8 text-[#111111] sm:px-8 sm:py-10" style={{ backgroundColor: theme.palette.panel }}>
          <div className="rounded-[24px] bg-white p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.25)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a8276]">
              Lead form
            </p>
            <div className="mt-5 space-y-3">
              {formFields.map((field) => (
                <div
                  key={field}
                  className="rounded-[16px] border border-black/8 bg-[#f8f7f4] px-4 py-3 text-sm text-[#6e675e]"
                >
                  {field}
                </div>
              ))}
            </div>
            <div
              className="mt-5 rounded-full px-4 py-3 text-center text-sm font-semibold"
              style={{ backgroundColor: theme.palette.accent, color: theme.palette.ctaText }}
            >
              {cta || "Campaign CTA unavailable"}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-5 px-6 py-8 sm:px-8 sm:py-10">
        {visibleSections.map(renderSection)}
      </div>
    </div>
  );
});

const StaticAdPreview = memo(function StaticAdPreview({
  businessName,
  overlayText,
  primaryText,
  headline,
  cta,
  imageUrl,
  direction,
  compact = false,
}: {
  businessName: string;
  overlayText: string;
  primaryText: string;
  headline: string;
  cta: string;
  imageUrl?: string | null;
  direction?: BuilderPreviewDirection | null;
  compact?: boolean;
}) {
  const brand = businessName || "DealFlow OS";
  const theme = useMemo(() => getPreviewDirection(direction), [direction]);
  const typography = useMemo(() => getTypographyClasses(theme), [theme]);

  return (
    <div
      className="overflow-hidden rounded-[24px] border border-white/8 text-[#111111] shadow-[0_24px_80px_-44px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: theme.palette.panel }}
    >
      <div className={`flex items-center justify-between gap-3 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e7eefc] text-sm font-semibold text-[#315b96]">
            {brand.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{brand}</p>
            <p className="truncate text-xs text-[#6b7280]">Sponsored</p>
          </div>
        </div>
      </div>
      <div className="border-y border-black/6">
        <div className={`${compact ? "aspect-[16/11]" : "aspect-[16/9]"} relative overflow-hidden`}>
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={headline || overlayText || businessName}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div
              className={`h-full w-full ${compact ? "p-3" : "p-4"}`}
              style={{
                background: `linear-gradient(180deg, rgba(15,23,42,0.18), rgba(2,6,23,0.92)), radial-gradient(circle at top, rgba(255,255,255,0.18), transparent 28%), linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.surface})`,
              }}
            />
          )}
          <div className={`absolute inset-0 ${compact ? "p-3" : "p-4"}`}>
            <div className="flex h-full flex-col justify-start">
              <div className="max-w-[72%] rounded-[14px] bg-black/40 px-3 py-2 shadow-sm backdrop-blur-sm">
                <p className={`${compact ? "text-xs" : "text-sm"} font-semibold leading-5 text-white`}>
                  <span className={typography.displayClass}>
                    {trimWords(overlayText || "Get Deals Before Others", 7)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`space-y-3 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
        <p className={`line-clamp-2 max-w-[680px] ${compact ? "text-xs" : "text-sm"} text-[#374151] ${typography.bodyClass}`}>
          {trimWords(primaryText || overlayText || businessName, compact ? 14 : 18)}
        </p>
        <div className={`flex items-center justify-between gap-3 rounded-[18px] border border-black/6 bg-white ${compact ? "px-3 py-2.5" : "px-4 py-3"} shadow-[0_10px_24px_-18px_rgba(0,0,0,0.22)]`}>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">
              Sponsored
            </p>
            <p className={`line-clamp-2 ${compact ? "text-xs leading-5" : "text-sm leading-5"} font-semibold`}>
              {headline || overlayText || businessName}
            </p>
          </div>
          <div
            className={`shrink-0 rounded-md ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} font-semibold`}
            style={{ backgroundColor: theme.palette.accent, color: theme.palette.ctaText }}
          >
            {cta || "Book My Strategy Call"}
          </div>
        </div>
      </div>
    </div>
  );
});

const VideoStoryboardPreview = memo(function VideoStoryboardPreview({
  title,
  hook,
  script,
  scenes,
  videoUrl,
}: {
  title: string;
  hook: string;
  script: string;
  scenes: string[];
  videoUrl?: string;
}) {
  const scriptLines = useMemo(
    () =>
      (script || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3),
    [script],
  );

  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary/80">Storyboard</p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">Video</Badge>
      </div>
      {videoUrl ? (
        <div className="mt-4 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Video preview</p>
          <div className="mt-3 overflow-hidden rounded-[18px] border border-white/8 bg-black/30">
            <video src={videoUrl} controls className="aspect-[9/16] w-full bg-black object-cover" />
          </div>
        </div>
      ) : null}
      <div className="mt-4 grid gap-4">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Hook</p>
          <p className="mt-2 text-sm leading-6">{hook || "See the strongest opportunity in your market."}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Script</p>
            <div className="mt-3 space-y-3">
              {scriptLines.map((line, lineIndex) => (
                <div key={`${line}-${lineIndex}`} className="rounded-[14px] bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                    Line {lineIndex + 1}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{line}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Scenes</p>
            <div className="mt-3 space-y-3">
              {scenes.slice(0, 3).map((scene, sceneIndex) => (
                <div key={`${scene}-${sceneIndex}`} className="rounded-[14px] bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                    Scene {sceneIndex + 1}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{scene}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const AssetPreviewGrid = memo(function AssetPreviewGrid({
  items,
}: {
  items: Array<{ title: string; subtitle: string; status: "ready" | "draft" }>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={`${item.title}-${item.subtitle}`}
          className="overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.03]"
        >
          <div className="aspect-[4/3] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,#1d4ed8,#0f172a)]" />
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{item.title}</p>
              <Badge
                className={
                  item.status === "ready"
                    ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.05] text-muted-foreground"
                }
              >
                {item.status}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  );
});

function CopyAssistantPanel({
  copyAssistant,
  onGenerate,
  copyAssistantLoading,
  copyAssistantError,
  onApply,
  recommendedOffer,
  offerVariations,
  onSelectOfferVariation,
  onApplyAlternative,
}: {
  copyAssistant: CreativeCopyAssistantOutput | null;
  onGenerate: () => void;
  copyAssistantLoading?: boolean;
  copyAssistantError?: string | null;
  onApply: () => void;
  recommendedOffer: string;
  offerVariations: string[];
  onSelectOfferVariation: (value: string) => void;
  onApplyAlternative: (
    field: "headline" | "subheadline" | "hook" | "primaryText",
    value: string,
  ) => void;
}) {
  const recommendedHook = copyAssistant?.alternatives.hook[0] ?? null;
  const [expandedVariation, setExpandedVariation] = useState<string | null>(null);
  const assistantCards = [
    { label: "Hook", value: copyAssistant?.hook || "Short pattern-based hook" },
    { label: "Problem", value: copyAssistant?.problem || "Clear market problem" },
    { label: "Mechanism", value: copyAssistant?.mechanism || "Why this campaign converts" },
    { label: "Offer", value: copyAssistant?.offer || "Enhanced core offer" },
    { label: "CTA", value: copyAssistant?.cta || "Strong action" },
  ];
  const variationGroups = copyAssistant
    ? [
        { label: "Headline", key: "headline" as const, items: copyAssistant.alternatives.headline },
        { label: "Subheadline", key: "subheadline" as const, items: copyAssistant.alternatives.subheadline },
        { label: "Hook", key: "hook" as const, items: copyAssistant.alternatives.hook },
        { label: "Primary Text", key: "primaryText" as const, items: copyAssistant.alternatives.primaryText },
      ]
    : [];

  const featuredVariation = variationGroups
    .flatMap((group) =>
      group.items.slice(0, 1).map((item) => ({
        groupLabel: group.label,
        groupKey: group.key,
        item,
        id: `${group.label}-${item.text}`,
      })),
    )
    .sort((left, right) => right.item.score - left.item.score)[0] ?? null;

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Creative Copy Assistant
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
            Generate GPT-directed copy
          </h3>
        </div>
        <Button onClick={onGenerate} disabled={copyAssistantLoading}>
          {copyAssistantLoading ? "Generating..." : "Generate Copy"}
        </Button>
      </div>
      {copyAssistantError ? (
        <p className="mt-4 text-sm text-rose-300">{copyAssistantError}</p>
      ) : null}
      <div className="mt-5 w-full overflow-visible">
        <div className="space-y-4">
          {assistantCards.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-[1.5]">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      {copyAssistant ? (
        <>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Recommended offer
            </p>
            <p className="mt-2 text-lg font-semibold">{recommendedOffer}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {offerVariations.map((variation) => (
                <button
                  key={variation}
                  type="button"
                  onClick={() => onSelectOfferVariation(variation)}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold transition hover:border-primary/25 hover:bg-primary/[0.04]"
                >
                  {variation}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Recommended
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {recommendedHook ? `🔥 Recommended (Score: ${recommendedHook.score.toFixed(1)})` : "🔥 Recommended"}
                </p>
              </div>
              {recommendedHook ? (
                <div className="grid gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2 2xl:grid-cols-4">
                  <p>Clarity: {recommendedHook.breakdown.clarity}</p>
                  <p>Specificity: {recommendedHook.breakdown.specificity}</p>
                  <p>Offer: {recommendedHook.breakdown.offerStrength}</p>
                  <p>Direct: {recommendedHook.breakdown.directResponse}</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-5 rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Why this was selected
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {copyAssistant.recommendationWhy}
            </p>
          </div>
        </>
      ) : null}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onApply} disabled={!copyAssistant}>
          Apply to First Ad
        </Button>
      </div>
      {copyAssistant ? (
        <div className="mt-5 w-full overflow-hidden space-y-4">
          {featuredVariation ? (
            <div className="rounded-[20px] border border-primary/15 bg-primary/[0.05] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    🔥 Recommended
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {featuredVariation.groupLabel} variation
                  </p>
                </div>
                <Badge className="border-primary/15 bg-white/[0.06] text-primary">
                  Score {featuredVariation.item.score.toFixed(1)}
                </Badge>
              </div>
              <div className="mt-4 rounded-[16px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm leading-7 text-white">{featuredVariation.item.text}</p>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => onApplyAlternative(featuredVariation.groupKey, featuredVariation.item.text)}
                >
                  Apply
                </Button>
              </div>
            </div>
          ) : null}

          {variationGroups.map((group) => (
            <div key={group.label} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label} alternatives
              </p>
              <div className="mt-3 grid w-full grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {group.items.slice(0, 4).map((item, index) => {
                  const variationId = `${group.label}-${item.text}`;
                  const isFeatured = featuredVariation?.id === variationId;
                  const isExpanded = expandedVariation === variationId;
                  const previewLabel =
                    item.text.split(/[.!?]/).map((part) => part.trim()).filter(Boolean)[0] ||
                    `${group.label} variation ${index + 1}`;

                  return (
                    <div
                      key={variationId}
                      className={[
                        "relative w-full overflow-hidden rounded-[16px] border px-4 py-4 transition",
                        isFeatured
                          ? "border-primary/25 bg-primary/[0.08]"
                          : "border-white/8 bg-white/[0.03]",
                      ].join(" ")}
                    >
                      <div className="relative z-10 flex h-full flex-col gap-4 overflow-hidden">
                        <div className="flex items-start justify-between gap-3 overflow-hidden">
                          <div className="min-w-0 overflow-hidden">
                            <p className="truncate text-sm font-semibold text-white">
                              {previewLabel}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                              Variation {index + 1}
                            </p>
                          </div>
                          <Badge className="border-white/10 bg-white/[0.05] text-white/72">
                            {item.score.toFixed(1)}
                          </Badge>
                        </div>

                        <p
                          className="break-words text-sm leading-relaxed text-white/72"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: isExpanded || isFeatured ? "unset" : 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {item.text}
                        </p>

                        <div className="flex flex-wrap justify-between gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setExpandedVariation((current) =>
                                current === variationId ? null : variationId,
                              )
                            }
                          >
                            {isExpanded ? "Hide" : "View"}
                          </Button>
                          {(isExpanded || isFeatured) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onApplyAlternative(group.key, item.text)}
                            >
                              Apply
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function BuilderSetupPanel({
  strategy,
  builderError,
  builderLoading,
  setTypingFields,
  setCampaign,
  onBuildCampaign,
  onBuildCampaignAction,
  setActiveTab,
}: {
  strategy: CampaignStrategyInput;
  builderError: string | null;
  builderLoading: boolean;
  setTypingFields: React.Dispatch<React.SetStateAction<{ location: boolean; audience: boolean; offer: boolean }>>;
  setCampaign: React.Dispatch<React.SetStateAction<BuiltCampaign>>;
  onBuildCampaign: (event: React.FormEvent<HTMLFormElement>) => void;
  onBuildCampaignAction: () => void;
  setActiveTab: (tab: "setup" | "funnel" | "creatives") => void;
}) {
  return (
    <Card className="p-6 sm:p-7">
      <form className="space-y-6" onSubmit={onBuildCampaign}>
        <div className="grid gap-4">
          <div className="rounded-[20px] border border-primary/15 bg-primary/[0.05] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Campaign setup
            </p>
            <p className="mt-2 text-sm leading-6 text-primary">
              Start with the core details. The funnel and ad copy update live on the right.
            </p>
          </div>
          <div className="space-y-2">
            <FieldLabel>Location</FieldLabel>
            <Input
              value={strategy.location}
              onChange={(event) => {
                setTypingFields((current) => ({ ...current, location: true }));
                setCampaign((current) => ({
                  ...current,
                  strategy: { ...current.strategy, location: event.target.value },
                }));
              }}
              placeholder="Miami"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Audience</FieldLabel>
            <Input
              value={strategy.audience}
              onChange={(event) => {
                setTypingFields((current) => ({ ...current, audience: true }));
                setCampaign((current) => ({
                  ...current,
                  strategy: { ...current.strategy, audience: event.target.value },
                }));
              }}
              placeholder="First-time buyers or local sellers"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Offer</FieldLabel>
            <Input
              value={strategy.offer}
              onChange={(event) => {
                setTypingFields((current) => ({ ...current, offer: true }));
                setCampaign((current) => ({
                  ...current,
                  strategy: { ...current.strategy, offer: event.target.value },
                }));
              }}
              placeholder="Guaranteed sale in 90 days"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Market type</FieldLabel>
            <select
              value={strategy.market_type ?? "buyer"}
              onChange={(event) =>
                setCampaign((current) => ({
                  ...current,
                  strategy: {
                    ...current.strategy,
                    market_type: event.target.value as CampaignStrategyInput["market_type"],
                  },
                }))
              }
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 focus-visible:border-primary/40 focus-visible:bg-white/[0.06]"
            >
              <option value="buyer">buyer</option>
              <option value="seller">seller</option>
              <option value="investor">investor</option>
            </select>
          </div>
        </div>
        {builderError ? <p className="text-sm text-rose-300">{builderError}</p> : null}
        <Button size="lg" type="button" onClick={onBuildCampaignAction} disabled={builderLoading}>
          {builderLoading ? "Generating campaign..." : "Generate Campaign"}
        </Button>
        <GuidedStepFooter nextLabel="Next: Funnel" onNext={onBuildCampaignAction} />
      </form>
    </Card>
  );
}

export function BuilderFunnelPanel({
  campaign,
  editingMode,
  previewDirection,
  onApplyThemePreset,
  onMarkRevision,
  savedCampaignId,
  ensureSavedCampaign,
  setCampaign,
  setActiveTab,
}: {
  campaign: BuiltCampaign;
  editingMode: BuilderEditingMode;
  previewDirection: BuilderPreviewDirection;
  onApplyThemePreset: (preset: BuilderThemePreset) => void;
  onMarkRevision: (source: "ai" | "manual", label: string) => void;
  savedCampaignId: string | null;
  ensureSavedCampaign: () => Promise<string>;
  setCampaign: React.Dispatch<React.SetStateAction<BuiltCampaign>>;
  setActiveTab: (tab: "setup" | "funnel" | "creatives") => void;
}) {
  const {
    selectedSectionIndex,
    setSelectedSectionIndex,
    advancedInspectorTab,
    setAdvancedInspectorTab,
    sectionHistory,
    draggedSectionIndex,
    dragOverSectionIndex,
    setDragOverSectionIndex,
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
  } = useAdvancedFunnelEditor({
    campaign,
    onMarkRevision,
    savedCampaignId,
    ensureSavedCampaign,
    setCampaign,
  });

  return (
    <Card className="p-6 sm:p-7">
      <input
        ref={videoUploadInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleAssetUpload(file, "video");
          }
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleAssetUpload(file, "image");
          }
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={thumbnailUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleAssetUpload(file, "thumbnail");
          }
          event.currentTarget.value = "";
        }}
      />
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Funnel
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
            {editingMode === "advanced" ? "Advanced funnel editor" : "Edit the landing page copy"}
          </h3>
        </div>
        {editingMode === "advanced" ? (
          <div className="space-y-5">
            <div className="rounded-[20px] border border-primary/15 bg-primary/[0.05] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Advanced mode
                  </p>
                  <p className="mt-2 text-sm leading-6 text-primary">
                    Edit one section at a time. Select a block on the left and the inspector will switch to the most relevant controls automatically.
                  </p>
                </div>
                <div className="grid w-full gap-3 text-center sm:grid-cols-3 xl:max-w-[420px]">
                  <div className="rounded-[16px] border border-primary/15 bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Sections</p>
                    <p className="mt-1 text-lg font-semibold text-white">{sections.length}</p>
                  </div>
                  <div className="rounded-[16px] border border-primary/15 bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Visible</p>
                    <p className="mt-1 text-lg font-semibold text-white">{visibleCount}</p>
                  </div>
                  <div className="rounded-[16px] border border-primary/15 bg-white/[0.04] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Media</p>
                    <p className="mt-1 text-lg font-semibold text-white">{mediaCount}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 2xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Section stack
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/62">
                    Select the one block you want to work on. The inspector stays scoped to that section only.
                  </p>
                </div>
                {sections.length > 0 ? (
                  <div className="space-y-4">
                    {groupedSections.map((group) => (
                      <div key={group.group} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {group.group}
                          </p>
                          <Badge className="border-white/10 bg-white/[0.05] text-white/65">
                            {group.items.length}
                          </Badge>
                        </div>
                        {group.items.map(({ section, index }) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setSelectedSectionIndex(index)}
                        draggable
                        onDragStart={() => handleSectionDragStart(index)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dragOverSectionIndex !== index) {
                            setDragOverSectionIndex(index);
                          }
                        }}
                        onDrop={() => handleSectionDrop(index)}
                        onDragEnd={handleSectionDragEnd}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" && (event.metaKey || event.altKey)) {
                            event.preventDefault();
                            reorderSection(index, Math.max(0, index - 1));
                          }

                          if (event.key === "ArrowDown" && (event.metaKey || event.altKey)) {
                            event.preventDefault();
                            reorderSection(index, Math.min(sections.length - 1, index + 1));
                          }
                        }}
                        className={[
                          "w-full rounded-[18px] border px-4 py-3 text-left transition",
                          index === selectedSectionIndex
                            ? "border-primary/25 bg-primary/[0.08] text-primary shadow-[0_18px_48px_-36px_rgba(66,153,225,0.45)]"
                            : "border-white/10 bg-white/[0.03] text-white/75 hover:text-white",
                          dragOverSectionIndex === index && draggedSectionIndex !== index
                            ? "border-sky-400/40 bg-sky-400/[0.08]"
                            : "",
                          draggedSectionIndex === index ? "opacity-55" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                              {buildSectionLabel(section)}
                            </p>
                            <p className="mt-1 text-sm font-semibold leading-6">
                              {section.title || buildSectionLabel(section)}
                            </p>
                            <p className="mt-1 text-xs text-white/55">
                              {section.visible ? "Visible" : "Hidden"} · {sentenceCase(section.type)} · {getVariantLabel(section)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="border-white/10 bg-white/[0.05] text-white/70">
                              {index + 1}
                            </Badge>
                            <div
                              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                              aria-hidden="true"
                            >
                              Drag
                            </div>
                          </div>
                        </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6">
                    <p className="text-sm font-semibold">No sections yet</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">
                      Add a VSL, image, or proof block to turn the funnel into a more custom launch page.
                    </p>
                  </div>
                )}
                <EditorDisclosure
                  title="Add block"
                  description="Expand this only when you want to add a new section."
                >
                  <p className="text-xs leading-5 text-white/50">
                    Drag blocks to reorder. Keyboard fallback: `Option/Alt + Arrow Up/Down`.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ADVANCED_SECTION_OPTIONS.map((option) => (
                      <Button key={option.type} size="sm" variant="secondary" onClick={() => addSection(option)}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </EditorDisclosure>
              </div>

              <div className="space-y-5 rounded-[24px] border border-white/8 bg-black/20 p-5">
                <EditorDisclosure
                  title="Funnel shell"
                  description="Global page framing. Keep this closed unless you are changing the whole funnel package."
                  badge={<Badge className="border-white/10 bg-white/[0.05] text-white/70">Global</Badge>}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel>Headline</FieldLabel>
                      <Input
                        value={campaign.funnel.headline ?? ""}
                        onChange={(event) =>
                          setCampaign((current) => ({
                            ...current,
                            funnel: { ...current.funnel, headline: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Primary CTA</FieldLabel>
                      <Input
                        value={campaign.funnel.cta ?? ""}
                        onChange={(event) =>
                          setCampaign((current) => ({
                            ...current,
                            funnel: { ...current.funnel, cta: event.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <FieldLabel>Subheadline</FieldLabel>
                    <AutoTextarea
                      value={campaign.funnel.subheadline ?? ""}
                      onChange={(event) =>
                        setCampaign((current) => ({
                          ...current,
                          funnel: { ...current.funnel, subheadline: event.target.value },
                        }))
                      }
                    />
                  </div>
                </EditorDisclosure>

                <EditorDisclosure
                  title="Theme preset"
                  description="Global styling. Keep this closed unless you are changing the overall art direction."
                  badge={
                    <Badge className="border-primary/15 bg-primary/[0.08] text-primary">
                      {THEME_PRESET_LIBRARY[previewDirection.themePreset].label}
                    </Badge>
                  }
                >
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(THEME_PRESET_LIBRARY) as BuilderThemePreset[]).map((presetKey) => {
                      const preset = THEME_PRESET_LIBRARY[presetKey];
                      return (
                        <button
                          key={presetKey}
                          type="button"
                          onClick={() => onApplyThemePreset(presetKey)}
                          className={[
                            "w-full min-w-0 rounded-[18px] border px-4 py-4 text-left transition sm:w-[calc(50%-0.375rem)]",
                            previewDirection.themePreset === presetKey
                              ? "border-primary/25 bg-primary/[0.08] text-primary"
                              : "border-white/10 bg-white/[0.03] text-white/75 hover:text-white",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: preset.palette.accent }}
                            />
                            <p className="break-normal text-sm font-semibold">{preset.label}</p>
                          </div>
                          <p className="mt-2 break-normal text-xs leading-5 opacity-80">{preset.summary}</p>
                        </button>
                      );
                    })}
                  </div>
                </EditorDisclosure>

                {selectedSection ? (
                  <div className="space-y-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Selected section
                        </p>
                        <p className="mt-1 text-lg font-semibold">{selectedSection.title || selectedSection.type}</p>
                        <p className="mt-1 text-xs text-white/55">
                          {buildSectionLabel(selectedSection)} · {getSectionGroupLabel(selectedSection.type)} · {getVariantLabel(selectedSection)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={undoSectionChange} disabled={sectionHistory.length === 0}>
                          Undo
                        </Button>
                        <Button size="sm" variant="secondary" onClick={duplicateSelectedSection}>
                          Duplicate
                        </Button>
                        <Button size="sm" variant="secondary" onClick={resetSelectedSection}>
                          Reset
                        </Button>
                        <Button size="sm" variant="ghost" onClick={removeSelectedSection}>Remove</Button>
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-white/8 bg-black/20 px-4 py-4">
                      <p className="text-sm font-semibold">
                        {getInspectorPanelMeta(advancedInspectorTab).title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/58">
                        {getInspectorPanelMeta(advancedInspectorTab).description}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InspectorTabButton
                        active={advancedInspectorTab === "content"}
                        onClick={() => setAdvancedInspectorTab("content")}
                        label="Content"
                        hint="Wording, title, variant, and block copy."
                      />
                      <InspectorTabButton
                        active={advancedInspectorTab === "layout"}
                        onClick={() => setAdvancedInspectorTab("layout")}
                        label="Layout"
                        hint="Spacing, width, alignment, and visibility."
                      />
                      <InspectorTabButton
                        active={advancedInspectorTab === "media"}
                        onClick={() => setAdvancedInspectorTab("media")}
                        label="Media"
                        hint="VSL and image slots for richer page sections."
                      />
                      <InspectorTabButton
                        active={advancedInspectorTab === "ai"}
                        onClick={() => setAdvancedInspectorTab("ai")}
                        label="AI tools"
                        hint="Quick section rewrites without losing the overall funnel."
                      />
                    </div>

                    {advancedInspectorTab === "content" ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="space-y-2">
                            <FieldLabel>Title</FieldLabel>
                            <Input
                              value={selectedSection.title}
                              onChange={(event) => updateSelectedSection((section) => ({ ...section, title: event.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <FieldLabel>Variant</FieldLabel>
                            {sectionVariantOptions.length > 0 ? (
                              <select
                                value={selectedSection.variant}
                                onChange={(event) => updateSelectedSection((section) => ({ ...section, variant: event.target.value }))}
                                className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
                              >
                                {sectionVariantOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                value={selectedSection.variant}
                                onChange={(event) => updateSelectedSection((section) => ({ ...section, variant: event.target.value }))}
                              />
                            )}
                            {sectionVariantOptions.length > 0 ? (
                              <p className="text-xs leading-5 text-white/55">
                                {sectionVariantOptions.find((option) => option.value === selectedSection.variant)?.description ??
                                  "Choose a variant to change how this block behaves."}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <FieldLabel>Content lines</FieldLabel>
                          <AutoTextarea
                            value={selectedSection.content.join("\n")}
                            onChange={(event) =>
                              updateSelectedSection((section) => ({
                                ...section,
                                content: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {advancedInspectorTab === "layout" ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                          <label className="space-y-2">
                            <FieldLabel>Spacing</FieldLabel>
                            <select
                              value={selectedSection.style.spacing}
                              onChange={(event) => updateSelectedSection((section) => ({ ...section, style: { ...section.style, spacing: event.target.value as FunnelSectionStyle["spacing"] } }))}
                              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
                            >
                              <option value="compact">compact</option>
                              <option value="comfortable">comfortable</option>
                              <option value="spacious">spacious</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <FieldLabel>Width</FieldLabel>
                            <select
                              value={selectedSection.style.width}
                              onChange={(event) => updateSelectedSection((section) => ({ ...section, style: { ...section.style, width: event.target.value as FunnelSectionStyle["width"] } }))}
                              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
                            >
                              <option value="full">full</option>
                              <option value="content">content</option>
                              <option value="narrow">narrow</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <FieldLabel>Align</FieldLabel>
                            <select
                              value={selectedSection.style.align}
                              onChange={(event) => updateSelectedSection((section) => ({ ...section, style: { ...section.style, align: event.target.value as FunnelSectionStyle["align"] } }))}
                              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
                            >
                              <option value="left">left</option>
                              <option value="center">center</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <FieldLabel>Theme</FieldLabel>
                            <select
                              value={selectedSection.style.theme}
                              onChange={(event) => updateSelectedSection((section) => ({ ...section, style: { ...section.style, theme: event.target.value as FunnelSectionStyle["theme"] } }))}
                              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
                            >
                              <option value="light">light</option>
                              <option value="dark">dark</option>
                              <option value="accent">accent</option>
                            </select>
                          </label>
                        </div>
                        <label className="flex items-center gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSection.visible}
                            onChange={(event) => updateSelectedSection((section) => ({ ...section, visible: event.target.checked }))}
                          />
                          Show this section on the funnel
                        </label>
                      </div>
                    ) : null}

                    {advancedInspectorTab === "media" ? (
                      <div className="space-y-4">
                        {assetsError ? (
                          <div className="rounded-[16px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                            {assetsError}
                          </div>
                        ) : null}
                        {assetActionError ? (
                          <div className="rounded-[16px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                            {assetActionError}
                          </div>
                        ) : null}
                        {selectedSection.type === "vsl" || selectedSection.type === "image" ? (
                          <div className="space-y-4">
                            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Current media
                                  </p>
                                  <p className="mt-2 text-sm text-white/82">
                                    {selectedSection.media?.url
                                      ? selectedSection.media.label || "Media connected"
                                      : "No media connected yet"}
                                  </p>
                                  {selectedSection.media?.caption ? (
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                      {selectedSection.media.caption}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      selectedSection.type === "vsl"
                                        ? videoUploadInputRef.current?.click()
                                        : imageUploadInputRef.current?.click()
                                    }
                                    disabled={assetActionLoading}
                                  >
                                    {selectedSection.media?.url ? "Replace media" : "Upload media"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => clearSelectedSectionMedia("primary")}
                                    disabled={assetActionLoading || !selectedSection.media?.url}
                                  >
                                    Remove media
                                  </Button>
                                </div>
                              </div>
                              {selectedSection.type === "vsl" ? (
                                <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-[16px] border border-white/8 bg-black/20 px-4 py-3">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Thumbnail
                                    </p>
                                    <p className="mt-2 text-sm text-white/78">
                                      {selectedSection.media?.thumbnailUrl ? "Thumbnail connected" : "No thumbnail connected yet"}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => thumbnailUploadInputRef.current?.click()}
                                      disabled={assetActionLoading}
                                    >
                                      {selectedSection.media?.thumbnailUrl ? "Replace thumbnail" : "Upload thumbnail"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => clearSelectedSectionMedia("thumbnail")}
                                      disabled={assetActionLoading || !selectedSection.media?.thumbnailUrl}
                                    >
                                      Remove thumbnail
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                              <div className="space-y-2">
                                <FieldLabel>Media label</FieldLabel>
                                <Input
                                  value={selectedSection.media?.label ?? ""}
                                  onChange={(event) =>
                                    updateSelectedSection((section) => ({
                                      ...section,
                                      media: {
                                        ...(section.media ?? { kind: selectedSection.type === "vsl" ? "video" : "image" }),
                                        label: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel>{selectedSection.type === "vsl" ? "Video URL" : "Image URL"}</FieldLabel>
                                <Input
                                  value={selectedSection.media?.url ?? ""}
                                  onChange={(event) =>
                                    updateSelectedSection((section) => ({
                                      ...section,
                                      media: {
                                        ...(section.media ?? { kind: selectedSection.type === "vsl" ? "video" : "image" }),
                                        url: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <FieldLabel>Caption</FieldLabel>
                                <AutoTextarea
                                  value={selectedSection.media?.caption ?? ""}
                                  onChange={(event) =>
                                    updateSelectedSection((section) => ({
                                      ...section,
                                      media: {
                                        ...(section.media ?? { kind: selectedSection.type === "vsl" ? "video" : "image" }),
                                        caption: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            </div>

                            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Asset picker
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-white/58">
                                    Choose from the real campaign asset library or upload a new file directly into `creative_assets`.
                                  </p>
                                </div>
                                <Badge className="border-white/10 bg-white/[0.05] text-white/72">
                                  {assetsLoading ? "Loading..." : `${mediaLibrary.length} media`}
                                </Badge>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    selectedSection.type === "vsl"
                                      ? videoUploadInputRef.current?.click()
                                      : imageUploadInputRef.current?.click()
                                  }
                                  disabled={assetActionLoading}
                                >
                                  Upload new {selectedSection.type === "vsl" ? "video" : "image"}
                                </Button>
                                {selectedSection.type === "vsl" ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => thumbnailUploadInputRef.current?.click()}
                                    disabled={assetActionLoading}
                                  >
                                    Upload thumbnail
                                  </Button>
                                ) : null}
                              </div>
                              {mediaLibrary.length > 0 ? (
                                <div className="mt-4 grid gap-3 2xl:grid-cols-2">
                                  {mediaLibrary.map((asset) => {
                                    const previewUrl = asset.thumbnail_url || asset.file_url || "";
                                    const isActive = selectedSection.media?.assetId === asset.id;

                                    return (
                                      <div
                                        key={asset.id}
                                        className={[
                                          "rounded-[18px] border p-3 transition",
                                          isActive ? "border-primary/25 bg-primary/[0.08]" : "border-white/8 bg-black/20",
                                        ].join(" ")}
                                      >
                                        {previewUrl ? (
                                          (asset.asset_type ?? "unknown").includes("video") ? (
                                            <video
                                              src={asset.file_url || undefined}
                                              poster={asset.thumbnail_url || undefined}
                                              className="aspect-video w-full rounded-[14px] bg-black object-cover"
                                            />
                                          ) : (
                                            <div className="relative aspect-video w-full overflow-hidden rounded-[14px]">
                                              <Image
                                                src={previewUrl}
                                                alt={asset.asset_type ?? "asset"}
                                                fill
                                                unoptimized
                                                className="object-cover"
                                              />
                                            </div>
                                          )
                                        ) : (
                                          <div className="aspect-video rounded-[14px] bg-white/[0.04]" />
                                        )}
                                        <div className="mt-3 flex items-start justify-between gap-3">
                                          <div>
                                            <p className="text-sm font-semibold">{asset.asset_type.replaceAll("_", " ")}</p>
                                            <p className="mt-1 text-xs text-white/55">
                                              {asset.provider_name || "manual_upload"} · {asset.status}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => bindAssetToSelectedSection(asset)}
                                              disabled={assetActionLoading}
                                            >
                                              {isActive ? "Selected" : "Use asset"}
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => void handleDeleteAsset(asset.id)}
                                              disabled={assetActionLoading}
                                            >
                                              Delete
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="mt-4 rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                                  <p className="text-sm font-semibold">No campaign media yet</p>
                                  <p className="mt-2 text-sm leading-6 text-white/58">
                                    Upload a real {selectedSection.type === "vsl" ? "video" : "image"} to make this block production-ready.
                                  </p>
                                </div>
                              )}
                            </div>

                            {selectedSection.type === "vsl" ? (
                              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Thumbnail picker
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                      Use a dedicated thumbnail for the VSL preview state.
                                    </p>
                                  </div>
                                  <Badge className="border-white/10 bg-white/[0.05] text-white/72">
                                    {thumbnailLibrary.length} thumbnails
                                  </Badge>
                                </div>
                                {thumbnailLibrary.length > 0 ? (
                                  <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                                    {thumbnailLibrary.map((asset) => {
                                      const previewUrl = asset.file_url || asset.thumbnail_url || "";
                                      const isActive = selectedSection.media?.thumbnailAssetId === asset.id;

                                      return (
                                        <div
                                          key={asset.id}
                                          className={[
                                            "rounded-[18px] border p-3 transition",
                                            isActive ? "border-primary/25 bg-primary/[0.08]" : "border-white/8 bg-black/20",
                                          ].join(" ")}
                                        >
                                          {previewUrl ? (
                                            <div className="relative aspect-video w-full overflow-hidden rounded-[14px]">
                                              <Image
                                                src={previewUrl}
                                                alt={asset.asset_type || "thumbnail"}
                                                fill
                                                unoptimized
                                                className="object-cover"
                                              />
                                            </div>
                                          ) : (
                                            <div className="aspect-video rounded-[14px] bg-white/[0.04]" />
                                          )}
                                          <div className="mt-3 flex items-center justify-between gap-2">
                                            <Button
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => bindAssetToSelectedSection(asset, "thumbnail")}
                                              disabled={assetActionLoading}
                                            >
                                              {isActive ? "Selected" : "Use"}
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => void handleDeleteAsset(asset.id)}
                                              disabled={assetActionLoading}
                                            >
                                              Delete
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="mt-4 rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                                    <p className="text-sm font-semibold">No thumbnails yet</p>
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                      Upload a thumbnail to control how the VSL appears before playback.
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6">
                            <p className="text-sm font-semibold">This section has no media slot</p>
                            <p className="mt-2 text-sm leading-6 text-white/58">
                              Select a VSL or Image block to attach media, or add one from the section stack.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {advancedInspectorTab === "ai" ? (
                      <div className="space-y-4">
                        {sectionAiError ? (
                          <div className="rounded-[16px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            {sectionAiError}
                          </div>
                        ) : null}
                        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                          <Button
                            variant="secondary"
                            onClick={() => void handleSectionAiAction("rewrite")}
                            disabled={Boolean(sectionAiLoading)}
                          >
                            {sectionAiLoading === "rewrite" ? "Rewriting..." : "Rewrite"}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void handleSectionAiAction("shorter")}
                            disabled={Boolean(sectionAiLoading)}
                          >
                            {sectionAiLoading === "shorter" ? "Updating..." : "Shorter"}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void handleSectionAiAction("stronger_cta")}
                            disabled={Boolean(sectionAiLoading)}
                          >
                            {sectionAiLoading === "stronger_cta" ? "Updating..." : "Stronger CTA"}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void handleSectionAiAction("more_luxury")}
                            disabled={Boolean(sectionAiLoading)}
                          >
                            {sectionAiLoading === "more_luxury" ? "Updating..." : "More luxury"}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void handleSectionAiAction("more_direct_response")}
                            disabled={Boolean(sectionAiLoading)}
                          >
                            {sectionAiLoading === "more_direct_response" ? "Updating..." : "More direct-response"}
                          </Button>
                        </div>
                        <div className="rounded-[18px] border border-primary/15 bg-primary/[0.05] px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                            Operator note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-primary/90">
                            The assistant is scoped to the selected block and the live campaign context: offer, audience, market, headline, and CTA.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8">
                    <p className="text-sm font-semibold">Select a section to start editing</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">
                      Start from the section stack on the left. Content, layout, media, and AI tools all stay scoped to one block at a time so fulfillment work stays controlled.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Fulfillment workflow
              </p>
              <p className="mt-2 text-sm leading-6 text-white/62">
                Guided mode gets the structure right. Advanced mode is for section-by-section refinement without breaking the saved funnel contract.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Headline</FieldLabel>
              <Input
                value={campaign.funnel.headline ?? ""}
                onChange={(event) =>
                  setCampaign((current) => ({
                    ...current,
                    funnel: { ...current.funnel, headline: event.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Subheadline</FieldLabel>
              <Input
                value={campaign.funnel.subheadline ?? ""}
                onChange={(event) =>
                  setCampaign((current) => ({
                    ...current,
                    funnel: { ...current.funnel, subheadline: event.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>CTA</FieldLabel>
              <Input
                value={campaign.funnel.cta ?? ""}
                onChange={(event) =>
                  setCampaign((current) => ({
                    ...current,
                    funnel: { ...current.funnel, cta: event.target.value },
                  }))
                }
              />
            </div>
          </div>
        )}
        <GuidedStepFooter
          backLabel="Back: Setup"
          onBack={() => setActiveTab("setup")}
          nextLabel="Next: Creatives"
          onNext={() => setActiveTab("creatives")}
        />
      </div>
    </Card>
  );
}

export function BuilderCreativesPanel(props: {
  campaign: BuiltCampaign;
  campaignName: string;
  setCampaignName: React.Dispatch<React.SetStateAction<string>>;
  copyAssistant: CreativeCopyAssistantOutput | null;
  copyAssistantLoading: boolean;
  copyAssistantError: string | null;
  recommendedOffer: string;
  offerVariations: string[];
  staticAdRows: Array<{ creative: any; copy: any; index: number }>;
  videoRows: Array<{ creative: any; copy: any; index: number }>;
  generatedVideos: Record<number, GeneratedVideoState>;
  videoGenerationErrors: Record<number, string>;
  videoGenerationIndex: number | null;
  saveLoading: boolean;
  saveError: string | null;
  isSaved: boolean;
  savedCampaignId: string | null;
  toCopyAssistantInput: (strategy: CampaignStrategyInput) => {
    offer: string;
    market: string;
    location: string;
    audience: string;
    price_point: string | undefined;
    market_type: CampaignStrategyInput["market_type"];
    funnel_goal: "survey" | "lead_form" | "book_call";
  };
  handleGenerateCopyAssistant: () => void;
  applyAssistantToStaticAd: (index: number) => void;
  applyOfferVariation: (value: string) => void;
  applyAssistantAlternative: (
    field: "headline" | "subheadline" | "hook" | "primaryText",
    value: string,
  ) => void;
  handleGenerateVideo: (index: number) => void;
  handleSaveCampaign: () => Promise<string>;
  setActiveTab: (tab: "setup" | "funnel" | "creatives") => void;
  setCampaign: React.Dispatch<React.SetStateAction<BuiltCampaign>>;
}) {
  const {
    campaign,
    campaignName,
    setCampaignName,
    copyAssistant,
    copyAssistantLoading,
    copyAssistantError,
    recommendedOffer,
    offerVariations,
    staticAdRows,
    videoRows,
    generatedVideos,
    videoGenerationErrors,
    videoGenerationIndex,
    saveLoading,
    saveError,
    isSaved,
    savedCampaignId,
    toCopyAssistantInput,
    handleGenerateCopyAssistant,
    applyAssistantToStaticAd,
    applyOfferVariation,
    applyAssistantAlternative,
    handleGenerateVideo,
    handleSaveCampaign,
    setActiveTab,
    setCampaign,
  } = props;

  return (
    <div className="space-y-6">
      <CopyAssistantPanel
        copyAssistant={copyAssistant}
        onGenerate={handleGenerateCopyAssistant}
        copyAssistantLoading={copyAssistantLoading}
        copyAssistantError={copyAssistantError}
        onApply={() => applyAssistantToStaticAd(0)}
        recommendedOffer={recommendedOffer}
        offerVariations={offerVariations}
        onSelectOfferVariation={applyOfferVariation}
        onApplyAlternative={applyAssistantAlternative}
      />

      <div className="space-y-6">
        {staticAdRows.map(({ creative, copy, index }) => (
          <Card key={`${creative.format}-${creative.angle}-${index}`} className="p-6">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Static ad {index + 1}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>Headline</FieldLabel>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCampaign((current) => {
                        const improved = improveCopyText(
                          current.copy[index]?.headline || "",
                          "headline",
                          toCopyAssistantInput(current.strategy),
                        );
                        const nextCopy = current.copy.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, headline: improved } : item,
                        );
                        return { ...current, copy: nextCopy };
                      });
                    }}
                  >
                    Improve this
                  </Button>
                </div>
                <Input
                  value={copy?.headline ?? ""}
                  onChange={(event) =>
                    setCampaign((current) => {
                      const nextCopy = current.copy.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, headline: event.target.value } : item,
                      );
                      return { ...current, copy: nextCopy };
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>Hook / Overlay text</FieldLabel>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCampaign((current) => {
                        const improved = improveCopyText(
                          current.creatives[index]?.hook || "",
                          "overlay",
                          toCopyAssistantInput(current.strategy),
                        );
                        const nextCreatives = current.creatives.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, hook: improved } : item,
                        );
                        return { ...current, creatives: nextCreatives };
                      });
                    }}
                  >
                    Improve this
                  </Button>
                </div>
                <Input
                  value={creative.hook ?? ""}
                  onChange={(event) =>
                    setCampaign((current) => {
                      const nextCreatives = current.creatives.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, hook: event.target.value } : item,
                      );
                      return { ...current, creatives: nextCreatives };
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>Primary text</FieldLabel>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCampaign((current) => {
                        const improvedPrimary = improveCopyText(
                          current.copy[index]?.primary_text || "",
                          "primary",
                          toCopyAssistantInput(current.strategy),
                        );
                        const nextCopy = current.copy.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, primary_text: improvedPrimary, cta: copyAssistant?.cta ?? item.cta }
                            : item,
                        );
                        return { ...current, copy: nextCopy };
                      });
                    }}
                  >
                    Improve this
                  </Button>
                </div>
                <AutoTextarea
                  value={copy?.primary_text ?? ""}
                  onChange={(event) =>
                    setCampaign((current) => {
                      const nextCopy = current.copy.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, primary_text: event.target.value } : item,
                      );
                      return { ...current, copy: nextCopy };
                    })
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => applyAssistantToStaticAd(index)}>
                  Apply assistant
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        {videoRows.map(({ creative, copy, index }) => (
          <Card key={`${creative.format}-${creative.angle}-video-${index}`} className="p-6">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Video {index + 1}
                </p>
              </div>
              <div className="space-y-2">
                <FieldLabel>Hook</FieldLabel>
                <Input value={creative.hook ?? ""} readOnly />
              </div>
              <div className="space-y-2">
                <FieldLabel>Script</FieldLabel>
                <AutoTextarea value={copy?.script ?? ""} readOnly />
              </div>
              <VideoStoryboardPreview
                title={`Video ${index + 1}`}
                hook={generatedVideos[index]?.video.hook ?? creative.hook ?? ""}
                script={(generatedVideos[index]?.video.script ?? [copy?.script ?? ""]).join("\n")}
                scenes={
                  generatedVideos[index]?.video.scenes.map((scene) => scene.text) ?? [
                    "Open with the core hook.",
                    "Explain why this works now.",
                    "Close with a direct CTA.",
                  ]
                }
                videoUrl={generatedVideos[index]?.video.url}
              />
              {generatedVideos[index]?.status === "processing" ? (
                <p className="text-sm text-primary">
                  Video generation is queued. The finished render will appear here when the provider job completes.
                </p>
              ) : null}
              {videoGenerationErrors[index] ? (
                <p className="text-sm text-rose-300">{videoGenerationErrors[index]}</p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  disabled={videoGenerationIndex === index}
                  onClick={() => handleGenerateVideo(index)}
                  title="Uses paid generation credits and queues a HeyGen render."
                >
                  {videoGenerationIndex === index ? "Queueing video..." : "Generate UGC video"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Save
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
              Save this version and move to review
            </h3>
          </div>
          {isSaved ? (
            <Badge className="border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
              Saved
            </Badge>
          ) : null}
        </div>
        <div className="mt-6 grid gap-4">
          <div className="space-y-2">
            <FieldLabel>Campaign name</FieldLabel>
            <Input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              placeholder="Toronto seller campaign"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSaveCampaign()} disabled={saveLoading || !campaignName.trim()}>
              {saveLoading ? "Saving..." : "Save Campaign"}
            </Button>
            <Button asChild variant="secondary">
              <Link href={savedCampaignId ? `/preview?campaignId=${savedCampaignId}` : "/preview"}>
                {savedCampaignId ? "Open Saved Campaign" : "Open Review"}
              </Link>
            </Button>
          </div>
          <GuidedStepFooter
            backLabel="Back: Funnel"
            onBack={() => setActiveTab("funnel")}
            nextLabel="Next: Review"
            nextHref={savedCampaignId ? `/preview?campaignId=${savedCampaignId}` : "/preview"}
          />
        </div>
        {saveError ? <p className="mt-4 text-sm text-rose-300">{saveError}</p> : null}
      </Card>
    </div>
  );
}

export const BuilderPreviewPanel = memo(function BuilderPreviewPanel({
  previewTab,
  setPreviewTab,
  campaign,
  creativeStrategy,
  showCreativeQa = false,
  previewHeadline,
  previewSubheadline,
  previewCta,
  previewAds,
  previewVideos,
  previewAssets,
  previewDirection,
}: {
  previewTab: PreviewPaneTab;
  setPreviewTab: React.Dispatch<React.SetStateAction<PreviewPaneTab>>;
  campaign: BuiltCampaign;
  creativeStrategy?: CampaignCreativeStrategy | null;
  showCreativeQa?: boolean;
  previewHeadline: string;
  previewSubheadline: string;
  previewCta: string;
  previewAds: Array<{
    id: string;
    overlayText: string;
    primaryText: string;
    headline: string;
    cta: string;
    imageUrl?: string | null;
    recommended: boolean;
    score: number;
    scoreBreakdown?: CreativeScoreBreakdown | null;
    imageGenerationState?: "generated" | "generating" | "unavailable" | "failed";
    imageGenerationMessage?: string | null;
  }>;
  previewVideos: Array<{
    id: string;
    title: string;
    hook: string;
    script: string;
    scenes: string[];
    videoUrl?: string;
  }>;
  previewAssets: Array<{ title: string; subtitle: string; status: "ready" | "draft" }>;
  previewDirection?: BuilderPreviewDirection | null;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <Card className="flex h-full min-w-0 flex-col overflow-hidden p-4 xl:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Live preview
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
              Review what the user will actually see
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <TabButton active={previewTab === "funnel"} onClick={() => setPreviewTab("funnel")}>
              Funnel
            </TabButton>
            <TabButton active={previewTab === "ads"} onClick={() => setPreviewTab("ads")}>
              Ads
            </TabButton>
            <TabButton active={previewTab === "assets"} onClick={() => setPreviewTab("assets")}>
              Assets
            </TabButton>
          </div>
        </div>

        <div className="mt-5 h-full overflow-y-auto overflow-x-hidden">
          <div className="w-full min-w-0">
            {previewTab === "funnel" ? (
              <FunnelLivePreview
                headline={previewHeadline}
                subheadline={previewSubheadline}
                cta={previewCta}
                location={campaign.strategy.location}
                sections={campaign.funnel.sections || []}
                formFields={campaign.funnel.form_fields || ["Name", "Phone", "Email"]}
                direction={previewDirection}
              />
            ) : null}

            {previewTab === "ads" ? (
              <div className="space-y-6">
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Creative review
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/62">
                        Compare the static and video creatives side by side before you move to review.
                      </p>
                    </div>
                    <Badge className="border-white/10 bg-white/[0.05] text-white/72">
                      {previewAds.length + previewVideos.length} creatives
                    </Badge>
                  </div>
                </div>

                {previewAds.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Static creatives
                    </p>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {previewAds.slice(0, 3).map((ad) => (
                        <div key={ad.id} className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {ad.recommended ? (
                              <Badge className="border-primary/15 bg-primary/10 text-primary">
                                🔥 Recommended • Best performing
                              </Badge>
                            ) : null}
                            {ad.score > 0 ? (
                              <Badge className="border-white/10 bg-white/[0.05] text-white/72">
                                Score {ad.score.toFixed(1)}
                              </Badge>
                            ) : null}
                            {ad.imageGenerationState === "generated" ? (
                              <Badge className="border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                                Generated
                              </Badge>
                            ) : ad.imageGenerationState === "generating" ? (
                              <Badge className="border-sky-400/15 bg-sky-400/10 text-sky-300">
                                Generating
                              </Badge>
                            ) : ad.imageGenerationState === "failed" ? (
                              <Badge className="border-rose-400/15 bg-rose-400/10 text-rose-300">
                                Generation failed
                              </Badge>
                            ) : ad.imageGenerationState === "unavailable" ? (
                              <Badge className="border-white/10 bg-white/[0.05] text-muted-foreground">
                                Not generated yet
                              </Badge>
                            ) : null}
                          </div>
                          {showCreativeQa && creativeStrategy ? (
                            <CreativeOpsQaCard
                              compact
                              assessment={assessCreativeOpsQuality({
                                strategy: creativeStrategy,
                                scoreBreakdown: ad.scoreBreakdown ?? null,
                                hook: ad.overlayText,
                                overlayText: ad.overlayText,
                                primaryText: ad.primaryText,
                                headline: ad.headline,
                              })}
                            />
                          ) : null}
                          {showCreativeQa && ad.imageGenerationState === "failed" && ad.imageGenerationMessage ? (
                            <p className="text-xs leading-5 text-rose-300">{ad.imageGenerationMessage}</p>
                          ) : null}
                          <StaticAdPreview
                            businessName={`${campaign.strategy.location || "Local"} Campaign`}
                            overlayText={ad.overlayText}
                            primaryText={ad.primaryText}
                            headline={ad.headline}
                            cta={ad.cta}
                            imageUrl={ad.imageUrl}
                            direction={previewDirection}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {previewVideos.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Video creatives
                    </p>
                    <div className="grid gap-5 xl:grid-cols-2">
                      {previewVideos.map((video) => (
                        <VideoStoryboardPreview
                          key={video.id}
                          title={video.title}
                          hook={video.hook}
                          script={video.script}
                          scenes={video.scenes}
                          videoUrl={video.videoUrl}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {previewAds.length === 0 && previewVideos.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6">
                    <p className="text-sm font-semibold">No canonical creatives yet</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">
                      Build or save the campaign to preview the actual launch creatives here.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {previewTab === "assets" ? (
              previewAssets.length > 0 ? (
                <AssetPreviewGrid items={previewAssets} />
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6">
                  <p className="text-sm font-semibold">No canonical assets yet</p>
                  <p className="mt-2 text-sm leading-6 text-white/58">
                    Upload or generate real assets to preview the saved launch package here.
                  </p>
                </div>
              )
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
});
