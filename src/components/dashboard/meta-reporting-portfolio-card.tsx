"use client";

import { Card } from "@/components/ui/card";
import type { MetaReportingPortfolio } from "@/lib/integrations/meta/reporting-portfolio-contract";

export function MetaReportingPortfolioCard(props: {
  portfolio: MetaReportingPortfolio;
  currency: (value: number) => string;
  labels: {
    title: string;
    description: string;
    providerDelivery: string;
    businessOutcomes: string;
    state: Record<MetaReportingPortfolio["state"], string>;
    spend: string;
    impressions: string;
    clicks: string;
    leads: string;
    conversations: string;
    appointments: string;
    qualified: string;
    closedWon: string;
    unavailable: string;
  };
}) {
  const value = (candidate: number | null, formatter?: (value: number) => string) =>
    candidate === null ? props.labels.unavailable : formatter ? formatter(candidate) : String(candidate);
  const outcomes = props.portfolio.outcomes;
  return (
    <Card className="rounded-[24px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{props.labels.title}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {props.labels.state[props.portfolio.state]}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{props.labels.description}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{props.labels.providerDelivery}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            {[
              [props.labels.spend, value(props.portfolio.metrics.spend, props.currency)],
              [props.labels.impressions, value(props.portfolio.metrics.impressions)],
              [props.labels.clicks, value(props.portfolio.metrics.clicks)],
              [props.labels.leads, value(props.portfolio.metrics.leads)],
            ].map(([label, metric]) => (
              <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{metric}</dd></div>
            ))}
          </dl>
        </section>
        <section className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{props.labels.businessOutcomes}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            {[
              [props.labels.conversations, outcomes ? String(outcomes.conversations) : props.labels.unavailable],
              [props.labels.appointments, outcomes ? String(outcomes.appointments) : props.labels.unavailable],
              [props.labels.qualified, outcomes ? String(outcomes.qualified) : props.labels.unavailable],
              [props.labels.closedWon, outcomes ? String(outcomes.closedWon) : props.labels.unavailable],
            ].map(([label, metric]) => (
              <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{metric}</dd></div>
            ))}
          </dl>
        </section>
      </div>
    </Card>
  );
}
