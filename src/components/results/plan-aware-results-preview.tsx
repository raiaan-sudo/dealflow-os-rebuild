"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Lightbulb,
  Lock,
  MessageSquareText,
  MousePointer2,
  PlayCircle,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Target,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BILLING_PLANS, type BillingPlanTier } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type SupportedPlanTier = Extract<BillingPlanTier, "starter" | "pro">;

type PlanAwareResultsPreviewProps = {
  planTier: SupportedPlanTier;
  sourceLabel?: string;
};

const leadTrend = [8, 13, 10, 18, 22, 27, 38];
const funnelStages = [
  { label: "Clicks", value: 624, width: "100%" },
  { label: "Leads", value: 38, width: "62%" },
  { label: "Booked", value: 11, width: "38%" },
  { label: "Deals", value: 3, width: "18%" },
];
const creativeBars = [
  { label: "Price update", value: "1.8% CTR", width: "88%" },
  { label: "Demand report", value: "1.3% CTR", width: "64%" },
  { label: "Home value", value: "0.9% CTR", width: "46%" },
];
const evidence = [
  "CPL is $47 against a $55 target.",
  "Booked-call rate improved from 21% to 29%.",
  "Top creative has held the strongest CTR for 3 days.",
  "No spend-without-leads alert is active.",
];

function IconTile({
  icon: Icon,
  tone = "cyan",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "cyan" | "violet" | "green" | "amber";
}) {
  const toneClass = {
    cyan: "border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100",
    violet: "border-violet-200/20 bg-violet-300/[0.055] text-violet-100",
    green: "border-emerald-200/20 bg-emerald-300/[0.055] text-emerald-100",
    amber: "border-amber-200/20 bg-amber-300/[0.055] text-amber-100",
  }[tone];

  return (
    <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl border", toneClass)}>
      <Icon className="size-5" />
    </div>
  );
}

