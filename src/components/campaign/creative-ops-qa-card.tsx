import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CreativeOpsQaAssessment } from "@/lib/services/creative-ops-qa-service";

function badgeClass(tone: "good" | "warn" | "bad") {
  if (tone === "good") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  if (tone === "warn") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }

  return "border-rose-500/20 bg-rose-500/10 text-rose-300";
}

export function CreativeOpsQaCard({
  assessment,
  compact = false,
}: {
  assessment: CreativeOpsQaAssessment;
  compact?: boolean;
}) {
  const signals = [
    { label: "Category fit", value: assessment.categoryFit },
    { label: "Mechanism", value: assessment.mechanismClarity },
    { label: "Proof", value: assessment.proofClarity },
    { label: "Overlay", value: assessment.overlayUsefulness },
    { label: "Generic risk", value: assessment.antiGenericWarning },
  ];

  return (
    <Card className={compact ? "p-4" : "p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Creative QA
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{assessment.summary}</p>
        </div>
        <Badge className={badgeClass(assessment.usable ? "good" : "warn")}>
          {assessment.usable ? "Usable" : "Needs review"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {signals.map((signal) => (
          <Badge key={signal.label} className={badgeClass(signal.value.tone)}>
            {signal.label}: {signal.value.label}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
