import { AccessKeyCheckoutForm } from "@/components/access-keys/access-key-checkout-form";
import { isAccessKeyPublicCheckoutEnabled } from "@/lib/env";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatPartnerName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ partnerSlug: string }>;
}): Promise<Metadata> {
  const { partnerSlug } = await params;

  return {
    title: `${formatPartnerName(partnerSlug)} Checkout`,
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
  const brandName = formatPartnerName(partnerSlug);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">{brandName} access</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Pay now, create your workspace next
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          Complete checkout first. After payment, you will receive an access key for account creation.
        </p>
        <div className="mt-7">
          <AccessKeyCheckoutForm
            partnerSlug={partnerSlug}
            brandName={brandName}
          />
        </div>
      </section>
    </main>
  );
}
