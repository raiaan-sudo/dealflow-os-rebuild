// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import type { BuilderPreviewDirection, BuilderThemePreset } from "@/components/campaign/builder/types";
import type { FunnelSection, FunnelSectionType } from "@/lib/services/funnel-engine";

export type AdvancedInspectorTab = "content" | "layout" | "media" | "ai";
export type SectionAiAction =
  | "rewrite"
  | "shorter"
  | "stronger_cta"
  | "more_luxury"
  | "more_direct_response";

export type SectionVariantOption = {
  value: string;
  label: string;
  description: string;
};

type ThemePresetDefinition = BuilderPreviewDirection & {
  label: string;
  summary: string;
};

export const THEME_PRESET_LIBRARY: Record<BuilderThemePreset, ThemePresetDefinition> = {
  luxury: {
    themePreset: "luxury",
    label: "Luxury",
    summary: "Editorial premium styling for higher-end listings and polished brand positioning.",
    mood: "luxury",
    visualDirection: "luxury real estate landing page with warm editorial surfaces and premium spacing",
    designNotes: [
      "Use premium editorial contrast with restrained detail.",
      "Keep the call to action elegant and decisive.",
    ],
    typography: {
      display: "refined",
      body: "comfortable",
      label: "premium",
    },
    spacing: {
      hero: "spacious",
      section: "comfortable",
    },
    palette: {
      background: "#0c1118",
      surface: "#1a2230",
      accent: "#d6a66a",
      text: "#f8f5ef",
      mutedText: "rgba(248,245,239,0.72)",
      panel: "#f3ede3",
      ctaText: "#15120f",
    },
  },
  investor: {
    themePreset: "investor",
    label: "Investor",
    summary: "Sharper analytical styling with stronger contrast and deal-focused framing.",
    mood: "investor",
    visualDirection: "investor-grade landing page with analytical hierarchy and sharp financial framing",
    designNotes: [
      "Keep the hierarchy disciplined and information-dense.",
      "Make proof and market specificity feel decisive.",
    ],
    typography: {
      display: "sharp",
      body: "dense",
      label: "tech",
    },
    spacing: {
      hero: "comfortable",
      section: "comfortable",
    },
    palette: {
      background: "#08111e",
      surface: "#132338",
      accent: "#74c7ff",
      text: "#f8fbff",
      mutedText: "rgba(248,251,255,0.72)",
      panel: "#ebf4fb",
      ctaText: "#05111a",
    },
  },
  seller: {
    themePreset: "seller",
    label: "Seller",
    summary: "Trust-led design system built for local authority and low-friction conversion.",
    mood: "seller",
    visualDirection: "seller-focused landing page with trust-led hierarchy and warm conversion framing",
    designNotes: [
      "Lead with certainty, clarity, and trust.",
      "Use warmer surfaces to reduce perceived friction.",
    ],
    typography: {
      display: "clean",
      body: "comfortable",
      label: "premium",
    },
    spacing: {
      hero: "comfortable",
      section: "comfortable",
    },
    palette: {
      background: "#12141a",
      surface: "#2a1e24",
      accent: "#ff8f6b",
      text: "#fff8f5",
      mutedText: "rgba(255,248,245,0.76)",
      panel: "#fff1eb",
      ctaText: "#1a0f0c",
    },
  },
  minimal: {
    themePreset: "minimal",
    label: "Minimal",
    summary: "Low-noise styling with clean spacing and a focused conversion path.",
    mood: "minimal",
    visualDirection: "minimal high-converting landing page with strong whitespace and a single dominant accent",
    designNotes: [
      "Reduce clutter and keep the page highly scannable.",
      "Let one CTA and one promise lead the page.",
    ],
    typography: {
      display: "clean",
      body: "airy",
      label: "minimal",
    },
    spacing: {
      hero: "spacious",
      section: "spacious",
    },
    palette: {
      background: "#0f1115",
      surface: "#1c2128",
      accent: "#8ad7ff",
      text: "#fafcff",
      mutedText: "rgba(250,252,255,0.72)",
      panel: "#f6f8fb",
      ctaText: "#07111b",
    },
  },
  editorial: {
    themePreset: "editorial",
    label: "Editorial",
    summary: "Magazine-style hierarchy with spacious rhythm and stronger visual storytelling.",
    mood: "editorial",
    visualDirection: "editorial launch page with spacious composition and cinematic brand framing",
    designNotes: [
      "Use larger type moments and more breathing room.",
      "Keep the page feeling designed rather than templated.",
    ],
    typography: {
      display: "editorial",
      body: "airy",
      label: "premium",
    },
    spacing: {
      hero: "spacious",
      section: "comfortable",
    },
    palette: {
      background: "#0b0f17",
      surface: "#1a2433",
      accent: "#9bc5ff",
      text: "#f7f9fc",
      mutedText: "rgba(247,249,252,0.74)",
      panel: "#f2f4f7",
      ctaText: "#08111e",
    },
  },
};

