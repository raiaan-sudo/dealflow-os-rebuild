import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { normalizeWinningFunnelTheme } from "@/lib/funnels/winning-template/theme";
import type { WinningFunnelBlueprint } from "@/lib/funnels/winning-template/schema";
import { cn } from "@/lib/utils";

type CanonicalFunnelRendererProps = {
  funnel: WinningFunnelBlueprint;
  campaignName?: string | null;
  market?: string | null;
  brandLabel?: string | null;
  mode?: "public" | "preview";
  compact?: boolean;
  leadCaptureSlot?: ReactNode;
  className?: string;
};

type CanonicalSection = WinningFunnelBlueprint["sections"][number] & {
  type: string;
  variant?: string;
  title: string;
  content: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value.trim() : null;
  } catch {
    return null;
  }
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function getAgent(funnel: WinningFunnelBlueprint) {
  const agent = asRecord(funnel.agent);

  return {
    name: text(agent.name),
    brokerageName: text(agent.brokerageName ?? agent.brokerage_name),
    phone: text(agent.phone),
    email: text(agent.email),
  };
}

function getCssVars(funnel: WinningFunnelBlueprint) {
  const rawTheme = asRecord(funnel.theme);
  const theme = normalizeWinningFunnelTheme({
    ...rawTheme,
    logoUrl: safeUrl(rawTheme.logoUrl),
    agentPhotoUrl: safeUrl(rawTheme.agentPhotoUrl),
  });

  return {
    theme,
    style: {
      "--funnel-primary": theme.primaryColor,
      "--funnel-secondary": theme.secondaryColor,
      "--funnel-accent": theme.accentColor,
    } as CSSProperties,
  };
}

function getVisibleSections(funnel: WinningFunnelBlueprint) {
  return funnel.sections.filter((section) => section.visible !== false) as CanonicalSection[];
}

function getHeroSupport(funnel: WinningFunnelBlueprint) {
  if (text(funnel.subheadline)) return funnel.subheadline;

  const hero = getVisibleSections(funnel).find((section) => section.type === "hero");
  const support = hero?.content.find((item) => !/^primary cta:/i.test(item) && item !== funnel.headline && !/ · /.test(item));
  return text(support) && support !== funnel.subheadline ? support : funnel.subheadline;
}

function getMicroLabel(params: {
  funnel: WinningFunnelBlueprint;
  campaignName?: string | null;
  market?: string | null;
}) {
  const trustSection = getVisibleSections(params.funnel).find((section) => section.type === "trust_bar");
  const hero = getVisibleSections(params.funnel).find((section) => section.type === "hero");
  const fromTrust = text(trustSection?.title);
  const fromHero = hero?.content.find((item) => / · /.test(item));
  const fallback = [params.market || params.campaignName || "Local market", "free", "no obligation"].filter(Boolean).join(" · ");

  return (fromTrust || fromHero || fallback).toUpperCase();
}

function getTrustBullets(funnel: WinningFunnelBlueprint) {
  const trustSection = getVisibleSections(funnel).find((section) => section.type === "trust_bar");
  const bullets = Array.isArray(funnel.proofBadges) && funnel.proofBadges.length > 0 ? funnel.proofBadges : trustSection?.content;
  const values = (bullets ?? ["100% Free", "No Obligation", "Personalized Options", "Local Guidance"])
    .map((item) => text(item))
    .filter(Boolean);

  return values.slice(0, 4);
}

function getLegalCopy(funnel: WinningFunnelBlueprint) {
  const legal = getVisibleSections(funnel).find((section) => section.type === "objections" || section.variant === "reference-minimal-legal");
  return legal?.content.map((item) => text(item)).filter(Boolean).slice(0, 1) ?? [];
}

