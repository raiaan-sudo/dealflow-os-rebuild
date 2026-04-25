import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-plan-service";

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function joinList(values: string[]) {
  return values.filter(Boolean).join(" • ");
}

function buildWhyLine(strategy: CampaignCreativeStrategy) {
  const category = titleCase(strategy.campaignCategory);
  const trigger = strategy.triggerCondition || "the current market moment";
  const tension = strategy.internalTension || "the main internal tension slowing action";
  const mechanism = strategy.mechanism || "the system mechanism";
  const proof = strategy.proofStyle || "a lower-risk proof angle";

  return `${category} campaigns convert better when the copy opens on ${trigger.toLowerCase()}, names ${tension.toLowerCase()}, makes ${mechanism.toLowerCase()} feel like the proprietary mechanism, and uses ${proof.toLowerCase()} to reduce uncertainty before an explicit low-friction next step.`;
}

export function CreativeStrategySummary({
  strategy,
  title = "Creative strategy",
  description = "Why the system chose this campaign direction.",
  detailed = false,
  compact = false,
}: {
  strategy: CampaignCreativeStrategy;
  title?: string;
  description?: string;
  detailed?: boolean;
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">
          {titleCase(strategy.campaignCategory)}
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          Trigger: {strategy.triggerCondition || "Not set yet"}
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          Mechanism: {strategy.mechanism || "Not set yet"}
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          Proof: {strategy.proofStyle || "Not set yet"}
        </div>
      </div>

      <div className="mt-5 rounded-[20px] border border-white/8 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Why this direction
        </p>
        <p className="mt-2 text-sm leading-7 text-white/72">{buildWhyLine(strategy)}</p>
      </div>

      {detailed ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Internal tension
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {strategy.internalTension || "Not set yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Overlay style
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {joinList(strategy.overlayStyle) || "No overlay direction set yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Visual logic
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {joinList(strategy.visualLogic) || "No visual direction set yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              CTA style
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {titleCase(strategy.ctaStyle || "low_friction")}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
