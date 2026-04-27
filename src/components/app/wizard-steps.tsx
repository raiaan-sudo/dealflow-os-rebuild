import { cn } from "@/lib/utils";

const STEPS = [
  { key: "onboarding", label: "Step 1", title: "Onboarding" },
  { key: "funnel", label: "Step 2", title: "Funnel" },
  { key: "creatives", label: "Step 3", title: "Creatives" },
  { key: "review", label: "Step 4", title: "Review" },
  { key: "launch", label: "Step 5", title: "Launch" },
] as const;

type WizardStepKey = (typeof STEPS)[number]["key"];

type WizardStepsProps = {
  current: WizardStepKey;
};

export function WizardSteps({ current }: WizardStepsProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-5">
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isComplete = index < currentIndex;

          return (
            <div
              key={step.key}
              className={cn(
                "rounded-2xl border px-4 py-3 transition",
                isCurrent
                  ? "border-primary/25 bg-primary/12"
                  : isComplete
                    ? "border-emerald-500/20 bg-emerald-500/10"
                    : "border-white/8 bg-black/10",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {step.label}
              </p>
              <p
                className={cn(
                  "mt-2 text-sm font-semibold",
                  isCurrent ? "text-primary" : "text-foreground",
                )}
              >
                {step.title}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
