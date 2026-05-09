"use client";

import type { ReactNode } from "react";
import { Activity, ArrowUpRight, BarChart3, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusPill as BaseStatusPill } from "@/components/ui/status-pill";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  success: "text-emerald-200",
  warning: "text-amber-200",
  danger: "text-rose-200",
  info: "text-sky-200",
  accent: "text-cyan-200",
};

const toneRing: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04]",
  success: "border-emerald-400/20 bg-emerald-400/10",
  warning: "border-amber-400/20 bg-amber-400/10",
  danger: "border-rose-400/20 bg-rose-400/10",
  info: "border-sky-400/20 bg-sky-400/10",
  accent: "border-cyan-300/20 bg-cyan-300/10",
};

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <BaseStatusPill tone={tone} className={className}>
      {children}
    </BaseStatusPill>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("min-w-0 rounded-[20px] border p-4", toneRing[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {delta ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold", toneText[tone])}>
            <ArrowUpRight className="size-3" />
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
      {detail ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function DashboardChartPanel({
  title,
  subtitle,
  badge,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[24px] border-white/10 bg-[#07111f]/90 p-5 shadow-[0_28px_90px_-56px_rgba(34,211,238,0.55)]", className)}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/65">{title}</p>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-300">{subtitle}</p> : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

type ChartPoint = {
  label: string;
  spend: number;
  leads: number;
  actual?: boolean;
};

function buildAreaPath(points: ChartPoint[], key: "spend" | "leads", width = 560, height = 190) {
  const max = Math.max(...points.map((point) => Number(point[key] ?? 0)), 1);
  const step = width / Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => {
    const x = index * step;
    const y = height - (Number(point[key] ?? 0) / max) * (height - 28) - 14;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return { line, area, coords };
}

export function TrendAreaChart({
  points,
  empty,
}: {
  points: ChartPoint[];
  empty?: boolean;
}) {
  const safePoints = points.length > 0 ? points : [{ label: "Day 0", spend: 0, leads: 0 }];
  const spendPath = buildAreaPath(safePoints, "spend");
  const leadPath = buildAreaPath(safePoints, "leads");

  return (
    <div className="min-w-0">
      <div className="relative h-[260px] overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))]">
        <svg viewBox="0 0 560 220" className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Spend and leads trend">
          <defs>
            <linearGradient id="spend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.38)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
            </linearGradient>
            <linearGradient id="lead-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(16,185,129,0.32)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
            </linearGradient>
          </defs>
          {[36, 78, 120, 162].map((y) => (
            <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
          ))}
          <path d={spendPath.area} fill="url(#spend-fill)" opacity={empty ? 0.45 : 1} />
          <path d={leadPath.area} fill="url(#lead-fill)" opacity={empty ? 0.35 : 0.82} />
          <path d={spendPath.line} fill="none" stroke="rgb(34,211,238)" strokeDasharray={empty ? "8 10" : undefined} strokeLinecap="round" strokeWidth="4" />
          <path d={leadPath.line} fill="none" stroke="rgb(52,211,153)" strokeDasharray={empty ? "6 10" : undefined} strokeLinecap="round" strokeWidth="3" />
          {spendPath.coords.map(([x, y], index) => (
            <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r="5" fill="rgb(34,211,238)" opacity={safePoints[index]?.actual === false ? 0.35 : 0.95} />
          ))}
        </svg>
        {empty ? (
          <div className="absolute inset-x-4 top-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Day 0 launch baseline is ready. Live points will replace this scaffold after Meta returns delivery metrics.
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground sm:grid-cols-5">
        {safePoints.map((point) => (
          <div key={point.label} className="truncate rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-center">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

type BarItem = {
  label: string;
  value: number;
  max?: number;
  detail?: string;
  tone?: Tone;
};

export function MiniBarChart({ items }: { items: BarItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const max = Math.max(item.max ?? item.value, 1);
        const percent = Math.max(0, Math.min(100, (item.value / max) * 100));
        const tone = item.tone ?? "accent";

        return (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{item.label}</span>
              <span className={cn("shrink-0 font-semibold", toneText[tone])}>{item.value.toLocaleString()}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full border border-white/8 bg-white/[0.045]">
              <div
                className={cn(
                  "h-full rounded-full",
                  tone === "success"
                    ? "bg-emerald-300"
                    : tone === "warning"
                      ? "bg-amber-300"
                      : tone === "info"
                        ? "bg-sky-300"
                        : "bg-cyan-300",
                )}
                style={{ width: `${Math.max(percent, item.value > 0 ? 8 : 2)}%` }}
              />
            </div>
            {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function NextActionPanel({
  title,
  action,
  detail,
  tone = "accent",
}: {
  title: string;
  action: string;
  detail?: string;
  tone?: Tone;
}) {
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "warning" ? Clock3 : tone === "danger" ? CircleAlert : Activity;

  return (
    <div className={cn("rounded-[24px] border p-5", toneRing[tone])}>
      <div className="flex items-start gap-3">
        <span className={cn("rounded-full border p-2", toneRing[tone], toneText[tone])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p className="mt-2 text-lg font-semibold leading-7 text-foreground">{action}</p>
          {detail ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function DashboardVisualMarker() {
  return (
    <span className="sr-only" data-dashboard-visual-components="MetricTile DashboardChartPanel TrendAreaChart MiniBarChart NextActionPanel">
      Dashboard visual components loaded
    </span>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-cyan-300" /> Spend</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-300" /> Leads</span>
      <span className="inline-flex items-center gap-2"><BarChart3 className="size-3 text-cyan-200" /> Funnel movement</span>
    </div>
  );
}
