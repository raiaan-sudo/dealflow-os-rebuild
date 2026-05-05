"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  CircuitBoard,
  Gauge,
  Layers3,
  LockKeyhole,
  Megaphone,
  MousePointer2,
  Radar,
  Rocket,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { BILLING_PLANS, type BillingPlanTier } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const signupHref = "/login?mode=sign-up";

const navItems = [
  { label: "System", href: "#system" },
  { label: "Install", href: "#install" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
];

const liveMetrics = [
  { label: "Campaign assets", value: 18, suffix: "", detail: "Funnel, ads, copy, routing" },
  { label: "Launch checks", value: 42, suffix: "", detail: "Guardrails before publish" },
  { label: "Signal routes", value: 9, suffix: "", detail: "Lead, creative, budget, CRM" },
];

const installStack = [
  {
    title: "Offer-first funnel",
    body: "A conversion page shaped around market, audience, offer, lead form, and follow-up path.",
    icon: MousePointer2,
  },
  {
    title: "Campaign assets",
    body: "Static ad angles, launch copy, creative scoring, and preview states in one build flow.",
    icon: Megaphone,
  },
  {
    title: "Lead capture loop",
    body: "Capture, validate, route, and inspect inbound deal activity from the same workspace.",
    icon: Route,
  },
  {
    title: "Operator dashboard",
    body: "Pipeline, spend, creative health, launch state, and next action live in the command center.",
    icon: Gauge,
  },
  {
    title: "Optimization engine",
    body: "Rules and recommendations watch the campaign for creative fatigue, cost drift, and missed follow-up.",
    icon: Sparkles,
  },
  {
    title: "Launch guardrails",
    body: "Human review stays in front of risky actions while the system prepares the campaign for execution.",
    icon: ShieldCheck,
  },
];

const commandSteps = [
  {
    label: "01",
    title: "Input the market",
    body: "DealFlow turns business type, area, offer, budget, and audience into a campaign blueprint.",
  },
  {
    label: "02",
    title: "Build the system",
    body: "The app assembles funnel copy, creative angles, lead fields, preview states, and launch checks.",
  },
  {
    label: "03",
    title: "Review the cockpit",
    body: "Operators inspect the page, ads, targeting, budget, and routing before anything goes live.",
  },
  {
    label: "04",
    title: "Run the loop",
    body: "Dashboard signals and optimization rules keep the campaign measurable after launch.",
  },
];

const pricingCopy: Record<BillingPlanTier, { summary: string; features: string[]; highlighted?: boolean }> = {
  starter: {
    summary: "For getting the first campaign system built and reviewed.",
    features: ["Campaign builder", "Funnel preview", "Dashboard shell", "Guided next actions"],
  },
  pro: {
    summary: "For operators who want the launch workflow and optimization loop active.",
    highlighted: true,
    features: ["Meta launch workflow", "Autonomy recommendations", "Creative performance view", "Lead loop visibility"],
  },
  growth: {
    summary: "For teams scaling campaign volume and deeper operating workflows.",
    features: ["Data import access", "Expanded campaign operations", "Growth plan controls", "Priority operating layer"],
  },
};

const faqs = [
  {
    question: "Is this a marketing site or the actual product?",
    answer:
      "The homepage is public. The software stays behind /login, with the dashboard, builder, preview, launch, settings, and public funnel routes preserved.",
  },
  {
    question: "Does DealFlow launch campaigns without review?",
    answer:
      "The product is built around a review-first launch path. Risky actions stay gated so operators can inspect campaign assets and settings before publishing.",
  },
  {
    question: "Can the homepage use customer claims later?",
    answer:
      "Yes, once real proof exists. This version intentionally avoids testimonials, logos, and unsupported performance promises.",
  },
  {
    question: "Where does the CTA go?",
    answer:
      "The main CTA sends visitors directly into account creation so the path stays software-first instead of sales-call-first.",
  },
];

function useCountUp(target: number, durationMs = 1300) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setValue(target);
      return;
    }

    let frameId = 0;
    let startedAt = 0;
    const tick = (timestamp: number) => {
      if (!startedAt) {
        startedAt = timestamp;
      }

      const progress = Math.min((timestamp - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [durationMs, target]);

  return { value, ref };
}

function MetricCounter({
  label,
  target,
  suffix = "",
  detail,
}: {
  label: string;
  target: number;
  suffix?: string;
  detail: string;
}) {
  const { value, ref } = useCountUp(target);

  return (
    <div ref={ref} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <p className="text-[11px] uppercase text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">
        {value}
        {suffix}
      </p>
      <p className="mt-2 text-xs leading-5 text-white/60">{detail}</p>
    </div>
  );
}

function AnimatedChart() {
  const points = useMemo(
    () => "0,116 72,103 138,91 206,94 280,69 354,56 426,47 500,24",
    [],
  );

  return (
    <div className="relative min-h-[230px] overflow-hidden rounded-lg border border-white/10 bg-[#07101c] p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase text-white/50">Pipeline pressure</p>
          <p className="mt-1 text-sm font-medium text-white">Modeled campaign cockpit</p>
        </div>
        <div className="hidden shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200 sm:block">
          Rising signal
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="relative mt-6 h-[150px] w-full overflow-visible"
        viewBox="0 0 500 140"
      >
        <defs>
          <linearGradient id="dealflow-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dealflow-chart-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#a7f3d0" />
          </linearGradient>
        </defs>
        <polygon
          className="motion-safe:animate-[chartFill_1.9s_ease-out_both]"
          fill="url(#dealflow-chart-fill)"
          points={`0,140 ${points} 500,140`}
        />
        <polyline
          className="dealflow-chart-line"
          fill="none"
          points={points}
          stroke="url(#dealflow-chart-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {[72, 206, 354, 500].map((x, index) => (
          <circle
            key={x}
            className="motion-safe:animate-[pulseNode_2.2s_ease-in-out_infinite]"
            cx={x}
            cy={[103, 94, 56, 24][index]}
            fill="#07101c"
            r="6"
            stroke="#67e8f9"
            strokeWidth="3"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}

function CommandCenterVisual() {
  return (
    <div className="relative mx-auto min-w-0" style={{ width: "min(100%, 720px, calc(100vw - 64px))" }}>
      <div className="relative w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#050914] shadow-[0_40px_140px_-64px_rgba(34,211,238,0.7)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <p className="hidden min-w-0 truncate font-mono text-[11px] text-white/50 sm:block">
            agentdealflow.io / command-center
          </p>
          <div className="hidden h-2 w-12 shrink-0 rounded-full bg-white/10 sm:block" />
        </div>

        <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[0.95fr_1.3fr]">
          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase text-white/50">Launch queue</p>
                <span className="hidden rounded-full bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-200 sm:inline-flex">
                  Review ready
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {["Funnel generated", "Creatives assembled", "Lead route checked", "Operator review"].map(
                  (item, index) => (
                    <div key={item} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "grid size-7 place-items-center rounded-full border",
                          index < 3
                            ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                            : "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
                        )}
                      >
                        {index < 3 ? <Check className="size-3.5" /> : <Radar className="size-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{item}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 motion-safe:animate-[progressGrow_1.8s_ease-out_both]"
                            style={{ width: `${index < 3 ? 100 : 68}%`, animationDelay: `${index * 150}ms` }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[11px] uppercase text-white/50">Lead route</p>
                <p className="mt-2 text-2xl font-semibold text-white">Armed</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[11px] uppercase text-white/50">Review gate</p>
                <p className="mt-2 text-2xl font-semibold text-white">On</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {liveMetrics.map((metric) => (
                <MetricCounter
                  key={metric.label}
                  label={metric.label}
                  target={metric.value}
                  detail={metric.detail}
                />
              ))}
            </div>
            <AnimatedChart />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-semibold uppercase text-cyan-200/80">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-8 text-white/60">{body}</p>
    </div>
  );
}

export function HomeCommandCenter() {
  return (
    <main className="overflow-x-hidden bg-[#030712] text-white">
      <div className="relative">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:72px_72px] opacity-45" />
        <div className="absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_44%),linear-gradient(180deg,rgba(6,15,26,0.2),transparent)]" />

        <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-6 lg:px-8">
          <Link aria-label="DealFlow OS home" className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-300/10 text-sm font-bold text-cyan-100 shadow-[0_0_38px_-16px_rgba(103,232,249,0.95)]">
              D
            </span>
            <span className="text-lg font-semibold">DealFlow OS</span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-7 text-sm text-white/60 md:flex">
            {navItems.map((item) => (
              <a key={item.href} className="transition hover:text-white" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link className="hidden text-sm font-medium text-white/60 transition hover:text-white sm:inline" href="/login">
              Sign in
            </Link>
            <Link
              className="hidden h-10 items-center gap-2 rounded-full bg-cyan-200 px-4 text-sm font-semibold text-slate-950 shadow-[0_18px_54px_-24px_rgba(103,232,249,0.95)] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50 sm:inline-flex"
              href={signupHref}
            >
              Get Access
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-28">
          <div className="min-w-0 flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
              Command center for inbound dealflow
            </div>

            <h1 className="mt-7 max-w-[340px] text-4xl font-semibold leading-tight text-white sm:max-w-4xl sm:text-6xl sm:leading-[0.98] lg:text-7xl">
              <span className="block sm:inline">Launch the system</span>{" "}
              <span className="block sm:inline">that turns campaigns</span>{" "}
              <span className="block sm:inline">into dealflow.</span>
            </h1>
            <p className="mt-6 max-w-[340px] text-lg leading-8 text-white/70 sm:max-w-2xl">
              DealFlow OS builds the funnel, campaign assets, lead capture path, dashboard, and optimization loop
              real estate operators need before they spend another dollar on traffic.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full bg-cyan-200 px-6 text-base font-semibold text-slate-950 shadow-[0_24px_70px_-28px_rgba(103,232,249,0.95)] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50 sm:w-auto"
                href={signupHref}
              >
                Get Access
                <ArrowRight className="size-4" />
              </Link>
              <a
                className="inline-flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-6 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[0.075] focus:outline-none focus:ring-2 focus:ring-white/20 sm:w-auto"
                href="#system"
              >
                See the system
                <ChevronRight className="size-4" />
              </a>
            </div>

            <div className="mt-9 grid max-w-[340px] gap-3 sm:max-w-none sm:grid-cols-3">
              {[
                ["Software-first", "No sales-call gate"],
                ["Review-gated", "Operator approval before risk"],
                ["Built for real estate", "Campaign, funnel, leadflow"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/60">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <CommandCenterVisual />
        </section>
      </div>

      <section id="system" className="border-y border-white/10 bg-white/[0.018] py-20 sm:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="What gets installed"
            title="One operating layer, not another disconnected landing page."
            body="DealFlow OS is the command layer around the whole acquisition loop: campaign build, review, launch readiness, lead capture, performance signal, and next action."
          />

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {installStack.map((item) => (
              <article
                key={item.title}
                className="group rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-cyan-200/25 hover:bg-white/[0.055]"
              >
                <div className="grid size-11 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                  <item.icon className="size-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/60">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="install" className="py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200/80">Build sequence</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              From raw market input to launch-ready system.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/60">
              The experience should feel like installing an acquisition machine: concise inputs, visible system
              generation, review gates, and a dashboard that makes the next move obvious.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { label: "Funnel", icon: Layers3 },
                { label: "Creatives", icon: WandSparkles },
                { label: "Routing", icon: Workflow },
                { label: "Optimization", icon: Activity },
              ].map((item) => (
                <div
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70"
                >
                  <item.icon className="size-4 text-cyan-200" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-5 top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-cyan-200/70 via-cyan-200/20 to-transparent md:block" />
            <div className="space-y-4">
              {commandSteps.map((step, index) => (
                <article
                  key={step.label}
                  className="relative rounded-lg border border-white/10 bg-[#07101c] p-5 transition hover:border-cyan-200/20"
                >
                  <div className="flex gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 font-mono text-sm text-cyan-100">
                      {step.label}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-white/60">{step.body}</p>
                    </div>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-300 to-emerald-300 motion-safe:animate-[progressGrow_1.7s_ease-out_both]"
                      style={{ width: `${62 + index * 11}%`, animationDelay: `${index * 170}ms` }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#050b14] py-20 sm:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Live-command feel"
            title="Motion that explains the product instead of decorating it."
            body="The page uses count-up metrics, rising charts, progress rails, and product-state panels to show how the system moves from build to review to optimization."
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <AnimatedChart />
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: "Input", value: "Market", icon: Target },
                { label: "System", value: "Generated", icon: CircuitBoard },
                { label: "Review", value: "Ready", icon: BadgeCheck },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                  <item.icon className="size-5 text-cyan-200" />
                  <p className="mt-4 text-xs uppercase text-white/50">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 sm:py-28">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Pricing"
            title="Start with the plan that matches how much of the system you want active."
            body="Pricing uses the app's existing plan model so the homepage aligns with the product and billing layer."
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {(Object.keys(BILLING_PLANS) as BillingPlanTier[]).map((tier) => {
              const plan = BILLING_PLANS[tier];
              const copy = pricingCopy[tier];

              return (
                <article
                  key={tier}
                  className={cn(
                    "rounded-lg border bg-white/[0.035] p-6",
                    copy.highlighted
                      ? "border-cyan-200/30 shadow-[0_34px_90px_-54px_rgba(103,232,249,0.65)]"
                      : "border-white/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold text-white">{plan.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/60">{copy.summary}</p>
                    </div>
                    {copy.highlighted ? (
                      <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-semibold text-slate-950">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-7 text-4xl font-semibold text-white">{plan.priceLabel}</p>
                  <Link
                    className={cn(
                      "mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition hover:-translate-y-0.5 focus:outline-none focus:ring-2",
                      copy.highlighted
                        ? "bg-cyan-200 text-slate-950 hover:bg-white focus:ring-cyan-200/50"
                        : "border border-white/10 bg-white/[0.045] text-white hover:bg-white/[0.075] focus:ring-white/20",
                    )}
                    href={`${signupHref}&plan=${tier}`}
                  >
                    Get {plan.name}
                    <ArrowRight className="size-4" />
                  </Link>
                  <ul className="mt-6 space-y-3">
                    {copy.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6 text-white/60">
                        <Check className="mt-1 size-4 shrink-0 text-cyan-200" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="security" className="border-y border-white/10 bg-white/[0.018] py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200/80">Trust architecture</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              Built around guarded execution.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/60">
              DealFlow OS sits near sensitive workflows: auth, billing, lead capture, campaign launch, and customer
              communication. The public page should make that seriousness visible without exposing private details.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Protected workspace",
                body: "Software routes remain behind /login and authenticated app layouts.",
                icon: LockKeyhole,
              },
              {
                title: "Review before risk",
                body: "Launch and automation flows are designed around operator inspection.",
                icon: ShieldCheck,
              },
              {
                title: "Billing alignment",
                body: "Homepage pricing mirrors the existing app plan model.",
                icon: BarChart3,
              },
              {
                title: "Public funnel boundary",
                body: "Customer lead pages stay on /f/[slug], separate from the homepage.",
                icon: Zap,
              },
            ].map((item) => (
              <article key={item.title} className="rounded-lg border border-white/10 bg-[#07101c] p-5">
                <item.icon className="size-5 text-cyan-200" />
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-white/60">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto w-full max-w-4xl px-5 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="FAQ"
            title="Direct access, clean boundaries, no fake proof."
            body="The homepage is built to convert into software access while respecting what the product can truthfully claim today."
          />
          <div className="mt-12 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.035]">
            {faqs.map((faq) => (
              <details key={faq.question} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left text-base font-semibold text-white">
                  {faq.question}
                  <ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-7 text-white/60">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(8,20,34,0.96),rgba(3,7,18,0.96))] p-6 shadow-[0_44px_120px_-70px_rgba(103,232,249,0.75)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-200/80">Enter the system</p>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
                Build the command center before the next campaign goes live.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
                Start with account access, build the first campaign workspace, and keep the launch path inside
                DealFlow OS from the first input to the final review.
              </p>
            </div>
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 text-base font-semibold text-slate-950 shadow-[0_24px_70px_-28px_rgba(103,232,249,0.95)] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50"
              href={signupHref}
            >
              Get Access
              <Rocket className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