export function getPreviewDirection(direction?: BuilderPreviewDirection | null) {
  return direction ?? THEME_PRESET_LIBRARY.investor;
}

export function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {children}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </label>
  );
}

export function trimWords(value: string, maxWords: number) {
  const words = (value ?? "").split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}...`;
}

export function sentenceCase(value: string) {
  return value.replaceAll("_", " ");
}

export function getSectionCategory(type: FunnelSectionType): AdvancedInspectorTab {
  if (type === "vsl" || type === "image") {
    return "media";
  }

  if (type === "form" || type === "closing_cta") {
    return "ai";
  }

  return "content";
}

export function getSectionGroupLabel(type: FunnelSectionType) {
  if (type === "hero" || type === "benefits" || type === "process" || type === "objections" || type === "faq") {
    return "Core Story";
  }

  if (type === "trust_bar" || type === "proof_metrics" || type === "social_proof" || type === "market_snapshot") {
    return "Proof & Trust";
  }

  if (type === "vsl" || type === "image") {
    return "Media";
  }

  return "Conversion";
}

export function buildSectionLabel(section: FunnelSection) {
  switch (section.type) {
    case "hero":
      return "Hero";
    case "trust_bar":
      return "Trust bar";
    case "proof_metrics":
      return "Proof";
    case "social_proof":
      return "Social proof";
    case "market_snapshot":
      return "Market snapshot";
    case "objections":
      return "Objections";
    case "process":
      return "Process";
    case "faq":
      return "FAQ";
    case "vsl":
      return "VSL";
    case "image":
      return "Image";
    case "form":
      return "Form";
    case "closing_cta":
      return "Closing CTA";
    default:
      return sentenceCase(section.type);
  }
}

export const SECTION_VARIANT_OPTIONS: Partial<Record<FunnelSectionType, SectionVariantOption[]>> = {
  hero: [
    { value: "offer-led", label: "Offer-led hero", description: "Direct promise with strong CTA." },
    { value: "cinematic", label: "Cinematic hero", description: "Bigger mood and visual framing." },
    { value: "editorial", label: "Editorial hero", description: "Luxury, premium presentation." },
  ],
  proof_metrics: [
    { value: "metrics-grid", label: "Metrics grid", description: "Structured proof blocks." },
    { value: "case-study", label: "Case study proof", description: "Outcome-led trust framing." },
    { value: "authority", label: "Authority proof", description: "Proof with credibility emphasis." },
  ],
  social_proof: [
    { value: "testimonials", label: "Testimonials", description: "Client belief and trust." },
    { value: "logos", label: "Partner logos", description: "Brand and social validation." },
    { value: "story-snippets", label: "Story snippets", description: "More narrative social proof." },
  ],
  faq: [
    { value: "objection-handling", label: "Objection FAQ", description: "Answers common hesitation." },
    { value: "process-faq", label: "Process FAQ", description: "Clarifies workflow and next steps." },
    { value: "qualification-faq", label: "Qualification FAQ", description: "Filters and qualifies prospects." },
  ],
  form: [
    { value: "short-form", label: "Short form", description: "Fast conversion with low friction." },
    { value: "qualification", label: "Qualification form", description: "More filtering before submit." },
    { value: "consultation", label: "Consultation form", description: "Book-call style conversion." },
  ],
  closing_cta: [
    { value: "urgency", label: "Urgency close", description: "More direct response pressure." },
    { value: "reassurance", label: "Reassurance close", description: "Trust-led closing section." },
    { value: "application", label: "Application close", description: "Qualification-style CTA close." },
  ],
};

export function getVariantLabel(section: FunnelSection) {
  const options = SECTION_VARIANT_OPTIONS[section.type] ?? [];
  return options.find((option) => option.value === section.variant)?.label ?? sentenceCase(section.variant || "default");
}

const DEFAULT_SECTION_BLUEPRINTS: Record<FunnelSectionType, Omit<FunnelSection, "id">> = {
  hero: {
    type: "hero",
    variant: "offer-led",
    title: "Lead with the strongest promise",
    content: ["State the direct promise, why it matters, and what the next step is."],
    visible: true,
    style: { spacing: "spacious", width: "content", align: "left", theme: "dark" },
    media: null,
  },
  trust_bar: {
    type: "trust_bar",
    variant: "signals",
    title: "Trust signals",
    content: ["Trusted locally", "Fast follow-up", "Conversion-ready process"],
    visible: true,
    style: { spacing: "compact", width: "full", align: "left", theme: "accent" },
    media: null,
  },
  benefits: {
    type: "benefits",
    variant: "benefit-list",
    title: "Why this works",
    content: ["Highlight the clearest reasons this offer is worth acting on."],
    visible: true,
    style: { spacing: "comfortable", width: "full", align: "left", theme: "light" },
    media: null,
  },
  proof_metrics: {
    type: "proof_metrics",
    variant: "metrics-grid",
    title: "Proof that removes doubt",
    content: ["Use conversion proof, metrics, or offer credibility here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  social_proof: {
    type: "social_proof",
    variant: "testimonials",
    title: "Social proof",
    content: ["Add testimonial snippets, trust language, or partner logos here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  market_snapshot: {
    type: "market_snapshot",
    variant: "snapshot",
    title: "Market snapshot",
    content: ["Use local market specificity to make the offer feel grounded."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  objections: {
    type: "objections",
    variant: "objection-handling",
    title: "Handle the biggest objections",
    content: ["Answer the biggest reason a prospect might hesitate."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  process: {
    type: "process",
    variant: "three-step",
    title: "How it works",
    content: ["Explain the process in a simple step-by-step way."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  faq: {
    type: "faq",
    variant: "objection-handling",
    title: "FAQ",
    content: ["Add the most important question-and-answer pairs here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
    media: null,
  },
  vsl: {
    type: "vsl",
    variant: "video-breakdown",
    title: "Watch the breakdown",
    content: ["Add a short explainer, walkthrough, or VSL here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "center", theme: "dark" },
    media: {
      kind: "video",
      label: "VSL Placeholder",
      caption: "Paste a hosted video URL or upload a thumbnail later.",
    },
  },
  image: {
    type: "image",
    variant: "proof-visual",
    title: "Visual proof",
    content: ["Add listing imagery, team photos, or proof visuals here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "center", theme: "light" },
    media: {
      kind: "image",
      label: "Image Placeholder",
      caption: "Use this for branded or listing imagery.",
    },
  },
  form: {
    type: "form",
    variant: "short-form",
    title: "Take the next step",
    content: ["Use a short, low-friction conversion step here."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "accent" },
    media: null,
  },
  closing_cta: {
    type: "closing_cta",
    variant: "urgency",
    title: "Ready to move?",
    content: ["Close with one clear action and a strong reason to act now."],
    visible: true,
    style: { spacing: "comfortable", width: "content", align: "left", theme: "dark" },
    media: null,
  },
};

export function createSectionId(type: FunnelSectionType) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildSectionFromBlueprint(type: FunnelSectionType, overrides?: Partial<FunnelSection>): FunnelSection {
  const base = DEFAULT_SECTION_BLUEPRINTS[type];

  return {
    ...base,
    id: overrides?.id ?? createSectionId(type),
    variant: overrides?.variant ?? base.variant,
    title: overrides?.title ?? base.title,
    content: overrides?.content ?? [...base.content],
    visible: overrides?.visible ?? base.visible,
    style: {
      ...base.style,
      ...(overrides?.style ?? {}),
    },
    media:
      overrides?.media !== undefined
        ? overrides.media
        : base.media
          ? { ...base.media }
          : null,
  };
}

export function InspectorTabButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-w-0 rounded-[18px] border px-4 py-3 text-left transition",
        active
          ? "border-primary/25 bg-primary/[0.08] text-primary"
          : "border-white/10 bg-white/[0.03] text-white/72 hover:text-white",
      ].join(" ")}
    >
      <p className="break-normal text-[11px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <p className="mt-1 break-normal text-xs leading-5 opacity-80">{hint}</p>
    </button>
  );
}

export function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.height = "0px";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      className={[
        "min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 focus-visible:border-primary/40 focus-visible:bg-white/[0.06]",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export const ADVANCED_SECTION_OPTIONS: Array<{
  type: FunnelSectionType;
  label: string;
  title: string;
  content: string[];
  media?: FunnelSection["media"];
}> = [
  {
    type: "vsl",
    label: "Add VSL",
    title: "Watch the breakdown",
    content: ["Add a short explainer, walkthrough, or VSL here."],
    media: {
      kind: "video",
      label: "VSL Placeholder",
      caption: "Paste a hosted video URL or upload a thumbnail later.",
    },
  },
  {
    type: "image",
    label: "Add Image",
    title: "Visual proof",
    content: ["Add listing imagery, team photos, or proof visuals here."],
    media: {
      kind: "image",
      label: "Image Placeholder",
      caption: "Use this for branded or listing imagery.",
    },
  },
  {
    type: "social_proof",
    label: "Add Testimonials",
    title: "What prospects need to believe",
    content: ["Add testimonial snippets, trust language, or partner logos here."],
  },
];

export function buildAdvancedSectionTemplate(
  option: (typeof ADVANCED_SECTION_OPTIONS)[number],
): FunnelSection {
  return buildSectionFromBlueprint(option.type, {
    title: option.title,
    content: option.content,
    media: option.media ?? null,
  });
}
