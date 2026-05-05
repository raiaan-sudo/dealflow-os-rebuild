"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import type { PointerEvent, ReactNode } from "react";
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
const scrollTrackingMilestones = [25, 50, 75, 90] as const;

function trackHomepageEvent(event: string, properties: Record<string, string | number | boolean> = {}) {
  track(event, {
    page: "homepage",
    ...properties,
  });
}

function useHomepageScrollTracking(progress: number) {
  const trackedMilestones = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const milestone of scrollTrackingMilestones) {
      if (progress >= milestone / 100 && !trackedMilestones.current.has(milestone)) {
        trackedMilestones.current.add(milestone);
        trackHomepageEvent("homepage_scroll_depth", { depth: milestone });
      }
    }
  }, [progress]);
}

const navItems = [
  { label: "System", href: "#system" },
  { label: "Agency fatigue", href: "#agency-fatigue" },
  { label: "Operators", href: "#operators" },
  { label: "Difference", href: "#difference" },
  { label: "Software", href: "#software" },
  { label: "Pricing", href: "#pricing" },
];

const installStack = [
  {
    title: "Offer-first funnel",
    body: "A conversion page shaped around the market, audience, offer, lead form, and review path instead of a generic landing template.",
    icon: MousePointer2,
  },
  {
    title: "Campaign assets",
    body: "Creative angles, static ad concepts, launch copy, scoring, and preview states generated around the actual funnel.",
    icon: Megaphone,
  },
  {
    title: "Lead capture loop",
    body: "Capture, validate, route, and inspect inbound deal activity from the same workspace before it turns into another missed handoff.",
    icon: Route,
  },
  {
    title: "Operator dashboard",
    body: "Pipeline, spend posture, creative health, launch state, and next action live in the command center.",
    icon: Gauge,
  },
  {
    title: "Optimization engine",
    body: "AI-assisted rules and recommendations watch for creative fatigue, cost drift, routing gaps, and missed follow-up.",
    icon: Sparkles,
  },
  {
    title: "Launch guardrails",
    body: "Human oversight stays in front of risky actions while the system prepares the campaign for operator approval.",
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
    body: "Custom-coded AI infrastructure assembles funnel copy, creative angles, lead fields, preview states, and launch checks.",
  },
  {
    label: "03",
    title: "Review the cockpit",
    body: "Operators inspect the page, ads, targeting, budget, and routing before anything goes live.",
  },
  {
    label: "04",
    title: "Run the loop",
    body: "Dashboard signals, optimization rules, and team-reviewed operating logic keep the campaign measurable after launch.",
  },
];

const realizationBullets = [
  "More lead promises do not fix a broken pipeline.",
  "Another agency dashboard does not help if the funnel, creative, routing, and follow-up are disconnected.",
  "If the system disappears when the retainer ends, it was never really yours.",
  "Operators need the acquisition layer installed inside their own software workflow, not trapped in a vendor account or hidden behind reporting screenshots.",
];

const comparisonRows = [
  { label: "Lead flow", agency: "Inconsistent handoffs across tools", system: "One workspace from campaign to lead loop" },
  { label: "Execution", agency: "Fragmented vendors and unclear ownership", system: "Funnel, creative, routing, and dashboard installed together" },
  { label: "AI role", agency: "Generic prompts or a passive stats screen", system: "Custom-coded AI assists build, diagnosis, and optimization" },
  { label: "Oversight", agency: "Accountability disappears after the pitch", system: "Software workflow plus team-reviewed operating logic" },
  { label: "Reporting", agency: "Vanity metrics with unclear next action", system: "Launch state, lead signal, and optimization prompts in context" },
  { label: "Ownership", agency: "Assets, data, and workflow often live elsewhere", system: "Campaign system lives in the operator account" },
  { label: "Scaling", agency: "Add another vendor or meeting cycle", system: "Tune the build, routing, creative, and review loop from software" },
];

const softwareModules = [
  {
    label: "01",
    title: "Offer & positioning",
    body: "Market, audience, service area, lead type, and offer logic become the campaign blueprint.",
    items: ["Positioning brief", "Lead intent", "Message angles"],
  },
  {
    label: "02",
    title: "Conversion funnel",
    body: "Landing page structure, qualifying fields, confirmation states, and public funnel boundaries are assembled together.",
    items: ["Page sections", "Lead form", "Review preview"],
  },
  {
    label: "03",
    title: "Creative engine",
    body: "Ad angles, hooks, static concepts, and launch copy are generated around the funnel instead of sitting in a disconnected document.",
    items: ["Hooks", "Static ad concepts", "Launch copy"],
  },
  {
    label: "04",
    title: "Traffic launch workflow",
    body: "Launch readiness keeps budget, targeting, assets, and guardrails visible before anything risky happens.",
    items: ["Checklist", "Review gate", "Paused-by-default posture"],
  },
  {
    label: "05",
    title: "Follow-up & optimization",
    body: "Lead capture, routing signal, dashboard state, and next-action recommendations keep the loop measurable without pretending results are guaranteed.",
    items: ["Lead loop", "Dashboard signal", "Optimization queue"],
  },
];

const fitSignals = [
  "You want software access instead of another agency sales-call funnel.",
  "You need campaign assets, lead capture, and reporting in one workflow.",
  "You want to review launch risk before spend or automations move.",
  "You want AI-assisted infrastructure with human oversight, not a blank dashboard.",
  "You care about owning the funnel path, data flow, and operating process.",
];

const agencyFatigueCards = [
  {
    label: "Promise",
    title: "Big pipeline claims before the system exists.",
    body: "Agents have heard every version of the pitch: more leads, better ads, done-for-you growth. The part that usually stays vague is who owns the creative, funnel, routing, follow-up, and optimization layer.",
    status: "Discarded",
  },
  {
    label: "Handoff",
    title: "Contractors, portals, and recycled creative.",
    body: "A funnel in one place, ads somewhere else, lead notes in a spreadsheet, reporting in a screenshot, and recycled creative passed through another contractor. Nobody owns the complete path.",
    status: "Contained",
  },
  {
    label: "Control",
    title: "DealFlow installs the loop in software.",
    body: "The campaign, creative layer, capture path, review gate, dashboard, and optimization signal stay inside the operator workflow from day one.",
    status: "Installed",
  },
];

const operatorProofCards = [
  {
    label: "01",
    title: "Built by ex-agency operators.",
    body: "DealFlow OS was shaped by operators who have sat on the agency side, managed real acquisition workflows, and rebuilt the model as software instead of another lead vendor.",
    icon: BadgeCheck,
  },
  {
    label: "02",
    title: "Over eight figures in ad spend experience.",
    body: "That experience informs the operating model: offer, funnel, creative, routing, reporting, and optimization must work together before more traffic gets involved.",
    icon: BarChart3,
  },
  {
    label: "03",
    title: "Custom-coded AI infrastructure.",
    body: "The system comes from internal AI tooling built to operate marketing infrastructure across creative production, funnel assembly, routing, optimization, and reporting.",
    icon: CircuitBoard,
  },
  {
    label: "04",
    title: "Software plus human oversight.",
    body: "AI builds and coordinates the system. Humans oversee quality, strategy, and launch readiness so users are not dropped into a blank tool.",
    icon: ShieldCheck,
  },
];

