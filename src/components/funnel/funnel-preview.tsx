"use client";

import Image from "next/image";
import type { CampaignPlan, ExpectedOutcomes } from "@/lib/services/campaign-plan-service";

type FunnelPreviewProps = {
  plan: CampaignPlan;
  expectedOutcomes: ExpectedOutcomes;
  strategyWhy: string[];
};

export function FunnelPreview({ plan, expectedOutcomes: _expectedOutcomes, strategyWhy: _strategyWhy }: FunnelPreviewProps) {
  void _expectedOutcomes;
  void _strategyWhy;

  const headline = plan.funnel.headline || "Campaign headline unavailable";
  const subheadline = plan.funnel.subheadline || "Campaign subheadline unavailable";
  const cta = plan.funnel.cta || "Campaign CTA unavailable";
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

    if (section.type === "proof_metrics" || section.type === "market_snapshot") {
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
              <video
                src={media.url}
                controls
                poster={media?.thumbnailUrl ?? undefined}
                className="aspect-video w-full bg-black object-cover"
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

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[#eef3fb] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.68)]">
      <div className="border-b border-black/6 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
          <div className="h-3 w-3 rounded-full bg-[#ffd166]" />
          <div className="h-3 w-3 rounded-full bg-[#06d6a0]" />
        </div>
      </div>
      <div className="border-b border-black/6 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_30%),linear-gradient(180deg,#08111e,#132338)] px-6 py-10 text-white sm:px-8 lg:py-14">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex rounded-full border border-[#ff8f3a]/30 bg-[#ff8f3a]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffb67d]">
            {plan.market} landing page
          </div>
          <div className="mt-6 grid gap-10 2xl:grid-cols-[1.15fr_0.85fr] 2xl:items-start">
            <div>
              <h2 className="text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">{headline}</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/72">{subheadline}</p>
              <div className="mt-7 inline-flex rounded-full bg-[#ff8f3a] px-6 py-3 text-sm font-semibold text-[#111111]">
                {cta}
              </div>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-white/[0.08] p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">Quick capture</p>
              <div className="mt-4 space-y-3">
                {formFields.map((field) => (
                  <div
                    key={field}
                    className="rounded-[16px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/58"
                  >
                    {field}
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-full bg-[#74c7ff] px-4 py-3 text-center text-sm font-semibold text-[#05111a]">
                {cta}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 sm:px-8 sm:py-10">
        {sections.map(renderSection)}
      </div>
    </div>
  );
}