function getFormCopy(funnel: WinningFunnelBlueprint) {
  if (funnel.language === "fr") {
    return {
      eyebrow: "Commencer",
      labels: ["Nom", "Courriel", "Numéro de téléphone"],
    };
  }

  if (funnel.language === "es") {
    return {
      eyebrow: "Comenzar",
      labels: ["Nombre", "Correo electrónico", "Número de teléfono"],
    };
  }

  return {
    eyebrow: "Get Started",
    labels: ["Name", "Email", "Phone Number"],
  };
}

function ReferenceOptInPreviewCard({
  cta,
  compact = false,
  eyebrow,
  labels,
}: {
  cta: string;
  compact?: boolean;
  eyebrow: string;
  labels: string[];
}) {
  return (
    <div className={cn(
      "rounded-[26px] border border-[#dfd5c8] bg-[#fffdf9] shadow-[0_24px_80px_-54px_rgba(28,43,58,0.48)]",
      compact ? "p-4" : "p-5 sm:p-6",
    )}>
      <p className={cn("text-center font-semibold uppercase tracking-[0.22em] text-[var(--funnel-accent)]", compact ? "text-[9px]" : "text-[11px]")}>
        {eyebrow}
      </p>
      <div className={cn(compact ? "mt-3 space-y-2" : "mt-5 space-y-3")}>
        {labels.map((label) => (
          <div key={label} className={cn(
            "rounded-2xl border border-[#d8ccbd] bg-[#f8f2ea] px-4 text-[#6f6256]",
            compact ? "h-9 py-2 text-xs" : "h-12 py-3 text-sm",
          )}>
            {label}
          </div>
        ))}
      </div>
      <div className={cn(
        "flex items-center justify-center rounded-2xl bg-[var(--funnel-accent)] px-4 font-semibold text-white",
        compact ? "mt-3 h-9 text-xs" : "mt-5 h-12 text-sm",
      )}>
        {cta}
      </div>
    </div>
  );
}

