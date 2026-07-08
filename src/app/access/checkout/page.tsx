import { AccessKeyCheckoutForm } from "@/components/access-keys/access-key-checkout-form";
import { isAccessKeyPublicCheckoutEnabled } from "@/lib/env";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AccessCheckoutPage() {
  if (!isAccessKeyPublicCheckoutEnabled()) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">DealFlow access</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Pay now, create your workspace next
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          Complete checkout first. After payment, DealFlow will show an access key you can use when creating your account.
        </p>
        <div className="mt-7">
          <AccessKeyCheckoutForm brandName="DealFlow" />
        </div>
      </section>
    </main>
  );
}
