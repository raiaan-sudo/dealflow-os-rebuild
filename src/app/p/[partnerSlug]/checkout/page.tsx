import { AccessKeyCheckoutForm } from "@/components/access-keys/access-key-checkout-form";
import { isAccessKeyPublicCheckoutEnabled } from "@/lib/env";
import { loadPublicPartnerCheckout } from "@/lib/services/access-key-service";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";

const resolvePartnerCheckout = cache(loadPublicPartnerCheckout);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}): Promise<Metadata> {
  if (!isAccessKeyPublicCheckoutEnabled()) {
    notFound();
  }

  const { partnerSlug } = await params;
  const partner = await resolvePartnerCheckout(partnerSlug);
  if (!partner) {
    notFound();
  }

  return {
    title: `${partner.brandName} Checkout`,
  };
}

export default async function PartnerCheckoutPage({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}) {
  if (!isAccessKeyPublicCheckoutEnabled()) {
    notFound();
  }

  const { partnerSlug } = await params;
  const partner = await resolvePartnerCheckout(partnerSlug);
  if (!partner) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">{partner.brandName} access</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Pay now, create your workspace next
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          Complete checkout first. After payment, you will receive an access key for account creation.
        </p>
        <div className="mt-7">
          <AccessKeyCheckoutForm
            partnerSlug={partner.slug}
            brandName={partner.brandName}
          />
        </div>
      </section>
    </main>
  );
}