export function CanonicalFunnelRenderer({
  funnel,
  campaignName,
  market,
  brandLabel,
  mode = "public",
  compact = false,
  leadCaptureSlot,
  className,
}: CanonicalFunnelRendererProps) {
  const { theme, style } = getCssVars(funnel);
  const agent = getAgent(funnel);
  const resolvedBrand = brandLabel || agent.brokerageName || agent.name || "Local real estate team";
  const cta = funnel.cta || "Get My Custom List";
  const support = getHeroSupport(funnel);
  const microLabel = getMicroLabel({ funnel, campaignName, market });
  const trustBullets = getTrustBullets(funnel);
  const legalCopy = getLegalCopy(funnel);
  const formCopy = getFormCopy(funnel);
  const wrapperClass =
    mode === "preview"
      ? "overflow-hidden rounded-[28px] border border-[#e6dccd] shadow-[0_28px_90px_-48px_rgba(28,43,58,0.32)]"
      : "min-h-screen";
  const previewChromeClass = compact
    ? "mb-3 max-w-[420px] rounded-[14px] px-2 py-1.5"
    : "mb-5 max-w-[760px] rounded-[18px] px-3 py-2.5";
  const brandInitials = resolvedBrand
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <main
      className={cn(
        wrapperClass,
        "px-4 py-6 text-[#1c2b3a] sm:px-6",
        compact ? "max-h-[430px] overflow-hidden px-3 py-4" : "lg:py-10",
        className,
      )}
      style={{
        ...style,
        background: "var(--funnel-secondary)",
      }}
    >
      <div className={cn(
        "mx-auto flex w-full flex-col items-center justify-center",
        compact ? "min-h-0 max-w-[460px]" : "min-h-[calc(100vh-48px)] max-w-[920px]",
      )}>
        {mode === "preview" ? (
          <div className={cn("flex w-full items-center gap-2 border border-[#e5dacb] bg-white/60", previewChromeClass)}>
            <span className={cn("rounded-full bg-rose-300/70", compact ? "size-1.5" : "size-2.5")} />
            <span className={cn("rounded-full bg-amber-300/70", compact ? "size-1.5" : "size-2.5")} />
            <span className={cn("rounded-full bg-emerald-300/70", compact ? "size-1.5" : "size-2.5")} />
            <span className={cn(
              "ml-2 truncate rounded-full border border-[#eadfce] bg-[#fbf7ef] text-[#817262]",
              compact ? "px-2 py-0.5 text-[8px]" : "px-3 py-1 text-[11px]",
            )}>
              canonical reference opt-in / {market || "market"}
            </span>
          </div>
        ) : null}

        <section className={cn("w-full text-center", compact ? "py-2" : "py-8 sm:py-10")}>
          <div className={cn("mx-auto flex w-full justify-center", compact ? "max-w-[180px]" : "max-w-[260px]")}>
            {theme.logoUrl ? (
              <Image
                alt={`${resolvedBrand} logo`}
                className={cn("object-contain", compact ? "max-h-9 max-w-[150px]" : "max-h-14 max-w-[210px]")}
                height={56}
                src={theme.logoUrl}
                unoptimized
                width={210}
              />
            ) : (
              <div className="inline-flex items-center gap-3 rounded-full border border-[#e2d6c7] bg-white/68 px-4 py-2 shadow-[0_16px_40px_-34px_rgba(28,43,58,0.45)]">
                <span className="grid size-8 place-items-center rounded-full bg-[var(--funnel-primary)] text-xs font-semibold text-white">
                  {brandInitials || "RE"}
                </span>
                <span className="max-w-[180px] truncate text-sm font-semibold text-[#1c2b3a]">{resolvedBrand}</span>
              </div>
            )}
          </div>

          <p className={cn(
            "mx-auto max-w-[760px] font-semibold uppercase text-[var(--funnel-accent)]",
            compact ? "mt-4 text-[8px] tracking-[0.22em]" : "mt-8 text-[11px] tracking-[0.28em] sm:text-xs",
          )}>
            {microLabel}
          </p>

          <h1
            className={cn(
              "mx-auto break-words font-semibold leading-[0.98] tracking-normal text-[#142437] [overflow-wrap:anywhere]",
              compact ? "mt-3 max-w-[380px] text-[1.55rem] sm:text-[1.75rem]" : "mt-5 max-w-[820px] text-4xl sm:text-6xl lg:text-7xl",
            )}
          >
            {funnel.headline}
          </h1>

          <p className={cn(
            "mx-auto break-words text-[#665d53] [overflow-wrap:anywhere]",
            compact ? "mt-3 line-clamp-2 max-w-[360px] text-xs leading-5" : "mt-5 max-w-[680px] text-base leading-7 sm:text-lg sm:leading-8",
          )}>
            {support}
          </p>

          <div className={cn(
            "mx-auto flex max-w-[760px] flex-wrap items-center justify-center font-medium text-[#4d443b]",
            compact ? "mt-4 gap-x-3 gap-y-1 text-[11px]" : "mt-6 gap-x-4 gap-y-2 text-sm",
          )}>
            {trustBullets.map((item, index) => (
              <div key={`${item}-${index}`} className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[var(--funnel-accent)]" />
                <span>{titleCase(item)}</span>
              </div>
            ))}
          </div>

          <div id="lead-capture" className={cn("mx-auto w-full scroll-mt-6", compact ? "mt-4 max-w-[300px]" : "mt-7 max-w-[420px]")}>
            {leadCaptureSlot ?? (
              <ReferenceOptInPreviewCard
                compact={compact}
                cta={cta}
                eyebrow={formCopy.eyebrow}
                labels={formCopy.labels}
              />
            )}
          </div>

          <footer className={cn("mx-auto max-w-[620px] text-xs leading-6 text-[#796d60]", compact ? "mt-4 hidden" : "mt-7")}>
            {legalCopy.map((item, index) => (
              <p key={`${index}-${item}`}>{item}</p>
            ))}
            <p className="mt-2 font-medium text-[#1c2b3a]">
              {[resolvedBrand, agent.name].filter(Boolean).join(" · ")}
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
