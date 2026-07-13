"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import type { ProductMessageKey } from "@/lib/i18n/messages";
import type { CampaignCreativeStrategy } from "@/lib/services/campaign-plan-service";

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function joinList(values: string[]) {
  return values.filter(Boolean).join(" • ");
}

export function CreativeStrategySummary({
  strategy,
  title,
  description,
  detailed = false,
  compact = false,
}: {
  strategy: CampaignCreativeStrategy;
  title?: string;
  description?: string;
  detailed?: boolean;
  compact?: boolean;
}) {
  const { t } = useProductI18n();
  const categoryKey = `strategy.category.${strategy.campaignCategory}` as ProductMessageKey;
  const category = t(categoryKey);
  const resolvedTitle = title ?? t("strategy.title");
  const resolvedDescription = description ?? t("strategy.description");
  const notSet = t("strategy.notSet");
  const whyLine = t("strategy.whyTemplate", {
    category: category.toLocaleLowerCase(),
    trigger: strategy.triggerCondition || notSet,
    tension: strategy.internalTension || notSet,
    mechanism: strategy.mechanism || notSet,
    proof: strategy.proofStyle || notSet,
  });

  return (
    <Card className={compact ? "p-5" : "p-6 sm:p-7"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {resolvedTitle}
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{resolvedDescription}</p>
        </div>
        <Badge className="border-primary/15 bg-primary/10 text-primary">
          {category}
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          {t("strategy.trigger")}: {strategy.triggerCondition || notSet}
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          {t("strategy.mechanism")}: {strategy.mechanism || notSet}
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
          {t("strategy.proof")}: {strategy.proofStyle || notSet}
        </div>
      </div>

      <div className="mt-5 rounded-[20px] border border-white/8 bg-black/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("strategy.why")}
        </p>
        <p className="mt-2 text-sm leading-7 text-white/72">{whyLine}</p>
      </div>

      {detailed ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("strategy.internalTension")}
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {strategy.internalTension || notSet}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("strategy.overlayStyle")}
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {joinList(strategy.overlayStyle) || t("strategy.noOverlay")}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("strategy.visualLogic")}
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {joinList(strategy.visualLogic) || t("strategy.noVisual")}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("strategy.ctaStyle")}
            </p>
            <p className="mt-2 text-sm leading-7 text-white/72">
              {strategy.ctaStyle ? titleCase(strategy.ctaStyle) : t("strategy.lowFriction")}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
