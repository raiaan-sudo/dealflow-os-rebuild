"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Bug,
  CheckCircle2,
  CircuitBoard,
  Crosshair,
  DatabaseZap,
  Download,
  Gauge,
  Radio,
  Radar,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type HudTone = "cyan" | "green" | "amber" | "blue" | "violet" | "red";

export type ReadinessMetric = {
  label: string;
  value: number;
  detail: string;
  sourceLabel: string;
  tone: HudTone;
};

export type AgentConsole = {
  id: string;
  name: string;
  role: string;
  status: string;
  readiness: number;
  readinessLabel: string;
  signal: string;
  tone: HudTone;
  logs: string[];
};

export type ProofEvent = {
  label: string;
  value: string;
  detail: string;
  tone: HudTone;
};

export type WorkLogEntry = {
  agent: string;
  title: string;
  status: string;
  detail: string;
};

export type CommandCenterIssue = {
  id: string;
  source: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  status: string;
  createdAt: string | null;
  route?: string | null;
};

type CommandCenterConsoleProps = {
  agents: AgentConsole[];
  issues: CommandCenterIssue[];
  metrics: ReadinessMetric[];
  proofs: ProofEvent[];
  stats: {
    campaigns: number;
    liveCampaigns: number;
    cleanCampaigns: number;
    leadVerified: number;
    failedJobs: number;
    stripeFailures: number;
    validationAlerts: number;
    smsAutomationEnabled: boolean;
  };
  workLog: WorkLogEntry[];
  lastUpdatedAt: string;
};

const agentIcons = {
  jarvis: Radar,
  friday: ShieldCheck,
  edith: DatabaseZap,
  veronica: Bot,
} as const;

