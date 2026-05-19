"use client";

import Image from "next/image";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
import type { CampaignPlan, ExpectedOutcomes } from "@/lib/services/campaign-plan-service";

type FunnelPreviewProps = {
  plan: CampaignPlan;
  expectedOutcomes: ExpectedOutcomes;
  strategyWhy: string[];
  compact?: boolean;
};

function normalizeForOfferMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasOfferSignal(value: string, offer: string) {
  const normalizedValue = normalizeForOfferMatch(value);
  const offerTokens = normalizeForOfferMatch(offer)
    .split(" ")
    .filter((token) => token.length >= 4 && !["with", "from", "your", "that", "this"].includes(token));

  if (offerTokens.length === 0) {
    return false;
  }

  const requiredMatches = Math.min(2, offerTokens.length);
  return offerTokens.filter((token) => normalizedValue.includes(token)).length >= requiredMatches;
}

function buildOfferCta(offer: string) {
  if (/approval|credit/i.test(offer)) {
    return "Check My Approval Plan";
  }

  if (/value|valuation|price/i.test(offer)) {
    return "Check My Value";
  }

  if (/cash|invest|roi|deal/i.test(offer)) {
    return "See Matching Deals";
  }

  return "Review My Plan";
}

type FunnelPreviewSectionKind =
  | "trust"
  | "proof"
  | "process"
  | "faq"
  | "compliance"
  | "conversion"
  | "content";

function getPreviewSectionText(section: { type: string; variant?: string; title: string }) {
  return `${section.type} ${section.variant ?? ""} ${section.title}`.toLowerCase();
}

function getPreviewSectionKind(section: { type: string; variant?: string; title: string }): FunnelPreviewSectionKind {
  const text = getPreviewSectionText(section);

  if (section.type === "trust_bar") {
    return "trust";
  }

  if (section.type === "proof_metrics" || section.type === "social_proof" || /proof|metric|testimonial|case|authority/.test(text)) {
    return "proof";
  }

  if (section.type === "process" || /how it works|mechanism|process|step/.test(text)) {
    return "process";
  }

  if (section.type === "faq" || /faq|question/.test(text)) {
    return "faq";
  }

  if (section.type === "objections" || /compliance|consent|privacy|terms|risk|objection|reversal/.test(text)) {
    return "compliance";
  }

  if (section.type === "form" || section.type === "closing_cta" || /capture|qualification|consultation|urgency|cta/.test(text)) {
    return "conversion";
  }

  return "content";
}

function splitPreviewFaqItem(item: string) {
  const trimmed = item.trim();
  const questionMarkIndex = trimmed.indexOf("?");

  if (questionMarkIndex > 8) {
    return {
      question: trimmed.slice(0, questionMarkIndex + 1),
      answer: trimmed.slice(questionMarkIndex + 1).replace(/^[:\s-]+/, ""),
    };
  }

  const [question, ...answerParts] = trimmed.split(/\s[-:]\s/);

  return {
    question: question || trimmed,
    answer: answerParts.join(" - "),
  };
}

