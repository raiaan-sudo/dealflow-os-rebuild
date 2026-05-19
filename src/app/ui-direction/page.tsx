import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Lightbulb,
  Lock,
  MousePointer2,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const experienceCards = [
  {
    href: "/onboarding",
    label: "Onboarding",
    title: "Interactive setup form",
    body: "Step-by-step builder with local autosave, validation, buyer/seller selection, and a live campaign summary.",
    icon: ClipboardList,
  },
  {
    href: "/dashboard",
    label: `${BILLING_PLANS.starter.priceLabel} Results`,
    title: "Guided recommendation",
    body: "Starter opens the shared results shell with simpler recommendations and manual next-step guidance.",
    icon: Lightbulb,
  },
  {
    href: "/dashboard",
    label: `${BILLING_PLANS.pro.priceLabel} Results`,
    title: "Autonomous recommendation",
    body: "Pro opens the same results shell with Autopilot safe actions, approval-required growth moves, and budget protection.",
    icon: Rocket,
  },
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

function BehaviorCard({
  plan,
  title,
  body,
  items,
  href,
  pro = false,
}: {
  plan: string;
  title: string;
  body: string;
  items: string[];
  href: string;
  pro?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className={cn("h-full p-5", pro ? "border-cyan-200/20 bg-cyan-300/[0.055]" : "")}>
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
    </Link>
  );
}

export default function UIDirectionPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1380px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge>DealFlow OS UI mockups</Badge>
            <h1 className="mt-5 max-w-5xl text-4xl font-semibold tracking-[-0.075em] text-white sm:text-6xl">
              Three mockups for onboarding and results.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-white/68 sm:text-base">
              These cards now open the actual implemented product states: a safe onboarding builder,
              a {BILLING_PLANS.starter.priceLabel} guided results page, and a {BILLING_PLANS.pro.priceLabel} autonomous results page.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <Button asChild>
              <Link href="/onboarding">
                Open onboarding
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">
                Open Pro results
                <BarChart3 className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {experienceCards.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-[22px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-200/20 hover:bg-cyan-300/[0.045]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/85">
                      {item.label}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{item.title}</h3>
                  </div>
                  <IconTile icon={Icon} />
                </div>
                <p className="mt-4 text-sm leading-7 text-white/66">{item.body}</p>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <p className="df-eyebrow">Layout behavior comparison</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
          The layout is similar. The product behavior is different.
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-white/66">
          Both plans use one results shell. Starter guides the next step; Pro exposes controlled automation behavior.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <BehaviorCard
            plan={`${BILLING_PLANS.starter.name} ${BILLING_PLANS.starter.priceLabel}`}
            title="Guided recommendation"
            body="The app tells the user what the smartest move is. The user still executes the work manually."
            href="/dashboard"
            items={[
              "Recommendation says what to do next",
              "Evidence is simplified into plain language",
              "Buttons teach or guide instead of approving automation",
              "Meta automation remains an upgrade path",
            ]}
          />
          <BehaviorCard
            plan={`${BILLING_PLANS.pro.name} ${BILLING_PLANS.pro.priceLabel}`}
            title="Autonomous recommendation"
            body="DealFlow monitors and optimizes within your rules. Safe actions can run automatically when flags and customer settings allow it."
            href="/dashboard"
            items={[
              "High-impact growth moves need approval",
              "Budget increases, new ads, audiences, and funnel publishing stay approval-required",
              "Monthly budget cap protection stays visible",
              "User can arm, pause, or adjust Autopilot guardrails",
            ]}
            pro
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/onboarding" className="block">
          <Card className="h-full p-5">
            <IconTile icon={Wand2} tone="violet" />
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em]">Onboarding</h3>
            <p className="mt-2 text-sm leading-7 text-white/64">
              Opens the safe multi-step builder with local state and validation.
            </p>
          </Card>
        </Link>
        <Link href="/dashboard" className="block">
          <Card className="h-full p-5">
            <IconTile icon={MousePointer2} tone="amber" />
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em]">Results shell</h3>
            <p className="mt-2 text-sm leading-7 text-white/64">
              Opens the Starter results state with guided recommendations.
            </p>
          </Card>
        </Link>
        <Link href="/dashboard" className="block">
          <Card className="h-full p-5">
            <IconTile icon={SlidersHorizontal} tone="green" />
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em]">Plan behavior</h3>
            <p className="mt-2 text-sm leading-7 text-white/64">
              Opens the Pro results state with autonomous guardrails.
            </p>
          </Card>
        </Link>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <IconTile icon={ShieldCheck} tone="green" />
            <div>
              <p className="df-eyebrow">Safety state</p>
              <p className="mt-2 text-sm leading-7 text-white/66">
                These routes do not create leads, send SMS, create Stripe charges, launch Meta campaigns, or trigger provider work.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard">
              Open Starter
              <CircleDollarSign className="size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