function pct(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No timestamp";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const hour = `${date.getUTCHours()}`.padStart(2, "0");
  const minute = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${month} ${day}, ${hour}:${minute} UTC`;
}

function toneClasses(tone: HudTone) {
  if (tone === "green") {
    return {
      border: "border-emerald-300/35",
      bg: "bg-emerald-300/10",
      text: "text-emerald-100",
      glow: "shadow-[0_0_42px_rgba(52,211,153,0.24)]",
      line: "from-emerald-300 to-cyan-200",
    };
  }
  if (tone === "amber") {
    return {
      border: "border-amber-300/35",
      bg: "bg-amber-300/10",
      text: "text-amber-100",
      glow: "shadow-[0_0_42px_rgba(251,191,36,0.2)]",
      line: "from-amber-300 to-cyan-200",
    };
  }
  if (tone === "red") {
    return {
      border: "border-rose-300/35",
      bg: "bg-rose-300/10",
      text: "text-rose-100",
      glow: "shadow-[0_0_42px_rgba(251,113,133,0.22)]",
      line: "from-rose-300 to-amber-200",
    };
  }
  if (tone === "violet") {
    return {
      border: "border-fuchsia-300/35",
      bg: "bg-fuchsia-300/10",
      text: "text-fuchsia-100",
      glow: "shadow-[0_0_42px_rgba(217,70,239,0.2)]",
      line: "from-fuchsia-300 to-cyan-200",
    };
  }
  if (tone === "blue") {
    return {
      border: "border-blue-300/35",
      bg: "bg-blue-300/10",
      text: "text-blue-100",
      glow: "shadow-[0_0_42px_rgba(96,165,250,0.2)]",
      line: "from-blue-300 to-cyan-200",
    };
  }
  return {
    border: "border-cyan-300/35",
    bg: "bg-cyan-300/10",
    text: "text-cyan-100",
    glow: "shadow-[0_0_42px_rgba(34,211,238,0.22)]",
    line: "from-cyan-300 to-emerald-200",
  };
}

function severityTone(severity: CommandCenterIssue["severity"]): HudTone {
  if (severity === "critical" || severity === "high") {
    return "red";
  }
  if (severity === "medium") {
    return "amber";
  }
  return "blue";
}

export function CommandCenterConsole({
  agents,
  issues,
  metrics,
  proofs,
  stats,
  workLog,
  lastUpdatedAt,
}: CommandCenterConsoleProps) {
  const [activeAgentId, setActiveAgentId] = useState(agents[0]?.id ?? "");
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];
  const criticalIssues = issues.filter((issue) => issue.severity === "critical" || issue.severity === "high");

  const briefing = useMemo(() => {
    const agentStatus = activeAgent
      ? `${activeAgent.name} is assigned to ${activeAgent.role}. ${activeAgent.status}.`
      : "No active agent selected.";
    return [
      "DealFlow command center briefing.",
      `Controlled beta and 100 client readiness are operator scores at ${metrics[0]?.value ?? 0} and ${metrics[1]?.value ?? 0} percent.`,
      agentStatus,
      `${criticalIssues.length} high priority issues are on radar.`,
      "Stripe replay and Meta paused retry proof are complete.",
    ].join(" ");
  }, [activeAgent, criticalIssues.length, metrics]);

  function speakBriefing() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(briefing);
    utterance.rate = 0.92;
    utterance.pitch = 0.76;
    window.speechSynthesis.speak(utterance);
  }

  function exportIssues() {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: "DealFlow OS Command Center",
      issues,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dealflow-issue-log-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative min-h-full overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#02060d] text-cyan-50 shadow-[0_0_120px_-60px_rgba(34,211,238,0.7)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(14,165,233,0.22),transparent_30%),radial-gradient(circle_at_88%_14%,rgba(34,197,94,0.12),transparent_22%),radial-gradient(circle_at_10%_70%,rgba(217,70,239,0.12),transparent_22%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.07)_1px,transparent_1px)] bg-[size:36px_36px] opacity-35" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(103,232,249,0.14),transparent)]" />
      <div className="pointer-events-none absolute inset-3 rounded-[20px] border border-cyan-200/12" />

      <div className="relative z-10 space-y-4 p-3 sm:p-4">
        <header className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="relative overflow-hidden rounded-[22px] border border-cyan-300/25 bg-black/48 p-4 shadow-[inset_0_1px_0_rgba(186,230,253,0.16)]">
            <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full border border-cyan-200/20" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-px w-2/3 bg-[linear-gradient(90deg,transparent,rgba(103,232,249,0.8))]" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100">
                Stark command layer
              </span>
              <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/80">
                command_center_v4.1
              </span>
            </div>
            <h1 className="mt-4 max-w-3xl text-balance text-3xl font-black uppercase tracking-normal text-white sm:text-5xl">
              DealFlow control room
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-100/72">
              Operational HUD for readiness, launch proof, autonomous agent work, and error intake.
              Confirmed telemetry is separated from estimated signals so support can act fast.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100/45">
              Last updated {formatDateTime(lastUpdatedAt)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-200/18"
                onClick={speakBriefing}
                type="button"
              >
                <Volume2 className="size-4" />
                Brief me
              </button>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.09]"
                href="/admin/issues"
              >
                <Bug className="size-4" />
                Error logs
              </Link>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.09]"
                onClick={exportIssues}
                type="button"
              >
                <Download className="size-4" />
                Export issues
              </button>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <HudCore metrics={metrics} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <StatPanel icon={Activity} label="Campaigns watched" value={stats.campaigns} />
              <StatPanel icon={CheckCircle2} label="Live/complete" value={stats.liveCampaigns} />
              <StatPanel icon={Gauge} label="Clean plans" value={stats.cleanCampaigns} />
              <StatPanel icon={Radio} label="Lead verified" value={stats.leadVerified} />
              <StatPanel icon={ShieldCheck} label="SMS guard" value={stats.smsAutomationEnabled ? "Enabled" : "Blocked"} />
            </div>
          </section>
        </header>

        <section className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-[22px] border border-cyan-200/18 bg-black/42 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/55">
                  Agent matrix
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  Select an operator
                </h2>
              </div>
              <Crosshair className="size-5 text-cyan-100/70" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {agents.map((agent) => (
                <AgentButton
                  agent={agent}
                  active={agent.id === activeAgent?.id}
                  key={agent.id}
                  onClick={() => setActiveAgentId(agent.id)}
                />
              ))}
            </div>
          </div>

          {activeAgent ? <AgentDetail agent={activeAgent} workLog={workLog.filter((entry) => entry.agent === activeAgent.name)} /> : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[22px] border border-cyan-200/18 bg-black/42 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/55">
                  Active proof stream
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  Launch evidence
                </h2>
              </div>
              <TerminalSquare className="size-5 text-cyan-100/70" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {proofs.map((proof) => (
                <ProofCard key={proof.label} proof={proof} />
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-cyan-200/18 bg-black/42 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/55">
                  Issue intake
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  Error / bug radar
                </h2>
              </div>
              <Link
                className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-50"
                href="/admin/issues"
              >
                Open all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {issues.length > 0 ? (
                issues.slice(0, 5).map((issue) => <IssueLine issue={issue} key={issue.id} />)
              ) : (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
                  No issues found in the current operator radar window.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function HudCore({ metrics }: { metrics: ReadinessMetric[] }) {
  const primary = metrics[1]?.value ?? 0;

  return (
    <div className="relative min-h-[330px] overflow-hidden rounded-[28px] border border-cyan-200/20 bg-black/44 p-5">
      <div className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/20" />
      <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/15" />
      <div className="absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/20" />
      <div className="absolute left-1/2 top-1/2 h-px w-[84%] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(103,232,249,0.7),transparent)]" />
      <div className="absolute left-1/2 top-1/2 h-[84%] w-px -translate-y-1/2 bg-[linear-gradient(180deg,transparent,rgba(103,232,249,0.55),transparent)]" />
      <div className="absolute left-1/2 top-1/2 size-72 origin-center -translate-x-1/2 -translate-y-1/2 animate-[spin_14s_linear_infinite] border-l border-cyan-200/70" />
      <div className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/45 bg-cyan-300/10 shadow-[0_0_70px_rgba(34,211,238,0.45)]" />
      <div className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_40px_rgba(103,232,249,0.9)]" />
      <div className="relative z-10 flex h-full min-h-[290px] flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100">
            operator score core
          </span>
          <span className="font-mono text-xs text-cyan-100/70">{pct(primary)} labeled score</span>
        </div>
        <div className="mx-auto w-full max-w-[240px] rounded-3xl border border-cyan-200/20 bg-black/62 p-4 text-center backdrop-blur">
          <Sparkles className="mx-auto size-6 text-cyan-100" />
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.26em] text-cyan-100/60">
            readiness score
          </p>
          <p className="mt-1 text-5xl font-black tracking-[-0.08em] text-white">{pct(primary)}</p>
        </div>
        <div className="grid gap-2">
          {metrics.map((metric) => {
            const tone = toneClasses(metric.tone);
            return (
              <div className="rounded-2xl border border-white/8 bg-black/40 px-3 py-2" key={metric.label}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-cyan-50/78">{metric.label}</span>
                  <span className="font-mono text-xs text-cyan-50">{pct(metric.value)}</span>
                </div>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100/42">
                  {metric.sourceLabel}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full bg-gradient-to-r ${tone.line}`} style={{ width: pct(metric.value) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatPanel({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[22px] border border-cyan-200/16 bg-black/42 p-4">
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-4 text-cyan-100/70" />
        <span className="font-mono text-2xl font-black text-white">{value}</span>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100/50">{label}</p>
    </div>
  );
}

function AgentButton({
  agent,
  active,
  onClick,
}: {
  agent: AgentConsole;
  active: boolean;
  onClick: () => void;
}) {
  const tone = toneClasses(agent.tone);
  const Icon = agentIcons[agent.id as keyof typeof agentIcons] ?? Bot;

  return (
    <button
      className={cn(
        "group rounded-[24px] border p-4 text-left transition",
        active
          ? `${tone.border} ${tone.bg} ${tone.glow}`
          : "border-cyan-200/12 bg-white/[0.035] hover:border-cyan-200/24 hover:bg-cyan-200/[0.06]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex size-11 items-center justify-center rounded-2xl border", tone.border, tone.bg)}>
          <Icon className={cn("size-5", tone.text)} />
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold", tone.border, tone.bg, tone.text)}>
          {agent.name}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold text-white">{agent.role}</p>
      <p className="mt-1 text-xs text-cyan-100/58">{agent.status}</p>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100/42">
        {agent.readinessLabel}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone.line}`} style={{ width: pct(agent.readiness) }} />
      </div>
    </button>
  );
}

function AgentDetail({
  agent,
  workLog,
}: {
  agent: AgentConsole;
  workLog: WorkLogEntry[];
}) {
  const tone = toneClasses(agent.tone);

  return (
    <div className={cn("relative overflow-hidden rounded-[28px] border bg-black/46 p-5", tone.border, tone.glow)}>
      <div className="pointer-events-none absolute right-8 top-8 size-32 rounded-full border border-cyan-200/10" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/55">Agent uplink</p>
          <h2 className="mt-2 text-3xl font-black uppercase tracking-[-0.07em] text-white">{agent.name}</h2>
          <p className={cn("mt-1 text-sm font-semibold", tone.text)}>{agent.role}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3 text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/45">{agent.readinessLabel}</p>
          <p className="text-3xl font-black text-white">{pct(agent.readiness)}</p>
        </div>
      </div>
      <p className="mt-4 rounded-2xl border border-white/8 bg-black/38 p-4 text-sm leading-6 text-cyan-50/72">
        {agent.signal}
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-100/50">Executed logs</p>
          <div className="mt-3 space-y-2">
            {agent.logs.map((log) => (
              <div className="rounded-2xl border border-cyan-200/10 bg-black/32 px-4 py-3 text-sm text-cyan-50/74" key={log}>
                {log}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-100/50">Workstream record</p>
          <div className="mt-3 space-y-2">
            {workLog.length > 0 ? (
              workLog.map((entry) => (
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3" key={entry.title}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{entry.title}</p>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-100">
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-cyan-50/62">{entry.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm text-cyan-50/62">
                No workstream record attached to this agent.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofCard({ proof }: { proof: ProofEvent }) {
  const tone = toneClasses(proof.tone);

  return (
    <div className={cn("rounded-[22px] border bg-white/[0.035] p-4", tone.border)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{proof.label}</p>
        <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase", tone.border, tone.bg, tone.text)}>
          {proof.value}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-cyan-50/66">{proof.detail}</p>
    </div>
  );
}

function IssueLine({ issue }: { issue: CommandCenterIssue }) {
  const tone = toneClasses(severityTone(issue.severity));

  return (
    <div className={cn("rounded-2xl border bg-black/34 p-3", tone.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", tone.border, tone.bg, tone.text)}>
              {issue.severity}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
              {issue.source}
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-white">{issue.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-cyan-50/58">{issue.detail}</p>
        </div>
        <span className="shrink-0 text-right font-mono text-[10px] text-cyan-100/45">
          {formatDateTime(issue.createdAt)}
        </span>
      </div>
    </div>
  );
}
