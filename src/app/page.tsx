import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";

const proofPoints = [
  "Guided campaign builder",
  "Pre-paywall campaign preview",
  "Meta launch readiness gates",
  "Billing and generation-credit controls",
];

const productPillars = [
  {
    title: "Build",
    description: "Answer one campaign question at a time while DealFlow recommends the audience, offer, funnel, and creative direction.",
    icon: Sparkles,
  },
  {
    title: "Launch",
    description: "Keep billing, Meta connection, selected creative, funnel publishing, and budget approval behind explicit readiness gates.",
    icon: ShieldCheck,
  },
  {
    title: "Optimize",
    description: "Use dashboard signals, recommendations, value reports, and campaign health alerts to keep the campaign moving after launch.",
    icon: BarChart3,
  },
];

export default async function HomePage() {
  const partnerContext = await resolvePartnerContextFromHeaders();

  if (!partnerContext.nativeFallback && partnerContext.partnerStatus === "active" && partnerContext.verifiedDomain) {
    redirect("/start");
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <section className="df-container px-5 py-5 sm:px-6 lg:px-8">
        <nav className="flex min-w-0 items-center justify-between gap-4 rounded-df-panel border border-white/10 bg-white/[0.035] px-4 py-3 backdrop-blur-xl">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="DealFlow OS home">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-df-primary text-slate-950 shadow-df-button">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">DealFlow OS</span>
              <span className="block truncate text-xs uppercase tracking-[0.18em] text-white/45">
                Agent launch system
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard" prefetch={false}>
                <span className="hidden sm:inline">Open app</span>
                <span className="sm:hidden">App</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </nav>
      </section>

      <section className="df-container grid min-h-[calc(100vh-88px)] items-center gap-8 px-5 pb-14 pt-8 sm:px-6 lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,0.74fr)] lg:px-8 lg:pb-20">
        <div className="min-w-0">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.07] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
            <span className="system-status-dot" aria-hidden="true" />
            Public self-serve launch path
          </div>

          <h1 className="max-w-5xl text-balance text-5xl font-semibold text-white sm:text-6xl lg:text-7xl">
            Build, preview, and launch real estate campaigns without the agency drag.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
            DealFlow guides agents from campaign strategy to preview, checkout, Meta readiness, and post-launch optimization in one focused operating system.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/login?mode=sign-up&redirectedFrom=%2Fwelcome%3Ffresh%3D1" prefetch={false}>
                Start building
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/privacy">Review privacy</Link>
            </Button>
          </div>

          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            {proofPoints.map((point) => (
              <div key={point} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/78">
                <CheckCircle2 className="size-4 shrink-0 text-cyan-200" aria-hidden="true" />
                <span className="truncate">{point}</span>
              </div>
            ))}
          </div>
        </div>

        <Card className="min-w-0 p-5 sm:p-6">
          <div className="rounded-df-panel border border-white/10 bg-[#040914]/85 p-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-rose-300/80" />
                <span className="size-3 rounded-full bg-amber-300/80" />
                <span className="size-3 rounded-full bg-emerald-300/80" />
              </div>
              <span className="truncate rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
                Campaign workspace
              </span>
            </div>

            <div className="space-y-4 pt-5">
              <div className="rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.055] p-4">
                <p className="df-eyebrow text-cyan-100/75">Recommended campaign</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Buyer campaign preview
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Curated home shortlist, compact funnel, selected creative set, and launch readiness all stay connected.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {productPillars.map((pillar) => {
                  const Icon = pillar.icon;

                  return (
                    <div key={pillar.title} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <div className="mb-4 grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-cyan-100">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-base font-semibold text-white">{pillar.title}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/62">{pillar.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm leading-6 text-emerald-50/80">
                Live launch remains blocked until billing, Meta selection, selected creative, funnel publishing, and budget confirmation pass.
              </div>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
