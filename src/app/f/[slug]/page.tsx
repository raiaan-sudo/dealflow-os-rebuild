import { notFound, redirect } from "next/navigation";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";
import { getCampaignEntitlementsForOrganization } from "@/lib/services/campaign-entitlements";
import { cn } from "@/lib/utils";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

export const dynamic = "force-dynamic";

const LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS: Record<string, string> = {
  "raiaan-realty": "raiaan-broker-toronto-on-ccbfbfce",
};

type PublicFunnelSection = FullCampaignRecord["funnel"]["sections"][number] & {
  type: string;
  variant?: string;
  title: string;
  content: string[];
};

const DIRECT_RESPONSE_SIGNAL =
  /direct|response|offer|signal|proof|metric|case|authority|problem|mechanism|process|step|objection|risk|faq|question|capture|qualification|consultation|urgency|compliance|consent|privacy|terms|message|match/i;

function sectionText(section: PublicFunnelSection) {
  return `${section.type} ${section.variant ?? ""} ${section.title}`.toLowerCase();
}

function isDirectResponseSection(section: PublicFunnelSection) {
  return DIRECT_RESPONSE_SIGNAL.test(sectionText(section));
}

function getSectionKind(section: PublicFunnelSection) {
  const text = sectionText(section);

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

function splitFaqItem(item: string) {
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

function RepeatedCta({ cta }: { cta: string }) {
  return (
    <div className="rounded-[20px] border border-primary/20 bg-primary/[0.08] px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
      <p className="text-sm font-medium leading-6 text-white/78">
        Ready to see whether this is a fit? Start with the short form.
      </p>
      <a
        className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:mt-0 sm:w-auto"
        href="#lead-capture"
      >
        {cta}
      </a>
    </div>
  );
}

function RenderPublicSection({
  section,
  index,
  cta,
  directResponseLayout,
}: {
  section: PublicFunnelSection;
  index: number;
  cta: string;
  directResponseLayout: boolean;
}) {
  const key = section.id ?? `${section.type}-${section.title}-${index}`;
  const kind = getSectionKind(section);
  const label = kind === "process" ? "How it works" : kind === "compliance" ? "Compliance" : section.type.replaceAll("_", " ");
  const content = section.content.filter(Boolean);
  const baseShell =
    "rounded-[24px] border p-5 shadow-[0_22px_70px_-52px_rgba(0,0,0,0.9)] sm:p-6";
  const lightShell = "border-white/10 bg-white/[0.055]";

  if (kind === "trust") {
    return (
      <section key={key} className="grid gap-3 sm:grid-cols-3">
        {content.map((item, itemIndex) => (
          <div
            key={`${key}-trust-${itemIndex}`}
            className="rounded-[18px] border border-primary/18 bg-primary/[0.08] px-4 py-3 text-sm font-medium leading-6 text-white/82"
          >
            {item}
          </div>
        ))}
      </section>
    );
  }

  if (kind === "proof") {
    return (
      <section key={key} className={cn(baseShell, "border-primary/18 bg-primary/[0.07]")}>
        <p className="text-xs font-semibold uppercase text-primary/85">{label}</p>
        <h2 className="mt-3 break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {content.map((item, itemIndex) => (
            <div key={`${key}-proof-${itemIndex}`} className="rounded-[18px] border border-white/10 bg-black/18 p-4">
              <p className="break-words text-sm font-medium leading-6 text-white/82 [overflow-wrap:anywhere]">{item}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (kind === "process") {
    return (
      <section key={key} className={cn(baseShell, lightShell)}>
        <p className="text-xs font-semibold uppercase text-primary/85">How it works</p>
        <h2 className="mt-3 break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {content.map((item, itemIndex) => (
            <div key={`${key}-step-${itemIndex}`} className="rounded-[18px] border border-white/10 bg-black/16 p-4">
              <div className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {itemIndex + 1}
              </div>
              <p className="mt-3 break-words text-sm leading-7 text-white/74 [overflow-wrap:anywhere]">{item}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (kind === "faq") {
    return (
      <section key={key} className={cn(baseShell, lightShell)}>
        <p className="text-xs font-semibold uppercase text-primary/85">FAQ</p>
        <h2 className="mt-3 break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
        <div className="mt-5 space-y-3">
          {content.map((item, itemIndex) => {
            const parsed = splitFaqItem(item);

            return (
              <details
                key={`${key}-faq-${itemIndex}`}
                className="group rounded-[18px] border border-white/10 bg-black/16 p-4"
                open={itemIndex === 0}
              >
                <summary className="cursor-pointer list-none break-words text-sm font-semibold leading-6 text-white [overflow-wrap:anywhere]">
                  {parsed.question}
                </summary>
                {parsed.answer ? (
                  <p className="mt-3 break-words text-sm leading-7 text-white/68 [overflow-wrap:anywhere]">{parsed.answer}</p>
                ) : null}
              </details>
            );
          })}
        </div>
      </section>
    );
  }

  if (kind === "compliance") {
    return (
      <section key={key} className="rounded-[20px] border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs font-semibold uppercase text-primary/85">Compliance & fit</p>
        <h2 className="mt-3 break-words text-xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
        <div className="mt-4 space-y-3">
          {content.map((item, itemIndex) => (
            <p key={`${key}-compliance-${itemIndex}`} className="break-words text-sm leading-7 text-white/66 [overflow-wrap:anywhere]">
              {item}
            </p>
          ))}
        </div>
      </section>
    );
  }

  if (kind === "conversion") {
    return (
      <section key={key} className={cn(baseShell, "border-primary/20 bg-primary/[0.09]")}>
        <p className="text-xs font-semibold uppercase text-primary/85">Next step</p>
        <h2 className="mt-3 break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
        <div className="mt-4 space-y-3">
          {content.map((item, itemIndex) => (
            <p key={`${key}-conversion-${itemIndex}`} className="break-words text-sm leading-7 text-white/74 [overflow-wrap:anywhere]">
              {item}
            </p>
          ))}
        </div>
        <a
          className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:w-auto"
          href="#lead-capture"
        >
          {cta}
        </a>
      </section>
    );
  }

  return (
    <section key={key} className={cn(baseShell, directResponseLayout ? lightShell : "border-white/8 bg-white/[0.03]")}>
      <p className="text-xs font-semibold uppercase text-primary/85">{label}</p>
      <h2 className="mt-3 break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
      <div className="mt-4 space-y-3">
        {content.map((item, itemIndex) => (
          <p key={`${key}-content-${itemIndex}`} className="break-words text-sm leading-7 text-white/72 [overflow-wrap:anywhere]">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS[resolvedParams.slug.toLowerCase()];

  if (redirectSlug) {
    redirect(`/f/${redirectSlug}`);
  }

  const record = await getPublishedCampaignBySlug(resolvedParams.slug).catch(() => null);
  const metaPixelId = record?.campaign.organization_id
    ? await getMetaPixelIdForOrganization(record.campaign.organization_id)
    : null;

  if (!record) {
    notFound();
  }

  const organizationId = record.campaign.organization_id ?? null;
  const entitlements = organizationId
    ? await getCampaignEntitlementsForOrganization({
        organizationId,
        campaignId: record.campaign.id,
        userId: record.campaign.user_id,
      }).catch(() => null)
    : null;
  const leadCaptureActive = entitlements?.canCaptureLeads !== false;
  const visibleSections = record.funnel.sections.filter((section) => section.visible !== false) as PublicFunnelSection[];
  const heroSections = visibleSections.filter((section) => section.type === "hero");
  const detailSections = visibleSections.filter((section) => section.type !== "hero");
  const directResponseLayout = detailSections.some(isDirectResponseSection);
  const heroSupport = heroSections.flatMap((section) => section.content).find((item) => !/^primary cta:/i.test(item));
  const cta = record.funnel.cta || "Submit";

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(122,200,255,0.14),transparent_28%),linear-gradient(180deg,#030712,#07111d_42%,#030712)] px-5 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto w-full max-w-[1120px]">
        <section className="grid gap-6 rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_28px_100px_-70px_rgba(0,0,0,0.9)] sm:p-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
          <div className="min-w-0 pt-1 lg:pt-5">
            <p className="text-xs font-semibold uppercase text-primary/80">
              {record.campaign.name}
            </p>
            <h1 className="mt-4 break-words text-3xl font-semibold leading-tight text-white [overflow-wrap:anywhere] sm:text-5xl">
              {record.funnel.headline}
            </h1>
            <p className="mt-4 line-clamp-3 max-w-[720px] break-words text-base leading-7 text-white/76 [overflow-wrap:anywhere] sm:text-lg sm:leading-8 lg:line-clamp-none">
              {record.funnel.subheadline}
            </p>
            {heroSupport && heroSupport !== record.funnel.subheadline ? (
              <p className="mt-4 hidden max-w-[680px] break-words text-sm leading-7 text-white/62 [overflow-wrap:anywhere] sm:block">
                {heroSupport}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:w-auto"
                href="#lead-capture"
              >
                {cta}
              </a>
              {directResponseLayout ? (
                <span className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
                  Proof, process, FAQ, and fit details below
                </span>
              ) : null}
            </div>
          </div>

          <div id="lead-capture" className="w-full scroll-mt-6 lg:sticky lg:top-6">
            {leadCaptureActive ? (
              <LeadCaptureForm
                campaignId={record.campaign.id}
                funnelSlug={record.publish.slug ?? resolvedParams.slug}
                formFields={record.funnel.form_fields ?? []}
                cta={cta}
                metaPixelId={metaPixelId}
              />
            ) : (
              <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
                <p className="text-xs font-semibold uppercase text-primary/80">
                  Campaign paused
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  This campaign is not accepting leads right now.
                </h2>
                <p className="text-sm leading-6 text-white/70">
                  The agent needs to reactivate DealFlow billing before this funnel can collect
                  new inquiries.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {detailSections.map((section, index) => (
            <div key={section.id ?? `${section.type}-${section.title}-${index}`} className="space-y-4">
              <RenderPublicSection
                cta={cta}
                directResponseLayout={directResponseLayout}
                index={index}
                section={section}
              />
              {directResponseLayout && index < detailSections.length - 1 && getSectionKind(section) !== "trust" && index % 2 === 0 ? (
                <RepeatedCta cta={cta} />
              ) : null}
            </div>
          ))}
          {directResponseLayout && detailSections.length > 0 ? <RepeatedCta cta={cta} /> : null}
        </div>
      </div>
    </main>
  );
}
