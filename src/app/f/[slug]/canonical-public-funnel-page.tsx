import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { CANONICAL_PUBLIC_FORM_ID } from "@/lib/public-funnel/constants";
import type { CanonicalPublicFunnel } from "@/lib/public-funnel/types";

type CanonicalPublicFunnelPageProps = {
  funnel: CanonicalPublicFunnel;
};

export function CanonicalPublicFunnelPage({ funnel }: CanonicalPublicFunnelPageProps) {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-full flex-col gap-8 overflow-x-hidden px-5 py-10 lg:max-w-[1120px] lg:flex-row lg:items-start lg:px-6"
      data-public-funnel-preset={funnel.presetVersion}
    >
      <div className="min-w-0 flex-1 space-y-7 [overflow-wrap:anywhere]">
        <header className="space-y-5">
          <p className="break-words text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {funnel.hero.eyebrow}
          </p>
          <h1 className="max-w-[760px] break-words text-[28px] font-semibold leading-[1.16] tracking-normal text-white sm:text-4xl md:text-5xl">
            {funnel.hero.headline}
          </h1>
          <p className="max-w-[720px] break-words text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
            {funnel.hero.subheadline}
          </p>
          <a
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-92"
            href={`#${CANONICAL_PUBLIC_FORM_ID}`}
          >
            {funnel.hero.primaryCta}
          </a>
        </header>

        <section aria-label="Campaign highlights" className="grid gap-3 sm:grid-cols-3">
          {funnel.trust.items.map((item) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/78"
              key={item.label}
            >
              {item.label}
            </div>
          ))}
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="break-words text-lg font-semibold text-white sm:text-xl">{funnel.offerCard.headline}</h2>
          <p className="mt-3 break-words text-sm leading-7 text-white/72">{funnel.offerCard.description}</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/72">
            {funnel.offerCard.bullets.map((item) => (
              <li className="flex gap-2" key={item}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="break-words text-lg font-semibold text-white sm:text-xl">{funnel.valueStack.headline}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {funnel.valueStack.metrics.map((metric) => (
              <div className="rounded-xl border border-white/8 bg-black/12 p-4" key={`${metric.value}-${metric.label}`}>
                <p className="break-words text-2xl font-semibold text-white">{metric.value}</p>
                <p className="mt-1 break-words text-xs uppercase tracking-[0.16em] text-white/55">{metric.label}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/72">
            {funnel.valueStack.bullets.map((item) => (
              <li className="flex gap-2" key={item}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="break-words text-lg font-semibold text-white sm:text-xl">{funnel.qualification.headline}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {funnel.qualification.steps.map((step, index) => (
              <div className="rounded-xl border border-white/8 bg-black/12 p-4" key={step.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 break-words text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 break-words text-sm leading-6 text-white/68">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="break-words text-lg font-semibold text-white sm:text-xl">{funnel.expectations.headline}</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/72">
            {funnel.expectations.bullets.map((item) => (
              <li className="flex gap-2" key={item}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside
        className="w-full max-w-full shrink-0 scroll-mt-6 sm:max-w-[380px] lg:sticky lg:top-8"
        id={CANONICAL_PUBLIC_FORM_ID}
      >
        <LeadCaptureForm
          campaignId={funnel.campaignId}
          cta={funnel.form.cta}
          formFields={funnel.form.fields}
          funnelSlug={funnel.slug}
          metaPixelId={funnel.tracking.metaPixelId}
          organizationId={funnel.organizationId}
          presetVersion={funnel.presetVersion}
        />
      </aside>
    </main>
  );
}