const conversionSteps = [
  { label: "01", title: "Create access", body: "Enter through the software, not a calendar gate." },
  { label: "02", title: "Build the first system", body: "Shape the market, offer, funnel, assets, and lead route." },
  { label: "03", title: "Review before risk", body: "Inspect launch readiness before spend or automations move." },
];

const assemblyNodes = [
  { label: "Offer", x: 70, y: 72, icon: Target },
  { label: "Funnel", x: 205, y: 42, icon: MousePointer2 },
  { label: "Creative", x: 345, y: 72, icon: WandSparkles },
  { label: "Routing", x: 118, y: 190, icon: Route },
  { label: "Dashboard", x: 250, y: 158, icon: Gauge },
  { label: "Optimize", x: 382, y: 190, icon: Activity },
];

const productTabs = [
  { label: "Workspace", value: "Inputs locked", icon: Layers3 },
  { label: "Campaign", value: "Assets staged", icon: Megaphone },
  { label: "Leads", value: "Route armed", icon: Route },
  { label: "Launch", value: "Review gate on", icon: ShieldCheck },
  { label: "Reports", value: "Signal rising", icon: BarChart3 },
];

const cockpitModes = [
  {
    id: "build",
    label: "Build",
    cue: "Generating the campaign instance",
    route: "Mapping",
    gate: "Draft",
    chartTitle: "Assembly pressure",
    chartStatus: "Build active",
    chartTone: "cyan",
    linePoints: "0,118 70,96 142,102 214,72 286,64 360,42 426,38 500,27",
    metrics: [
      { label: "Campaign assets", value: 18, suffix: "", detail: "Funnel, ads, copy, routing" },
      { label: "Launch checks", value: 27, suffix: "", detail: "Rules staged for review" },
      { label: "Signal routes", value: 6, suffix: "", detail: "Audience, offer, lead path" },
    ],
    chips: ["Offer", "Audience", "Funnel", "Creative"],
  },
  {
    id: "route",
    label: "Route",
    cue: "Connecting lead capture to the command layer",
    route: "Armed",
    gate: "On",
    chartTitle: "Lead route pressure",
    chartStatus: "Signal routing",
    chartTone: "purple",
    linePoints: "0,124 70,114 142,88 214,91 286,58 360,52 426,34 500,22",
    metrics: [
      { label: "Lead routes", value: 9, suffix: "", detail: "Form, CRM, review, next action" },
      { label: "Quality checks", value: 34, suffix: "", detail: "Validation before handoff" },
      { label: "Inbox states", value: 12, suffix: "", detail: "New, reviewed, routed" },
    ],
    chips: ["Capture", "Validate", "Route", "Review"],
  },
  {
    id: "optimize",
    label: "Optimize",
    cue: "Watching performance signal after launch",
    route: "Live",
    gate: "Guarded",
    chartTitle: "Optimization pressure",
    chartStatus: "Rising signal",
    chartTone: "emerald",
    linePoints: "0,128 70,118 142,95 214,80 286,75 360,43 426,31 500,18",
    metrics: [
      { label: "Optimization rules", value: 42, suffix: "", detail: "Budget, creative, follow-up" },
      { label: "Signal routes", value: 15, suffix: "", detail: "Lead, creative, cost, CRM" },
      { label: "Next actions", value: 8, suffix: "", detail: "Operator-ready recommendations" },
    ],
    chips: ["Score", "Diagnose", "Recommend", "Improve"],
  },
];

const engineModes = [
  {
    id: "blueprint",
    label: "Blueprint",
    title: "Market input becomes a real campaign shape.",
    body: "Offer, audience, area, lead type, and budget become the first working model of the acquisition system.",
    stat: "04",
    statLabel: "Core inputs",
    icon: Target,
  },
  {
    id: "assemble",
    label: "Assemble",
    title: "The stack starts wiring itself together.",
    body: "Funnel sections, ad angles, lead form states, preview panels, and routing logic move into one command layer from the same operating model.",
    stat: "18",
    statLabel: "Assets staged",
    icon: CircuitBoard,
  },
  {
    id: "review",
    label: "Review",
    title: "Risk stays visible before anything goes live.",
    body: "Launch readiness, spend posture, creative quality, and lead routing stay in front of the operator.",
    stat: "42",
    statLabel: "Checks visible",
    icon: ShieldCheck,
  },
  {
    id: "signal",
    label: "Signal",
    title: "The cockpit keeps telling the operator what changed.",
    body: "DealFlow turns scattered campaign activity into next-action signal across leads, creative, budget posture, and follow-up.",
    stat: "09",
    statLabel: "Signal paths",
    icon: Activity,
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
    question: "Is DealFlow OS an agency?",
    answer:
      "No. DealFlow OS is software-first acquisition infrastructure built by ex-agency operators, not another lead vendor. The CTA sends users into the product instead of a call-first retainer funnel.",
  },
  {
    question: "Is this just another dashboard?",
    answer:
      "No. A passive dashboard only shows numbers after the work is scattered elsewhere. DealFlow OS assembles the funnel, creative direction, lead capture, routing, launch readiness, dashboard state, and optimization loop in one workflow.",
  },
  {
    question: "What role does AI play?",
    answer:
      "AI builds and coordinates the operating layer: campaign blueprint, funnel structure, creative angles, launch checks, routing logic, reporting signal, and optimization recommendations. It is infrastructure, not magic, and not a replacement for review.",
  },
  {
    question: "Is there human oversight?",
    answer:
      "Yes. Humans oversee quality, strategy, and launch readiness through review gates and team-maintained operating logic so users are not left alone with a blank tool or an uninspected launch path.",
  },
  {
    question: "Are results guaranteed?",
    answer:
      "No. This homepage intentionally avoids testimonials, logos, lead-volume guarantees, ROI guarantees, and unsupported performance claims. The promise is the infrastructure and operating workflow, not a fabricated outcome.",
  },
  {
    question: "Does DealFlow launch campaigns without review?",
    answer:
      "The product is built around a review-first launch path. Risky actions stay gated so operators can inspect campaign assets and settings before publishing.",
  },
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function useCountUp(target: number, durationMs = 1300) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRun(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.25 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [target]);

  useEffect(() => {
    if (!shouldRun) {
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
  }, [durationMs, shouldRun, target]);

  return { value, ref };
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return progress;
}

function useElementScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setProgress(1);
      return;
    }

    let frameId = 0;
    const update = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const viewport = window.innerHeight || 1;
        const scrollable = Math.max(rect.height - viewport, 1);
        const raw = -rect.top / scrollable;
        setProgress(Math.min(Math.max(raw, 0), 1));
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { ref, progress };
}

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn("df-reveal", isVisible && "df-reveal-visible", className)}
      style={{ animationDelay: `${delay}ms`, transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
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
    <div
      ref={ref}
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] p-4 transition hover:-translate-y-1 hover:border-indigo-300/30"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
      <p className="text-[11px] uppercase text-white/50">{label}</p>
      <p className="mt-3 bg-gradient-to-r from-white via-cyan-100 to-indigo-200 bg-clip-text text-3xl font-semibold text-transparent">
        {value}
        {suffix}
      </p>
      <p className="mt-2 text-xs leading-5 text-white/60">{detail}</p>
    </div>
  );
}