function ResultsAnalyticsLayer({ mode }: { mode: "guided" | "autonomous" }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="df-eyebrow">Results analytics</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
            Campaign performance at a glance
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/64">
            Safe demo performance data powers this preview. It uses the same shell for both plans while the recommendation behavior changes by tier.
          </p>
        </div>
        <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">
          {mode === "guided" ? "Guided view" : "Autonomy view"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Leads over 7 days
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">38</p>
            </div>
            <IconTile icon={BarChart3} tone="cyan" />
          </div>
          <div className="mt-5 flex h-44 items-end gap-2 rounded-[18px] border border-white/10 bg-white/[0.025] p-4 sm:gap-3">
            {leadTrend.map((value, index) => (
              <div key={`${value}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-xl bg-[linear-gradient(180deg,#67e8f9,#7c5cff)]"
                  style={{ height: `${Math.max(value * 3.2, 18)}px` }}
                />
                <span className="text-[10px] text-white/42">D{index + 1}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Conversion funnel
            </p>
            <div className="mt-4 space-y-3">
              {funnelStages.map((stage) => (
                <div key={stage.label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/64">{stage.label}</span>
                    <span className="font-semibold text-white">{stage.value}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300/80" style={{ width: stage.width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Creative signal
            </p>
            <div className="mt-4 space-y-3">
              {creativeBars.map((creative) => (
                <div key={creative.label} className="rounded-[14px] border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-white/82">{creative.label}</span>
                    <span className="text-cyan-100/80">{creative.value}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#67e8f9,#a78bfa)]"
                      style={{ width: creative.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ["Spend", "$1,786", "Pacing under budget"],
          ["CPL target", "$55", "$47 actual"],
          ["Booking rate", "29%", "Up from 21%"],
          ["Quality signal", "Strong", "No lead-loop issue"],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/48">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">{value}</p>
            <p className="mt-1 text-xs text-cyan-100/70">{detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CampaignHeader({ mode }: { mode: "guided" | "autonomous" }) {
  const guidedSteps = [
    ["Keep budget steady", "CPL is inside target, so avoid changing spend today."],
    ["Check lead quality", "Review the next 3 leads before changing creative."],
    ["Prepare backup creative", "Use it only if CPL rises above $55 or booked-call rate drops."],
  ];
  const watchlist = [
    ["CPL ceiling", "$55"],
    ["CTR floor", "1.0%"],
    ["Spend without leads", "Alert"],
    ["Booked-call rate", "Watch"],
  ];

  return (
    <Card className="h-fit p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="df-eyebrow text-cyan-100/76">
            {mode === "guided" ? "$97 guided results" : "$297 autonomous results"}
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
            Toronto seller demand campaign
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/64">
            Live demo-style signals with all launch and provider side effects disabled in this preview.
          </p>
        </div>
        <Badge className="border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100">
          {mode === "guided" ? "Guided" : "Guardrails on"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Leads", "38", "+12 this week"],
          ["Calls", "11", "29% lead to call"],
          ["CPL", "$47", "Inside target"],
          ["Pipeline", "$418K", "From active deals"],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-white/48">{label}</p>
            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">{value}</p>
            <p className="mt-1 text-xs text-cyan-100/68">{detail}</p>
          </div>
        ))}
      </div>

      {mode === "guided" ? (
        <div className="mt-5 grid gap-3">
          {guidedSteps.map(([title, body], index) => (
            <div key={title} className="rounded-[18px] border border-white/10 bg-black/15 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Step {index + 1}
              </p>
              <h4 className="mt-2 text-base font-semibold">{title}</h4>
              <p className="mt-1 text-sm leading-6 text-white/62">{body}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.86fr]">
          <div className="rounded-[20px] border border-cyan-200/16 bg-cyan-300/[0.045] p-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Gauge} tone="cyan" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/76">
                  Autonomy watchlist
                </p>
                <p className="mt-2 text-sm leading-6 text-white/66">
                  DealFlow watches the thresholds that would require intervention.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {watchlist.map(([label, value]) => (
                <div key={label} className="rounded-[14px] border border-white/10 bg-black/15 px-3 py-2">
                  <p className="text-xs text-white/48">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-white/86">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.045] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Current status
            </p>
            <p className="mt-3 text-lg font-semibold text-white">No intervention needed</p>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Campaign stays stable unless a watched threshold breaks.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function GuidedRecommendation() {
  const [showSteps, setShowSteps] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={Lightbulb} tone="amber" />
        <div>
          <p className="df-eyebrow">Guided recommendation</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            Keep budget steady for 48 hours
          </h3>
          <p className="mt-2 text-sm leading-7 text-white/64">
            You are inside the target CPL range. The safest Starter move is to watch before changing creative or spend.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-[20px] border border-white/10 bg-black/15 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Recommended steps
        </p>
        {["Check results again tomorrow.", "Do not change the winning ad yet.", "Prepare a backup creative only if CPL rises."].map((item) => (
          <div key={item} className="flex gap-3 text-sm leading-6 text-white/70">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-cyan-200" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      {(showSteps || showEvidence) ? (
        <div className="mt-4 rounded-[20px] border border-cyan-200/16 bg-cyan-300/[0.045] p-4">
          <p className="text-sm font-semibold">
            {showEvidence ? "Why this recommendation" : "What to do next"}
          </p>
          <p className="mt-2 text-sm leading-7 text-white/66">
            {showEvidence
              ? "CPL, booking rate, and creative CTR are all stable. Starter keeps this as a guided checklist and does not expose autonomous execution."
              : "Review the next 3 leads, keep budget unchanged, and return tomorrow before deciding whether to prepare a backup creative."}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button type="button" onClick={() => { setShowSteps(true); setShowEvidence(false); }}>
          Show me what to do
        </Button>
        <Button type="button" variant="secondary" onClick={() => { setShowEvidence(true); setShowSteps(false); }}>
          View why
        </Button>
      </div>
      <Button asChild className="mt-3 w-full" variant="secondary">
        <Link href="/paywall?plan=pro">See Pro automation</Link>
      </Button>
    </Card>
  );
}

function AutonomousRecommendation() {
  const [armed, setArmed] = useState(false);
  const [guardrailsOpen, setGuardrailsOpen] = useState(false);

  return (
    <Card className="border-cyan-200/18 bg-cyan-300/[0.045] p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={PlayCircle} tone="cyan" />
        <div>
          <p className="df-eyebrow text-cyan-100/76">Autonomous recommendation</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            Hold budget and monitor lead quality
          </h3>
          <p className="mt-2 text-sm leading-7 text-white/68">
            Pro exposes evidence, guardrails, and a safe monitor state. This preview does not launch Meta changes or spend money.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Automation plan
          </p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-white/70">
            <p>1. Keep current campaign budget unchanged.</p>
            <p>2. Monitor CPL, CTR, and booked-call rate.</p>
            <p>3. Queue creative refresh only if performance breaks threshold.</p>
          </div>
          {armed ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/18 bg-emerald-300/[0.045] p-3 text-sm text-emerald-100">
              Safe monitor armed for this preview. No live provider action was triggered.
            </div>
          ) : null}
          {guardrailsOpen ? (
            <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/70">
              <p>CPL ceiling: $55</p>
              <p>CTR floor: 1.0%</p>
              <p>Spend without leads: alert only</p>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3">
            <Button type="button" onClick={() => setArmed(true)}>
              Arm safe monitor
              <Rocket className="size-4" />
            </Button>
            <Button type="button" variant="secondary" onClick={() => setGuardrailsOpen((current) => !current)}>
              Adjust guardrails
            </Button>
          </div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Evidence
          </p>
          <div className="mt-4 space-y-3">
            {evidence.map((item) => (
              <div key={item} className="flex gap-3 text-sm leading-6 text-white/70">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-cyan-200" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SmallPanel({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "cyan" | "violet" | "green" | "amber";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="df-eyebrow">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
        </div>
        <IconTile icon={icon} tone={tone} />
      </div>
      <p className="mt-3 text-sm leading-6 text-white/64">{detail}</p>
    </Card>
  );
}

function DifferenceCard({
  plan,
  title,
  body,
  items,
  pro = false,
}: {
  plan: string;
  title: string;
  body: string;
  items: string[];
  pro?: boolean;
}) {
  return (
    <Card className={cn("p-5", pro ? "border-cyan-200/20 bg-cyan-300/[0.055]" : "")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="df-eyebrow">{plan}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{title}</h3>
        </div>
        {pro ? <SplitSquareHorizontal className="size-5 text-cyan-200" /> : <Lock className="size-5 text-white/60" />}
      </div>
      <p className="mt-3 text-sm leading-7 text-white/64">{body}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex gap-3 text-sm leading-6 text-white/72">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-cyan-200" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PlanAwareResultsPreview({
  planTier,
  sourceLabel = "Safe demo state",
}: PlanAwareResultsPreviewProps) {
  const plan = BILLING_PLANS[planTier];
  const mode = planTier === "pro" ? "autonomous" : "guided";

  return (
    <div className="df-page-stack">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge>Results preview</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
              Results page: {plan.name} {plan.priceLabel}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-white/66">
              Campaign performance, funnel signal, launch state, and recommendations are visible in one shell.
              {planTier === "pro"
                ? " Pro unlocks safe autonomous guardrail controls."
                : " Starter keeps recommendations simple and guided."}
            </p>
          </div>
          <Badge className="border-cyan-200/20 bg-cyan-300/[0.055] text-cyan-100">{sourceLabel}</Badge>
        </div>
      </Card>

      <ResultsAnalyticsLayer mode={mode} />

      <div className="grid items-start gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <CampaignHeader mode={mode} />
        {planTier === "pro" ? <AutonomousRecommendation /> : <GuidedRecommendation />}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SmallPanel title="Launch state" value="Confirmed" detail="Latest Meta sync is represented by safe demo data." icon={ShieldCheck} tone="green" />
        <SmallPanel title="Lead loop" value="Verified" detail="Form capture and alert handoff are shown without sending SMS." icon={MessageSquareText} tone="cyan" />
        <SmallPanel title="Creative winner" value="Price update" detail="Top CTR from the current static ad." icon={Gauge} tone="violet" />
        <SmallPanel
          title="Mode"
          value={planTier === "pro" ? "Autonomous" : "Guided"}
          detail={planTier === "pro" ? "The app can arm safe monitor guardrails." : "The app advises. The user acts."}
          icon={planTier === "pro" ? SlidersHorizontal : MousePointer2}
          tone={planTier === "pro" ? "cyan" : "amber"}
        />
      </div>

      <Card className="p-5 sm:p-6">
        <p className="df-eyebrow">Layout behavior comparison</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em]">
          The layout is similar. The product behavior is different.
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-white/66">
          Both plans use the same results design. Starter teaches the next action; Pro exposes controlled autonomous behavior.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <DifferenceCard
            plan={`${BILLING_PLANS.starter.name} ${BILLING_PLANS.starter.priceLabel}`}
            title="Guided recommendation"
            body="The app tells the user what the smartest move is. The user still executes the work manually."
            items={[
              "Recommendation says what to do next",
              "Evidence is simplified into plain language",
              "Buttons teach or guide instead of approving automation",
              "Meta automation remains an upgrade path",
            ]}
          />
          <DifferenceCard
            plan={`${BILLING_PLANS.pro.name} ${BILLING_PLANS.pro.priceLabel}`}
            title="Autonomous recommendation"
            body="The app recommends the action, shows the evidence, and can arm monitoring inside controlled guardrails."
            items={[
              "Recommendation includes an automation plan",
              "Evidence is visible before any action",
              "User can arm, pause, or adjust guardrails",
              "Meta sync, creative testing, and monitoring feel unlocked",
            ]}
            pro
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/onboarding" className="block">
          <SmallPanel title="Phase 1" value="Onboarding" detail="Open the safe step-by-step campaign builder." icon={Wand2} tone="violet" />
        </Link>
        <Link href="/dashboard?plan=starter" className="block">
          <SmallPanel title="Phase 2" value="Results shell" detail="Open the Starter guided results state." icon={ClipboardList} tone="cyan" />
        </Link>
        <Link href="/dashboard?plan=pro" className="block">
          <SmallPanel title="Phase 3" value="Plan behavior" detail="Open the Pro autonomous results state." icon={CircleDollarSign} tone="green" />
        </Link>
      </div>
    </div>
  );
}
