"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  BuilderEditingMode,
  BuilderTab,
  GuidedStep,
} from "@/components/campaign/builder/types";

type BuilderNavigationProps = {
  activeTab: BuilderTab;
  editingMode: BuilderEditingMode;
  currentGuidedIndex: number;
  guidedSteps: Array<{
    key: GuidedStep;
    label: string;
    href?: string;
  }>;
  stepMicrocopy: string;
  setActiveTab: (tab: BuilderTab) => void;
  setEditingMode: (mode: BuilderEditingMode) => void;
  showEditingModeToggle?: boolean;
};

function isInteractiveStep(step: GuidedStep): step is BuilderTab {
  return step === "setup" || step === "funnel" || step === "creatives";
}

export function GuidedStepFooter({
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextHref,
}: {
  backLabel?: string;
  onBack?: () => void;
  nextLabel: string;
  onNext?: () => void;
  nextHref?: string;
}) {
  return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
      <div className="text-sm text-white/55">
        Keep moving through the guided flow. You can return here and switch to detailed editing any time.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {backLabel && onBack ? (
          <Button type="button" variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
        {nextHref ? (
          <Button asChild>
            <Link href={nextHref}>{nextLabel}</Link>
          </Button>
        ) : (
          <Button type="button" onClick={onNext}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function BuilderNavigation({
  activeTab,
  editingMode,
  currentGuidedIndex,
  guidedSteps,
  stepMicrocopy,
  setActiveTab,
  setEditingMode,
  showEditingModeToggle = true,
}: BuilderNavigationProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Campaign setup flow
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              Move through the client-ready setup flow
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/65">{stepMicrocopy}</p>
          </div>

          {showEditingModeToggle ? (
            <div className="flex flex-col items-start gap-3 rounded-[20px] border border-white/8 bg-black/20 p-4 xl:min-w-[240px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Editing options
                </p>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Guided stays on by default. Detailed editing is available only when you want full section-by-section changes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingMode === "guided" ? "default" : "secondary"}
                  onClick={() => setEditingMode("guided")}
                >
                  Guided
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editingMode === "advanced" ? "default" : "secondary"}
                  onClick={() => setEditingMode("advanced")}
                >
                  Detailed editing
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-wrap gap-3">
          {guidedSteps.map((step, index) => {
            const isComplete = index < currentGuidedIndex;
            const isCurrent = index === currentGuidedIndex;
            const stepKey = step.key;
            const sharedClasses = [
              "flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold transition",
              isCurrent
                ? "border-primary/30 bg-primary/12 text-primary"
                : isComplete
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.05]",
            ].join(" ");

            const content = (
              <>
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold",
                    isCurrent
                      ? "border-primary/25 bg-primary/12 text-primary"
                      : isComplete
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/[0.03] text-white/45",
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                <span>{step.label}</span>
                {isCurrent ? (
                  <Badge className="border-primary/15 bg-primary/10 text-primary">Now</Badge>
                ) : null}
              </>
            );

            if (isInteractiveStep(stepKey)) {
              return (
                <button
                  key={stepKey}
                  type="button"
                  className={sharedClasses}
                  onClick={() => setActiveTab(stepKey)}
                >
                  {content}
                </button>
              );
            }

            if (step.href) {
              return (
                <Link key={stepKey} href={step.href} className={sharedClasses}>
                  {content}
                </Link>
              );
            }

            return (
              <div key={stepKey} className={sharedClasses}>
                {content}
              </div>
            );
          })}
        </div>
        {activeTab === "funnel" && editingMode === "advanced" ? (
          <p className="mt-4 text-sm leading-6 text-primary/85">
            Detailed editing is active. You can now update the page one section at a time.
          </p>
        ) : null}
      </div>
    </div>
  );
}