function AnimatedChart({
  points = "0,116 72,103 138,91 206,94 280,69 354,56 426,47 500,24",
  title = "Modeled campaign cockpit",
  status = "Rising signal",
  tone = "purple",
  gradientId = "dealflow-chart",
}: {
  points?: string;
  title?: string;
  status?: string;
  tone?: string;
  gradientId?: string;
}) {
  const pointPairs = useMemo(
    () =>
      points.split(" ").map((point) => {
        const [x, y] = point.split(",").map(Number);
        return { x, y };
      }),
    [points],
  );
  const markerIndexes = [1, 3, 5, 7].filter((index) => pointPairs[index]);
  const statusClass =
    tone === "emerald"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
      : tone === "cyan"
        ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
        : "border-indigo-300/20 bg-indigo-300/10 text-indigo-100";

  return (
    <div className="relative min-h-[230px] overflow-hidden rounded-lg border border-white/10 bg-[#07101c] p-4 shadow-[0_30px_110px_-70px_rgba(99,102,241,0.9)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_4%,rgba(99,102,241,0.2),transparent_34%),radial-gradient(circle_at_18%_100%,rgba(34,211,238,0.12),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase text-white/50">Pipeline pressure</p>
          <p className="mt-1 text-sm font-medium text-white">{title}</p>
        </div>
        <div className={cn("hidden shrink-0 rounded-full border px-3 py-1 text-xs font-semibold sm:block", statusClass)}>
          {status}
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="relative mt-6 h-[150px] w-full overflow-visible"
        viewBox="0 0 500 140"
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.34" />
            <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="48%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <polygon
          className="motion-safe:animate-[chartFill_1.9s_ease-out_both]"
          fill={`url(#${gradientId}-fill)`}
          points={`0,140 ${points} 500,140`}
        />
        <polyline
          className="dealflow-chart-line"
          fill="none"
          points={points}
          stroke={`url(#${gradientId}-line)`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {markerIndexes.map((pointIndex, index) => {
          const point = pointPairs[pointIndex];
          if (!point) {
            return null;
          }

          return (
            <circle
              key={pointIndex}
              className="motion-safe:animate-[pulseNode_2.2s_ease-in-out_infinite]"
              cx={point.x}
              cy={point.y}
              fill="#07101c"
              r="6"
              stroke="#a5b4fc"
              strokeWidth="3"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function CommandCenterVisual() {
  const [activeMode, setActiveMode] = useState(0);
  const currentMode = cockpitModes[activeMode] ?? cockpitModes[0]!;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveMode((mode) => (mode + 1) % cockpitModes.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-auto min-w-0" style={{ width: "min(100%, 720px, calc(100vw - 64px))" }}>
      <div className="df-ambient-panel df-holo-card relative w-full min-w-0 overflow-hidden rounded-lg border border-indigo-200/15 bg-[#050914] shadow-[0_40px_150px_-64px_rgba(99,102,241,0.9)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.6)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-300 shadow-[0_0_18px_rgba(165,180,252,0.75)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
          </div>
          <p className="hidden min-w-0 truncate font-mono text-[11px] text-white/50 sm:block">
            agentdealflow.io / command-center
          </p>
          <div className="hidden h-2 w-12 shrink-0 rounded-full bg-white/10 sm:block" />
        </div>

        <div className="grid gap-2 border-b border-white/10 bg-white/[0.025] p-3 sm:grid-cols-3">
          {cockpitModes.map((mode, index) => (
            <button
              key={mode.id}
              className={cn(
                "group relative overflow-hidden rounded-lg border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/35",
                activeMode === index
                  ? "border-cyan-200/35 bg-cyan-200/10 text-white shadow-[0_18px_58px_-32px_rgba(103,232,249,0.75)]"
                  : "border-white/10 bg-white/[0.025] text-white/58 hover:border-indigo-200/25 hover:bg-indigo-300/[0.055] hover:text-white",
              )}
              type="button"
              onClick={() => setActiveMode(index)}
            >
              <span className="relative z-10 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{mode.label}</span>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    activeMode === index ? "bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.95)]" : "bg-white/20",
                  )}
                />
              </span>
              <span className="relative z-10 mt-1 block text-[11px] leading-4 text-white/45">{mode.cue}</span>
              {activeMode === index ? <span className="df-mode-fill" /> : null}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[0.95fr_1.3fr]">
          <div className="min-w-0 space-y-4">
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] p-4">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent" />
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase text-white/50">Launch queue</p>
                <span className="hidden rounded-full bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-200 sm:inline-flex">
                  {currentMode.chartStatus}
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {["Funnel generated", "Creatives assembled", "Lead route checked", "Operator review"].map(
                  (item, index) => (
                    <div key={item} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "grid size-7 place-items-center rounded-full border motion-safe:animate-[nodeBreathe_2.8s_ease-in-out_infinite]",
                          index < 3
                            ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
                            : "border-indigo-300/40 bg-indigo-300/10 text-indigo-200",
                        )}
                        style={{ animationDelay: `${index * 140}ms` }}
                      >
                        {index < 3 ? <Check className="size-3.5" /> : <Radar className="size-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{item}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300 motion-safe:animate-[progressGrow_1.8s_ease-out_both]"
                            style={{
                              width: `${Math.min(100, 72 + activeMode * 9 + index * 8)}%`,
                              animationDelay: `${index * 150}ms`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-indigo-200/15 bg-white/[0.045] p-4">
                <p className="text-[11px] uppercase text-white/50">Lead route</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currentMode.route}</p>
              </div>
              <div className="rounded-lg border border-indigo-200/15 bg-white/[0.045] p-4">
                <p className="text-[11px] uppercase text-white/50">Review gate</p>
                <p className="mt-2 text-2xl font-semibold text-white">{currentMode.gate}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentMode.chips.map((chip) => (
                <span key={chip} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/62">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {currentMode.metrics.map((metric) => (
                <MetricCounter
                  key={`${currentMode.id}-${metric.label}`}
                  label={metric.label}
                  target={metric.value}
                  detail={metric.detail}
                />
              ))}
            </div>
            <AnimatedChart
              key={currentMode.id}
              gradientId={`hero-${currentMode.id}`}
              points={currentMode.linePoints}
              status={currentMode.chartStatus}
              title={currentMode.chartTitle}
              tone={currentMode.chartTone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemAssemblyMap() {
  return (
    <Reveal className="mt-14">
      <div className="df-ambient-panel relative overflow-hidden rounded-lg border border-indigo-200/15 bg-[#07101c] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-indigo-200/80">System assembly map</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">Every module connects back to the command layer.</h3>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">
            <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.95)]" />
            Installing acquisition loop
          </div>
        </div>

        <div className="relative mt-8 min-h-[320px] overflow-hidden rounded-lg border border-white/10 bg-[#050914]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(99,102,241,0.22),transparent_34%),radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_82%_74%,rgba(168,85,247,0.18),transparent_30%)]" />
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            viewBox="0 0 500 260"
          >
            <defs>
              <linearGradient id="assembly-line" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="52%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            {assemblyNodes.map((node, index) => (
              <line
                key={node.label}
                className="dealflow-signal-line"
                stroke="url(#assembly-line)"
                strokeLinecap="round"
                strokeWidth="2"
                x1="250"
                x2={node.x}
                y1="130"
                y2={node.y}
                style={{ animationDelay: `${index * 110}ms` }}
              />
            ))}
            <circle
              className="motion-safe:animate-[corePulse_3.4s_ease-in-out_infinite]"
              cx="250"
              cy="130"
              fill="rgba(129,140,248,0.18)"
              r="54"
              stroke="rgba(165,180,252,0.5)"
              strokeWidth="1"
            />
            <circle cx="250" cy="130" fill="rgba(103,232,249,0.18)" r="30" stroke="#67e8f9" strokeWidth="2" />
          </svg>

          <div className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/30 bg-[#08111d]/90 text-center shadow-[0_0_70px_-22px_rgba(103,232,249,0.95)]">
            <CircuitBoard className="size-5 text-cyan-100" />
            <span className="mt-1 block text-[10px] font-semibold uppercase text-white/70">OS Core</span>
          </div>

          {assemblyNodes.map((node, index) => {
            const Icon = node.icon;
            return (
              <div
                key={node.label}
                className="absolute w-28 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-white/[0.055] p-3 text-center shadow-[0_22px_70px_-48px_rgba(99,102,241,0.9)] motion-safe:animate-[nodeFloat_4.4s_ease-in-out_infinite]"
                style={{
                  left: `${(node.x / 500) * 100}%`,
                  top: `${(node.y / 260) * 100}%`,
                  animationDelay: `${index * 180}ms`,
                }}
              >
                <Icon className="mx-auto size-4 text-indigo-100" />
                <p className="mt-2 text-xs font-semibold text-white">{node.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}

function AgencySignalGraphic() {
  return (
    <div className="df-ambient-panel overflow-hidden rounded-lg border border-indigo-200/15 bg-[#07101c] p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative min-h-[240px] rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase text-white/45">Fragmented service model</p>
          {["Ads", "CRM", "Landing page", "Reports"].map((item, index) => (
            <div
              key={item}
              className="absolute rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-xs text-white/55"
              style={{
                left: `${[9, 55, 18, 62][index]}%`,
                top: `${[27, 22, 64, 66][index]}%`,
              }}
            >
              {item}
            </div>
          ))}
          <svg className="absolute inset-0 h-full w-full opacity-55" viewBox="0 0 420 240">
            <path className="dealflow-broken-line" d="M84 78 C170 44 216 116 318 70" fill="none" stroke="#64748b" strokeDasharray="7 10" strokeWidth="2" />
            <path className="dealflow-broken-line" d="M112 166 C164 120 234 172 310 162" fill="none" stroke="#64748b" strokeDasharray="7 10" strokeWidth="2" />
          </svg>
        </div>
        <div className="relative min-h-[240px] rounded-lg border border-indigo-300/20 bg-indigo-300/[0.055] p-4">
          <p className="text-xs font-semibold uppercase text-indigo-100/80">DealFlow OS</p>
          <div className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/30 bg-[#08111d] text-xs font-semibold text-white shadow-[0_0_70px_-24px_rgba(103,232,249,0.95)]">
            OS
          </div>
          {["Funnel", "Creative", "Leads", "Launch"].map((item, index) => (
            <div
              key={item}
              className="absolute rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-xs font-semibold text-cyan-50"
              style={{
                left: `${[10, 64, 13, 66][index]}%`,
                top: `${[28, 28, 66, 66][index]}%`,
              }}
            >
              {item}
            </div>
          ))}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 420 240">
            <defs>
              <linearGradient id="owned-signal" x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="58%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            {["M102 76 L210 120", "M322 76 L210 120", "M100 166 L210 120", "M324 166 L210 120"].map((path, index) => (
              <path
                key={path}
                className="dealflow-signal-line"
                d={path}
                fill="none"
                stroke="url(#owned-signal)"
                strokeLinecap="round"
                strokeWidth="2.4"
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function ScrollCinemaTransition() {
  const { ref, progress } = useElementScrollProgress<HTMLElement>();
  const promiseOpacity = clamp(1 - progress * 2.35);
  const systemOpacity = clamp((progress - 0.24) * 2.2);
  const commandOpacity = clamp((progress - 0.52) * 2.6);
  const splitDistance = Math.round(clamp(progress * 1.35) * 46);
  const scanY = Math.round(12 + progress * 76);
  const cockpitScale = 0.92 + commandOpacity * 0.08;

  return (
    <section ref={ref} className="df-scroll-cinema relative border-y border-white/10 bg-[#020611] lg:min-h-[260vh]">
      <div className="relative flex items-center overflow-visible py-16 sm:py-20 lg:sticky lg:top-0 lg:min-h-screen lg:overflow-hidden">
        <div aria-hidden="true" className="df-scroll-cinema-backdrop" />
        <div
          aria-hidden="true"
          className="df-scroll-scan"
          style={{ transform: `translateY(${scanY}vh)` }}
        />
        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:px-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
              Scroll transition
            </div>
            <h2 className="mt-6 text-4xl font-semibold leading-[0.98] text-white sm:text-6xl sm:leading-[0.95]">
              Watch the agency pitch collapse into an owned system.
            </h2>
            <p className="mt-6 text-base leading-8 text-white/62">
              As the visitor scrolls, the page moves from the old promise layer into the actual product layer:
              disconnected claims break apart, the acquisition loop assembles, and the command center comes online.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Promise", promiseOpacity],
                ["Assembly", systemOpacity],
                ["Command", commandOpacity],
              ].map(([label, opacity], index) => (
                <div key={label as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <p className="font-mono text-xs text-cyan-200">0{index + 1}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{label as string}</p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300"
                      style={{ transform: `scaleX(${opacity as number})`, transformOrigin: "left" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="df-scroll-stage relative min-h-[760px] overflow-hidden rounded-lg border border-indigo-200/15 bg-[#050914] p-4 shadow-[0_48px_150px_-72px_rgba(129,140,248,0.95)] sm:min-h-[620px] sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_54%_42%,rgba(129,140,248,0.22),transparent_32%),radial-gradient(circle_at_20%_84%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(168,85,247,0.2),transparent_28%)]" />

            <div
              className="absolute inset-3 rounded-lg border border-rose-200/15 bg-rose-300/[0.035] p-4 transition will-change-transform sm:inset-5 sm:p-5"
              style={{
                opacity: promiseOpacity,
                transform: `translateX(${-splitDistance}px) rotate(${-progress * 3}deg) scale(${1 - progress * 0.06})`,
              }}
            >
              <p className="text-xs font-semibold uppercase text-rose-100/70">Old layer</p>
              <h3 className="mt-4 max-w-sm text-2xl font-semibold text-white sm:text-3xl">The agency promise stack.</h3>
              <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
                {["Lead guarantee", "Rented dashboard", "Hidden handoff", "Another call"].map((item, index) => (
                  <div
                    key={item}
                    className="rounded-lg border border-white/10 bg-[#0b1020]/80 p-3 sm:p-4"
                    style={{
                      transform: `translate(${index % 2 === 0 ? -splitDistance : splitDistance}px, ${progress * 22}px)`,
                    }}
                  >
                    <Megaphone className="size-4 text-rose-100/70" />
                    <p className="mt-3 text-sm font-semibold text-white">{item}</p>
                    <p className="mt-2 text-xs leading-5 text-white/48">Disconnected from the operator workflow.</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="absolute inset-3 rounded-lg border border-cyan-200/20 bg-cyan-200/[0.035] p-4 transition will-change-transform sm:inset-5 sm:p-5"
              style={{
                opacity: systemOpacity,
                transform: `translateY(${(1 - systemOpacity) * 34}px) scale(${0.96 + systemOpacity * 0.04})`,
              }}
            >
              <p className="text-xs font-semibold uppercase text-cyan-100/75">Installing system</p>
              <h3 className="mt-4 max-w-md text-2xl font-semibold text-white sm:text-3xl">The acquisition loop assembles.</h3>
              <div className="relative mt-6 min-h-[330px] rounded-lg border border-white/10 bg-[#030712]/80 sm:mt-8 sm:min-h-[300px]">
                <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 560 300" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="scroll-cinema-line" x1="0" x2="1">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="52%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  {["M80 70 C190 36 238 112 280 150", "M480 70 C370 36 322 112 280 150", "M90 238 C190 260 238 186 280 150", "M470 238 C370 260 322 186 280 150"].map((path, index) => (
                    <path
                      key={path}
                      className="dealflow-signal-line"
                      d={path}
                      fill="none"
                      stroke="url(#scroll-cinema-line)"
                      strokeLinecap="round"
                      strokeWidth="2.2"
                      style={{ animationDelay: `${index * 100}ms` }}
                    />
                  ))}
                </svg>
                <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/35 bg-[#07101c] shadow-[0_0_95px_-22px_rgba(103,232,249,0.95)]">
                  <CircuitBoard className="size-7 text-cyan-100" />
                  <span className="text-[10px] font-semibold uppercase text-white/70">Core</span>
                </div>
                {["Funnel", "Assets", "Lead route", "Dashboard"].map((item, index) => (
                  <div
                    key={item}
                    className="absolute rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-xs font-semibold text-cyan-50"
                    style={{
                      left: `${[8, 68, 10, 66][index]}%`,
                      top: `${[14, 16, 72, 72][index]}%`,
                      opacity: clamp(systemOpacity + index * 0.12),
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="absolute inset-3 rounded-lg border border-indigo-200/25 bg-[#07101c] p-4 transition will-change-transform sm:inset-5 sm:p-5"
              style={{
                opacity: commandOpacity,
                transform: `translateY(${(1 - commandOpacity) * 42}px) scale(${cockpitScale})`,
              }}
            >
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-indigo-100/75">Command center online</p>
                  <h3 className="mt-2 text-xl font-semibold text-white sm:text-2xl">DealFlow OS takes over the page.</h3>
                </div>
                <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Online
                </span>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
                <div className="space-y-3">
                  {["Funnel generated", "Creatives assembled", "Lead route checked", "Operator review"].map((item, index) => (
                    <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 sm:p-3">
                      <div className="grid size-7 shrink-0 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 sm:size-8">
                        <Check className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{item}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300"
                            style={{ width: `${72 + index * 8}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <AnimatedChart
                  gradientId="scroll-cinema-chart"
                  points="0,126 70,112 142,88 214,82 286,58 360,46 426,32 500,18"
                  status="Rising signal"
                  title="Owned system pressure"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductTabsPreview() {
  return (
    <div className="df-ambient-panel overflow-hidden rounded-lg border border-indigo-200/15 bg-[#07101c] p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-indigo-200/80">Live software surface</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">One cockpit, five active views.</h3>
        </div>
        <Radar className="hidden size-6 text-cyan-200 sm:block" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        {productTabs.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <div
              key={tab.label}
              className={cn(
                "relative overflow-hidden rounded-lg border p-4 motion-safe:animate-[panelRise_700ms_ease-out_both]",
                index === 1
                  ? "border-indigo-300/40 bg-indigo-300/10"
                  : "border-white/10 bg-white/[0.035]",
              )}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <Icon className={cn("size-5", index === 1 ? "text-indigo-100" : "text-cyan-200")} />
              <p className="mt-4 text-sm font-semibold text-white">{tab.label}</p>
              <p className="mt-1 text-xs leading-5 text-white/55">{tab.value}</p>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300 motion-safe:animate-[progressGrow_1.4s_ease-out_both]"
                  style={{ width: `${72 + index * 5}%`, animationDelay: `${index * 120}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductEngineSection() {
  const [activeEngine, setActiveEngine] = useState(1);
  const current = engineModes[activeEngine] ?? engineModes[0]!;
  const CurrentIcon = current.icon;

  return (
    <section className="border-y border-white/10 bg-[#050b14] py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase text-cyan-200/80">One-of-one operating layer</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
            Make the visitor feel the machine turning on.
          </h2>
          <p className="mt-5 text-base leading-8 text-white/60">
            DealFlow should not feel like another agency funnel. It should feel like a live acquisition system:
            inputs become assets, assets become routes, routes become signal, and the operator always sees the next
            move.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {engineModes.map((mode, index) => {
              const Icon = mode.icon;
              const isActive = activeEngine === index;

              return (
                <button
                  key={mode.id}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/35",
                    isActive
                      ? "border-cyan-200/35 bg-cyan-200/10 shadow-[0_22px_70px_-40px_rgba(103,232,249,0.85)]"
                      : "border-white/10 bg-white/[0.035] hover:-translate-y-1 hover:border-indigo-300/30 hover:bg-indigo-300/[0.055]",
                  )}
                  type="button"
                  onClick={() => setActiveEngine(index)}
                >
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-lg border",
                          isActive
                            ? "border-cyan-200/30 bg-cyan-200/15 text-cyan-100"
                            : "border-white/10 bg-white/[0.04] text-white/58",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="font-semibold text-white">{mode.label}</span>
                    </div>
                    <ChevronRight className={cn("size-4 transition", isActive ? "translate-x-1 text-cyan-100" : "text-white/35")} />
                  </div>
                  {isActive ? <span className="df-mode-fill" /> : null}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="df-ambient-panel df-holo-card relative min-h-[620px] overflow-hidden rounded-lg border border-indigo-200/15 bg-[#07101c] p-5 sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.22),transparent_34%),radial-gradient(circle_at_18%_78%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.18),transparent_30%)]" />
            <div className="relative z-10 flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase text-indigo-200/80">DealFlow engine</p>
                <h3 className="mt-3 max-w-xl text-2xl font-semibold text-white sm:text-3xl">{current.title}</h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">{current.body}</p>
              </div>
              <div className="hidden rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4 text-right sm:block">
                <p className="font-mono text-3xl font-semibold text-cyan-100">{current.stat}</p>
                <p className="mt-1 text-xs uppercase text-white/48">{current.statLabel}</p>
              </div>
            </div>

            <div className="relative z-10 mt-10 min-h-[390px] overflow-hidden rounded-lg border border-white/10 bg-[#030712]/72">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:42px_42px] opacity-70" />
              <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.025] motion-safe:animate-[engineOrbit_12s_linear_infinite]" />
              <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-200/12 bg-indigo-300/[0.018] motion-safe:animate-[engineOrbit_18s_linear_infinite_reverse] sm:size-80" />

              <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 620 390" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="engine-beam" x1="0" x2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="50%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
                {[
                  "M80 84 C210 50 250 150 310 195",
                  "M540 88 C420 56 370 150 310 195",
                  "M92 310 C218 336 248 238 310 195",
                  "M530 312 C420 340 370 238 310 195",
                ].map((path, index) => (
                  <path
                    key={path}
                    className="dealflow-signal-line"
                    d={path}
                    fill="none"
                    stroke="url(#engine-beam)"
                    strokeLinecap="round"
                    strokeWidth="2"
                    style={{ animationDelay: `${index * 130 + activeEngine * 90}ms` }}
                  />
                ))}
              </svg>

              <div className="absolute left-1/2 top-1/2 grid size-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/35 bg-[#07101c]/95 text-center shadow-[0_0_95px_-24px_rgba(103,232,249,0.95)]">
                <CurrentIcon className="size-7 text-cyan-100" />
                <span className="mt-2 block text-xs font-semibold uppercase text-white/70">{current.label}</span>
              </div>

              {engineModes.map((mode, index) => {
                const Icon = mode.icon;
                const positionClass =
                  [
                    "left-[6%] top-[13%]",
                    "right-[6%] top-[14%]",
                    "left-[6%] top-[72%]",
                    "right-[6%] top-[72%]",
                  ][index] ?? "left-[6%] top-[13%]";

                return (
                  <button
                    key={mode.id}
                    className={cn(
                      "absolute w-[112px] rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200/35 min-[360px]:w-[124px] sm:w-[150px]",
                      positionClass,
                      activeEngine === index
                        ? "border-cyan-200/35 bg-cyan-200/12 text-white shadow-[0_24px_80px_-44px_rgba(103,232,249,0.9)]"
                        : "border-white/10 bg-white/[0.045] text-white/60 hover:border-indigo-200/25 hover:bg-indigo-300/[0.06]",
                    )}
                    type="button"
                    onClick={() => setActiveEngine(index)}
                  >
                    <Icon className="size-4 text-cyan-100" />
                    <span className="mt-2 block text-sm font-semibold">{mode.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-white/45">{mode.statLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AgencyFatigueSection() {
  return (
    <section
      id="agency-fatigue"
      className="df-cinematic-section border-y border-white/10 bg-[#030712] py-20 sm:py-28"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase text-rose-200/80">Built for agency-fatigued operators</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[0.95] text-white sm:text-6xl">
            Real estate agents are done buying promises.
          </h2>
          <p className="mt-6 text-base leading-8 text-white/64">
            The market has been trained to distrust the pitch: vague lead guarantees, rented dashboards, disconnected
            contractors, recycled creative, missed follow-up, unclear ownership, and another call before anyone can see
            the actual system. DealFlow is positioned against that fatigue. It shows the operating layer and sends the
            user straight into software access.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["No sales-call gate", "No rented black box", "No fake proof"].map((item, index) => (
              <div
                key={item}
                className="df-cinematic-tile rounded-lg border border-white/10 bg-white/[0.04] p-4"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <p className="font-mono text-xs text-cyan-200">0{index + 1}</p>
                <p className="mt-3 text-sm font-semibold text-white">{item}</p>
              </div>
            ))}
          </div>
          <Link
            className="mt-8 inline-flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-200 via-indigo-200 to-purple-200 px-6 text-base font-semibold text-slate-950 shadow-[0_24px_90px_-28px_rgba(129,140,248,0.95)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_110px_-24px_rgba(192,132,252,0.95)] focus:outline-none focus:ring-2 focus:ring-indigo-200/50 sm:w-auto"
            href={signupHref}
            onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "agency_fatigue_get_software_access", destination: signupHref })}
          >
            Get software access
            <ArrowRight className="size-4" />
          </Link>
        </Reveal>

        <Reveal delay={140}>
          <div className="df-cinematic-panel relative overflow-hidden rounded-lg border border-indigo-200/15 bg-[#07101c] p-4 sm:p-6">
            <div className="grid gap-4">
              {agencyFatigueCards.map((card, index) => (
                <article
                  key={card.label}
                  className={cn(
                    "df-impact-card group relative overflow-hidden rounded-lg border p-5",
                    index === agencyFatigueCards.length - 1
                      ? "border-cyan-200/30 bg-cyan-200/[0.08]"
                      : "border-white/10 bg-white/[0.035]",
                  )}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <div className="relative z-10 grid gap-4 sm:grid-cols-[0.45fr_1fr_auto] sm:items-center">
                    <div>
                      <p className="text-xs font-semibold uppercase text-white/45">{card.label}</p>
                      <p
                        className={cn(
                          "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          index === agencyFatigueCards.length - 1
                            ? "border-cyan-200/30 bg-cyan-200/10 text-cyan-100"
                            : "border-rose-200/20 bg-rose-300/10 text-rose-100",
                        )}
                      >
                        {card.status}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white">{card.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-white/58">{card.body}</p>
                    </div>
                    <div className="hidden size-16 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 sm:grid">
                      {index === agencyFatigueCards.length - 1 ? (
                        <CircuitBoard className="size-6 text-cyan-100" />
                      ) : (
                        <Megaphone className="size-6 text-rose-100/70" />
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function OperatorBuiltSection() {
  return (
    <section id="operators" className="border-y border-white/10 bg-[#050b14] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
          <Reveal>
            <p className="text-xs font-semibold uppercase text-cyan-200/80">Built by operators</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              Built by ex-agency operators, not another lead vendor.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/62">
              DealFlow OS comes from the infrastructure we built after managing over eight figures in ad spend and
              seeing where real estate acquisition systems break: recycled creative, weak funnels, slow follow-up,
              rented dashboards, and no accountable operating layer.
            </p>
            <p className="mt-4 text-base leading-8 text-white/62">
              This is not a passive KPI screen. The system assembles the funnel, creative direction, lead capture,
              routing, launch checks, reporting surface, and optimization loop with custom-coded AI infrastructure and
              human oversight from the DealFlow team.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid gap-4 sm:grid-cols-2">
              {operatorProofCards.map((card, index) => {
                const Icon = card.icon;

                return (
                  <article
                    key={card.title}
                    className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-indigo-300/35 hover:bg-indigo-300/[0.055]"
                    style={{ transitionDelay: `${index * 35}ms` }}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-mono text-sm text-cyan-200">{card.label}</p>
                      <span className="grid size-10 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                        <Icon className="size-5" />
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/60">{card.body}</p>
                  </article>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section id="difference" className="py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase text-cyan-200/80">Agency vs owned system</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
            Stop renting a service. Own the operating layer.
          </h2>
          <p className="mt-5 text-base leading-8 text-white/60">
            The core wedge is blunt: agents do not need another vendor promising a mystery pipeline. They need the
            acquisition workflow installed where they can inspect the funnel, creative, routing, launch state, and
            optimization logic.
          </p>
          <div className="mt-8 space-y-3">
            {realizationBullets.map((item, index) => (
              <div
                key={item}
                className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-indigo-300/30 hover:bg-indigo-300/[0.055]"
                style={{ transitionDelay: `${index * 35}ms` }}
              >
                <ArrowRight className="mt-1 size-4 shrink-0 text-cyan-200" />
                <p className="text-sm leading-6 text-white/70">{item}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={110} className="space-y-4">
          <AgencySignalGraphic />
          <div className="rounded-lg border border-white/10 bg-[#07101c] p-4 sm:p-6">
            <div className="grid grid-cols-[0.8fr_1fr_1fr] gap-3 border-b border-white/10 pb-4 text-xs uppercase text-white/50">
              <span>Layer</span>
              <span>Service model</span>
              <span>DealFlow OS</span>
            </div>
            <div className="divide-y divide-white/10">
              {comparisonRows.map((row) => (
                <div key={row.label} className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[0.8fr_1fr_1fr]">
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="text-sm leading-6 text-white/50">{row.agency}</p>
                  <p className="text-sm leading-6 text-cyan-100">{row.system}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SoftwareModulesSection() {
  return (
    <section id="software" className="border-y border-white/10 bg-[#050b14] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="The software"
          title="Five modules. One owned operating layer."
          body="DealFlow OS is active full-stack marketing infrastructure: inputs become a funnel, creative direction, lead capture, routing, dashboard signal, and optimization queue inside the same product path."
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-5">
          {softwareModules.map((module, index) => (
            <Reveal key={module.label} delay={index * 80}>
              <article className="group relative h-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-indigo-300/35 hover:bg-indigo-300/[0.055]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                <p className="font-mono text-sm text-cyan-200">{module.label}</p>
                <h3 className="mt-4 text-lg font-semibold text-white">{module.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/60">{module.body}</p>
                <div className="mt-5 space-y-2">
                  {module.items.map((item) => (
                    <div key={item} className="inline-flex w-full items-center gap-2 text-xs text-white/55">
                      <Check className="size-3.5 shrink-0 text-cyan-200" />
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <div className="h-full rounded-lg border border-white/10 bg-[#07101c] p-6">
            <p className="text-xs font-semibold uppercase text-cyan-200/80">Product preview</p>
            <h3 className="mt-4 text-2xl font-semibold text-white">Show the system before the user commits.</h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              The homepage should make the visitor feel like the campaign instance already has shape: workspace,
              campaign, leads, creative state, launch readiness, and reporting signal. That is expressed in the
              command-center cockpit instead of a static promise or a passive reporting screen.
            </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ProductTabsPreview />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FitSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase text-cyan-200/80">Who it is for</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
            Built for operators who want the stack, not the agency show.
          </h2>
          <p className="mt-5 text-base leading-8 text-white/60">
            No invented revenue thresholds. No fake scarcity. No call-first funnel pretending to be a product. The
            clean qualifier is operational: this is for real estate teams that want AI-assisted inbound acquisition
            infrastructure with human oversight built into software.
          </p>
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {fitSignals.map((item, index) => (
            <Reveal key={item} delay={index * 80}>
            <div className="h-full rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-indigo-300/30 hover:bg-indigo-300/[0.055]">
              <Check className="size-5 text-cyan-200" />
              <p className="mt-4 text-sm leading-7 text-white/70">{item}</p>
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConversionPathSection() {
  return (
    <section className="df-cinematic-section py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase text-cyan-200/80">Conversion path</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
            The CTA stays brutally simple: get access and start building.
          </h2>
          <p className="mt-5 text-base leading-8 text-white/60">
            This is more conversion-optimized because it removes the agency behavior agents already distrust:
            no calendar gate, no vague discovery call, no promise wall before they see the product and the operating
            layer behind it.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="df-cinematic-panel grid gap-3 rounded-lg border border-indigo-200/15 bg-[#07101c] p-4 sm:grid-cols-3 sm:p-5">
            {conversionSteps.map((step, index) => (
              <article
                key={step.label}
                className="df-cinematic-tile relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-5"
                style={{ animationDelay: `${index * 130}ms` }}
              >
                <p className="font-mono text-sm text-cyan-200">{step.label}</p>
                <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/58">{step.body}</p>
              </article>
            ))}
            <Link
              className="group relative overflow-hidden rounded-lg border border-cyan-200/25 bg-cyan-200 p-5 text-slate-950 shadow-[0_26px_90px_-38px_rgba(103,232,249,0.95)] transition hover:-translate-y-1 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50 sm:col-span-3"
              href={signupHref}
              onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "conversion_direct_software_path", destination: signupHref })}
            >
              <span className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">Direct software path</span>
                  <span className="mt-2 block text-2xl font-semibold">Get Access to DealFlow OS</span>
                </span>
                <ArrowRight className="size-6 transition group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
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
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollProgress = useScrollProgress();
  useHomepageScrollTracking(scrollProgress);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const node = mainRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    node.style.setProperty("--df-pointer-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--df-pointer-y", `${event.clientY - rect.top}px`);
  }

  return (
    <main
      ref={mainRef}
      className="df-interactive-shell overflow-x-clip bg-[#030712] text-white"
      onPointerMove={handlePointerMove}
    >
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-1 bg-white/5">
        <div
          className="h-full origin-left bg-gradient-to-r from-cyan-300 via-indigo-300 to-purple-300 shadow-[0_0_24px_rgba(129,140,248,0.75)]"
          style={{ transform: `scaleX(${scrollProgress})` }}
        />
      </div>
      <div aria-hidden="true" className="df-pointer-glow" />
      <div className="relative">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:72px_72px] opacity-45" />
        <div className="absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(ellipse_at_58%_0%,rgba(99,102,241,0.28),transparent_44%),radial-gradient(ellipse_at_82%_18%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(ellipse_at_24%_4%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(180deg,rgba(6,15,26,0.2),transparent)]" />
        <div className="absolute left-1/2 top-28 h-px w-[min(920px,calc(100vw-40px))] -translate-x-1/2 bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent motion-safe:animate-[signalSweep_4.8s_ease-in-out_infinite]" />

        <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-6 lg:px-8">
          <Link aria-label="DealFlow OS home" className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-300/10 text-sm font-bold text-cyan-100 shadow-[0_0_38px_-16px_rgba(103,232,249,0.95)]">
              D
            </span>
            <span className="text-lg font-semibold">DealFlow OS</span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-6 text-sm text-white/60 lg:flex">
            {navItems.map((item) => (
              <a key={item.href} className="transition hover:text-white" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              className="hidden text-sm font-medium text-white/60 transition hover:text-white sm:inline"
              href="/login"
              onClick={() => trackHomepageEvent("homepage_signin_click", { destination: "/login" })}
            >
              Sign in
            </Link>
            <Link
              className="hidden h-10 items-center gap-2 rounded-full bg-cyan-200 px-4 text-sm font-semibold text-slate-950 shadow-[0_18px_54px_-24px_rgba(103,232,249,0.95)] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50 sm:inline-flex"
              href={signupHref}
              onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "nav_get_access", destination: signupHref })}
            >
              Get Access
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-28">
          <div className="min-w-0 flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200/25 bg-indigo-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-[0_0_50px_-28px_rgba(129,140,248,0.95)]">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
              Ex-agency built command center for inbound dealflow
            </div>

            <h1 className="mt-7 max-w-[340px] text-4xl font-semibold leading-tight text-white sm:max-w-4xl sm:text-6xl sm:leading-[0.98] lg:text-7xl">
              <span className="block sm:inline">Stop buying agency promises.</span>{" "}
              <span className="block sm:inline">Launch the system</span>{" "}
              <span className="block bg-gradient-to-r from-cyan-100 via-indigo-200 to-purple-300 bg-clip-text text-transparent sm:inline">
                into dealflow.
              </span>
            </h1>
            <p className="mt-6 max-w-[340px] text-lg leading-8 text-white/70 sm:max-w-2xl">
              A one-of-one command layer from ex-agency operators who have managed over eight figures in ad spend.
              DealFlow turns creative production, funnel assembly, capture, routing, dashboard visibility, and
              optimization loops into owned software before another dollar goes into traffic.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="group inline-flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-200 via-indigo-200 to-purple-200 px-6 text-base font-semibold text-slate-950 shadow-[0_24px_90px_-28px_rgba(129,140,248,0.95)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_100px_-26px_rgba(192,132,252,0.95)] focus:outline-none focus:ring-2 focus:ring-indigo-200/50 sm:w-auto"
                href={signupHref}
                onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "hero_get_access", destination: signupHref })}
              >
                Get Access
                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                className="inline-flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-6 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[0.075] focus:outline-none focus:ring-2 focus:ring-white/20 sm:w-auto"
                href="#system"
                onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "hero_see_the_system", destination: "#system" })}
              >
                See the system
                <ChevronRight className="size-4" />
              </a>
            </div>

            <div className="mt-9 grid max-w-[340px] gap-3 sm:max-w-none sm:grid-cols-3">
              {[
                ["No agency gate", "Direct software access"],
                ["Human oversight", "Review before risk"],
                ["AI infrastructure", "Campaign, funnel, leadflow"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-indigo-300/25 hover:bg-indigo-300/[0.055]">
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
            body="DealFlow OS is the command layer around the whole acquisition loop: campaign build, creative production, review, launch readiness, lead capture, routing, performance signal, and next action."
          />

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {installStack.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <article className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-indigo-300/35 hover:bg-indigo-300/[0.055]">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="grid size-11 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100 transition group-hover:border-indigo-200/40 group-hover:bg-indigo-300/15">
                    <item.icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <SystemAssemblyMap />
        </div>
      </section>

      <ScrollCinemaTransition />

      <AgencyFatigueSection />

      <OperatorBuiltSection />

      <ProductEngineSection />

      <ComparisonSection />

      <section id="install" className="py-20 sm:py-28">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200/80">Build sequence</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              From raw market input to launch-ready system.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/60">
              The experience should feel like installing an acquisition machine: concise inputs, AI-assisted system
              generation, review gates, team-maintained operating logic, and a dashboard that makes the next move
              obvious.
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

      <SoftwareModulesSection />

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

      <FitSection />

      <ConversionPathSection />

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
                    onClick={() =>
                      trackHomepageEvent("homepage_pricing_cta_click", {
                        cta: `pricing_${tier}`,
                        destination: `${signupHref}&plan=${tier}`,
                        plan: tier,
                      })
                    }
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
              communication. The public page makes that seriousness visible without exposing private details or
              pretending that automation removes operator review.
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
            body="The homepage is built to convert into software access while explaining the operator-built infrastructure behind the product."
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
                Start with account access, build the first campaign workspace, and keep the funnel, creative, lead
                route, dashboard, and review path inside DealFlow OS from the first input to the final review.
              </p>
            </div>
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 text-base font-semibold text-slate-950 shadow-[0_24px_70px_-28px_rgba(103,232,249,0.95)] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/50"
              href={signupHref}
              onClick={() => trackHomepageEvent("homepage_cta_click", { cta: "final_get_access", destination: signupHref })}
            >
              Get Access
              <Rocket className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-sm text-white/48 sm:flex-row sm:items-center sm:justify-between">
          <p>DealFlow OS. Software access for owned inbound dealflow infrastructure.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="transition hover:text-white" href="/privacy">
              Privacy
            </Link>
            <Link className="transition hover:text-white" href="/terms">
              Terms
            </Link>
            <Link className="transition hover:text-white" href="/data-deletion">
              Data deletion
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
