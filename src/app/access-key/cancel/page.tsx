import Link from "next/link";

export default function AccessKeyCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-10 sm:px-6">
      <section className="surface-guided w-full rounded-df-panel border border-white/10 p-6 shadow-df-elevated sm:p-8">
        <p className="df-eyebrow">Checkout cancelled</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          No access key was issued
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/68">
          You can restart checkout or create an account without a key and use the normal DealFlow onboarding paywall.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href="/access/checkout"
            className="inline-flex h-12 items-center justify-center rounded-df-control bg-df-primary px-5 text-base font-semibold text-slate-950 shadow-df-button transition hover:-translate-y-0.5"
          >
            Restart checkout
          </Link>
          <Link
            href="/login?mode=sign-up"
            className="inline-flex h-12 items-center justify-center rounded-df-control border border-white/10 bg-white/[0.05] px-5 text-base font-semibold text-white transition hover:border-cyan-300/35"
          >
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
