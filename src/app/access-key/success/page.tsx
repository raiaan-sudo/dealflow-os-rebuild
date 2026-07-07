import Link from "next/link";
import { AccessKeyRevealPanel } from "@/components/access-keys/access-key-reveal-panel";
import { loadAccessKeyCheckoutSuccess } from "@/lib/services/access-key-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccessKeySuccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";
  const result = sessionId ? await loadAccessKeyCheckoutSuccess(sessionId).catch(() => null) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">Checkout complete</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Your access key is ready
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/68">
          Use this key on the create account screen. Once claimed, it links this paid Stripe subscription to your DealFlow workspace.
        </p>

        <div className="mt-7">
          {result?.rawKey ? (
            <AccessKeyRevealPanel accessKey={result.rawKey} />
          ) : (
            <div className="space-y-5">
              <div className="rounded-df-panel border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                Checkout is not ready to reveal an access key yet. If payment just completed, refresh this page after Stripe finishes confirmation.
              </div>
              <Link
                href="/access/checkout"
                className="inline-flex h-12 w-full items-center justify-center rounded-df-control bg-df-primary px-5 text-base font-semibold text-slate-950 shadow-df-button transition hover:-translate-y-0.5"
              >
                Return to checkout
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