export function FunnelPreview({ plan, expectedOutcomes: _expectedOutcomes, strategyWhy: _strategyWhy, compact = false }: FunnelPreviewProps) {
  void _expectedOutcomes;
  void _strategyWhy;

  const offer = plan.offerSummary || plan.keyOffer || plan.primaryGoal;
  const storedHeadline = plan.funnel.headline || "";
  const storedSubheadline = plan.funnel.subheadline || "";
  const shouldUseOfferHero = Boolean(offer && !hasOfferSignal(`${storedHeadline} ${storedSubheadline}`, offer));
  const headline = shouldUseOfferHero
    ? `${offer} in ${plan.market}`
    : storedHeadline || (offer ? `${offer} in ${plan.market}` : `${plan.market} campaign preview`);
  const subheadline = shouldUseOfferHero
    ? `${offer} for ${plan.audience || "qualified prospects"} in ${plan.market}. See the stronger-fit path before wasting time on weak options.`
    : storedSubheadline ||
      (offer
        ? `${offer} for ${plan.audience || "qualified prospects"} without guessing what to do next.`
        : plan.summary);
  const cta = shouldUseOfferHero ? buildOfferCta(offer) : plan.funnel.cta || (offer ? buildOfferCta(offer) : "Request details");
  const formFields = (plan.funnel.formFields ?? ["name", "phone", "email"]).map((field) =>
    field.charAt(0).toUpperCase() + field.slice(1),
  );
  const sections = Array.isArray(plan.funnel.sections) ? plan.funnel.sections : [];
  type FunnelPreviewSection = (typeof sections)[number];

  function getSectionMedia(section: FunnelPreviewSection) {
    return section.media ?? null;
  }

  function getSectionShell(section: FunnelPreviewSection) {
    const spacing =
      section.style?.spacing === "compact"
        ? "px-5 py-5"
        : section.style?.spacing === "spacious"
          ? "px-8 py-9"
          : "px-6 py-7";
    const width =
      section.style?.width === "narrow"
        ? "max-w-2xl mx-auto"
        : section.style?.width === "content"
          ? "max-w-4xl mx-auto"
          : "";
    const align = section.style?.align === "center" ? "text-center" : "text-left";
    const themeClass =
      section.style?.theme === "dark"
        ? "border-white/8 bg-[#09111b] text-white"
        : section.style?.theme === "accent"
          ? "border-[#7ac8ff]/15 bg-[#d9f0ff] text-[#07121d]"
          : "border-black/8 bg-white text-[#111827]";

    return `rounded-[28px] border shadow-[0_20px_60px_-44px_rgba(0,0,0,0.2)] ${spacing} ${width} ${align} ${themeClass}`;
  }

  function renderSection(section: FunnelPreviewSection, index: number) {
    if (section.visible === false) {
      return null;
    }

    const media = getSectionMedia(section);
    const sectionKind = getPreviewSectionKind(section);

    if (section.type === "trust_bar") {
      return (
        <div key={section.id || `${section.type}-${index}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {section.content.map((item) => (
            <div key={item} className="rounded-[18px] border border-white/10 bg-[#09111b] px-4 py-3 text-sm text-white/78">
              {item}
            </div>
          ))}
        </div>
      );
    }

    if (sectionKind === "proof" || section.type === "market_snapshot") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">{section.type.replaceAll("_", " ")}</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {section.content.map((item) => (
              <div key={item} className="rounded-[22px] border border-black/8 bg-white p-5 shadow-[0_18px_48px_-38px_rgba(0,0,0,0.24)]">
                <p className="text-sm font-medium text-[#111827]">{item}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (section.type === "vsl") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">video block</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-black/50">
            {media?.url ? (
              <CustomerVideoPlayer
                src={media.url}
                title={section.title}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                videoClassName="aspect-video w-full bg-black object-cover"
              />
            ) : media?.thumbnailUrl ? (
              <div className="relative aspect-video w-full">
                <Image
                  src={media.thumbnailUrl}
                  alt={media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_28%),linear-gradient(135deg,#112338,#05080d)]" />
            )}
            <div className="px-5 py-4 text-sm text-white/72">
              {media?.caption || section.content[0] || "Add a short hosted video here."}
            </div>
          </div>
        </section>
      );
    }

    if (section.type === "image") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">image block</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-black/8 bg-white">
            {media?.url ? (
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={media.url}
                  alt={media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : media?.thumbnailUrl ? (
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={media.thumbnailUrl}
                  alt={media.label || section.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="aspect-[16/9] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_30%),linear-gradient(135deg,#77c7ff,#0c1829)]" />
            )}
            <div className="px-5 py-4 text-sm text-[#4b5563]">
              {media?.caption || section.content[0] || "Add branded or listing imagery here."}
            </div>
          </div>
        </section>
      );
    }

    if (sectionKind === "process") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">how it works</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {section.content.map((item, itemIndex) => (
              <div key={item} className="rounded-[20px] border border-black/8 bg-white/75 p-4">
                <div className="grid size-8 place-items-center rounded-full bg-[#74c7ff] text-sm font-semibold text-[#05111a]">
                  {itemIndex + 1}
                </div>
                <p className="mt-3 text-sm leading-7 text-[#4b5563]">{item}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (sectionKind === "faq") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">FAQ</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-5 space-y-3">
            {section.content.map((item) => {
              const parsed = splitPreviewFaqItem(item);

              return (
                <div key={item} className="rounded-[18px] border border-black/8 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-[#111827]">{parsed.question}</p>
                  {parsed.answer ? <p className="mt-2 text-sm leading-7 text-[#4b5563]">{parsed.answer}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (sectionKind === "compliance") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">compliance & fit</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-4 space-y-3">
            {section.content.map((item) => (
              <p key={item} className="text-sm leading-7 opacity-75">{item}</p>
            ))}
          </div>
        </section>
      );
    }

    if (section.type === "form" || section.type === "closing_cta") {
      return (
        <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8fc4ff]">
            {section.type === "form" ? "Conversion step" : "Final CTA"}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{section.title}</h3>
          <div className="mt-4 space-y-3">
            {section.content.map((item) => (
              <p key={item} className="text-sm leading-7 text-white/72">{item}</p>
            ))}
          </div>
          {section.type === "form" ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {formFields.map((field) => (
                <div
                  key={field}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65"
                >
                  {field}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-6 inline-flex rounded-full bg-[#74c7ff] px-6 py-3 text-sm font-semibold text-[#05111a]">
            {cta}
          </div>
        </section>
      );
    }

    return (
      <section key={section.id || `${section.type}-${index}`} className={getSectionShell(section)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
          {section.type.replaceAll("_", " ")}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#111827]">{section.title}</h3>
        <div className="mt-5 space-y-3">
          {section.content.map((item) => (
            <div key={item} className="flex gap-3">
              <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#74c7ff]" />
              <p className="text-sm leading-7 text-[#4b5563]">{item}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const visibleDetailSections = sections.filter((section) => section.visible !== false && section.type !== "hero");
  const renderedSections = compact ? visibleDetailSections.slice(0, 2) : visibleDetailSections;
  const directResponseLayout = visibleDetailSections.some((section) => getPreviewSectionKind(section) !== "content");

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[#eef3fb] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.68)]">
      <div className="border-b border-black/6 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
          <div className="h-3 w-3 rounded-full bg-[#ffd166]" />
          <div className="h-3 w-3 rounded-full bg-[#06d6a0]" />
        </div>
      </div>
      <div className={`border-b border-black/6 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_30%),linear-gradient(180deg,#08111e,#132338)] px-6 text-white sm:px-8 ${compact ? "py-7" : "py-10 lg:py-14"}`}>
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex rounded-full border border-[#ff8f3a]/30 bg-[#ff8f3a]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffb67d]">
            {plan.market} landing page
          </div>
          <div className={`grid gap-6 2xl:grid-cols-[1.15fr_0.85fr] 2xl:items-start ${compact ? "mt-4" : "mt-6 2xl:gap-10"}`}>
            <div>
              <h2 className={`font-semibold tracking-[-0.04em] ${compact ? "line-clamp-2 text-2xl sm:text-3xl" : "text-4xl sm:text-6xl"}`}>{headline}</h2>
              <p className={`max-w-2xl text-white/72 ${compact ? "mt-3 line-clamp-2 text-sm leading-6" : "mt-5 text-base leading-8"}`}>{subheadline}</p>
              <div className={`inline-flex rounded-full bg-[#ff8f3a] text-sm font-semibold text-[#111111] ${compact ? "mt-5 px-5 py-2.5" : "mt-7 px-6 py-3"}`}>
                {cta}
              </div>
            </div>
            <div className={`rounded-[26px] border border-white/10 bg-white/[0.08] backdrop-blur-sm ${compact ? "p-4" : "p-5"}`}>
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">Quick capture</p>
              <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : ""}`}>
                {formFields.slice(0, compact ? 4 : formFields.length).map((field) => (
                  <div
                    key={field}
                    className="rounded-[16px] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white/58"
                  >
                    {field}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-full bg-[#74c7ff] px-4 py-2.5 text-center text-sm font-semibold text-[#05111a]">
                {cta}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`mx-auto max-w-5xl space-y-4 px-6 sm:px-8 ${compact ? "py-6" : "py-8 sm:py-10"}`}>
        {renderedSections.map((section, index) => (
          <div key={section.id || `${section.type}-${index}`} className="space-y-4">
            {renderSection(section, index)}
            {!compact && directResponseLayout && index < renderedSections.length - 1 && index % 2 === 0 ? (
              <div className="rounded-[20px] border border-[#74c7ff]/20 bg-[#74c7ff]/10 px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                <p className="text-sm font-medium leading-6 text-[#07121d]">
                  Ready to see whether this is a fit? Start with the short form.
                </p>
                <div className="mt-4 rounded-full bg-[#74c7ff] px-5 py-3 text-center text-sm font-semibold text-[#05111a] sm:mt-0">
                  {cta}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
