import { notFound } from "next/navigation";
import { AccessKeyCheckoutForm } from "@/components/access-keys/access-key-checkout-form";
import { buildPartnerPageMetadata } from "@/lib/white-label/metadata";
import { resolvePartnerContextBySlug } from "@/lib/white-label/resolver";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}): Promise<Metadata> {
  const { partnerSlug } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug);

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    return {};
  }

  return buildPartnerPageMetadata(partnerContext, {
    title: `${partnerContext.branding.brandName} Checkout`,
  });
}

export default async function PartnerCheckoutPage({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}) {
  const { partnerSlug } = await params;
  const partnerContext = await resolvePartnerContextBySlug(partnerSlug);

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        {partnerContext.branding.logoUrl ? (
          <div className="mb-5 flex max-h-14 max-w-[220px] items-center rounded-2xl border border-white/10 bg-black/25 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- Partner logos are runtime-configured URLs. */}
            <img
              src={partnerContext.branding.logoUrl}
              alt={`${partnerContext.branding.brandName} logo`}
              className="max-h-9 max-w-[180px] object-contain"
            />
          </div>
        ) : null}
        <p className="df-eyebrow">{partnerContext.branding.brandName} access</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Pay now, create your workspace next
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          Complete checkout first. After payment, you will receive an access key for account creation.
        </p>
        <div className="mt-7">
          <AccessKeyCheckoutForm
            partnerSlug={partnerContext.partnerSlug}
            brandName={partnerContext.branding.brandName}
          />
        </div>
      </section>
    </main>
  );
}
