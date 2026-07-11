import Link from "next/link";
import { cookies } from "next/headers";
import { AccessKeyRevealPanel } from "@/components/access-keys/access-key-reveal-panel";
import { loadAccessKeyCheckoutSuccess } from "@/lib/services/access-key-service";
import { getAccessKeyRevealCookieName } from "@/lib/access-key-reveal-cookie";
import { getAccessKeySuccessTruthState } from "@/lib/access-key-success-truth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccessKeySuccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";
  const revealVerifier = sessionId
    ? (await cookies()).get(getAccessKeyRevealCookieName(sessionId))?.value ?? null
    : null;
  const result =
    sessionId && revealVerifier
      ? await loadAccessKeyCheckoutSuccess(sessionId, revealVerifier).catch(() => null)
      : null;
  const verifiedHandoff =
    result?.rawKey && result.deliveryToken && result.stripeCheckoutSessionId
      ? {
          accessKey: result.rawKey,
          deliveryToken: result.deliveryToken,
          sessionId: result.stripeCheckoutSessionId,
        }
      : null;
  const truth = getAccessKeySuccessTruthState({
    checkoutVerified: result !== null,
    keyAvailable: verifiedHandoff !== null,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">{truth.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{truth.title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/68">{truth.description}</p>

        <div className="mt-7">
          {verifiedHandoff ? (
            <AccessKeyRevealPanel
              accessKey={verifiedHandoff.accessKey}
              deliveryToken={verifiedHandoff.deliveryToken}
              sessionId={verifiedHandoff.sessionId}
            />
          ) : (
            <div className="space-y-5">
              <div className="rounded-df-panel border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                {truth.notice}
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
