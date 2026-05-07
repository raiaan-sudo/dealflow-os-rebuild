import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Bug, CheckCircle2, Download, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api/route";
import {
  assertInternalOperatorAccess,
  loadIssueLogRows,
} from "@/lib/services/internal-launch-monitor";
import type { OperatorIssueRow } from "@/lib/services/internal-launch-monitor";

const ISSUE_SOURCE_ORDER: OperatorIssueRow["source"][] = [
  "client_error",
  "provider_cost",
  "provider_usage",
  "customer_success",
  "system_job",
  "stripe_webhook",
  "billing_recovery",
  "activation",
  "value_report",
  "campaign_plan",
];

const ISSUE_SOURCE_LABELS: Record<OperatorIssueRow["source"], string> = {
  activation: "Activation",
  billing_recovery: "Billing recovery",
  campaign_plan: "Campaign plan",
  client_error: "Client errors",
  customer_success: "Customer success",
  provider_cost: "Provider cost",
  provider_usage: "Provider usage",
  stripe_webhook: "Stripe webhooks",
  system_job: "System jobs",
  value_report: "Value reports",
};

const ISSUE_SOURCE_DETAILS: Record<OperatorIssueRow["source"], string> = {
  activation: "Stalled setup or activation milestones that need operator follow-up.",
  billing_recovery: "Cancellation, suspension, or recovery states that may need owner review.",
  campaign_plan: "Campaign row and plan consistency drift before launch or optimization.",
  client_error: "Browser errors captured from product surfaces, grouped for engineering triage.",
  customer_success: "First-25-day onboarding, value proof, renewal-risk, and support follow-ups.",
  provider_cost: "Paid generation credit, quota, and daily spend guardrails.",
  provider_usage: "Failed or stale provider reservations that may block generation safely.",
  stripe_webhook: "Failed Stripe webhook processing that can affect billing state.",
  system_job: "Failed, dead-lettered, or expired worker jobs.",
  value_report: "Missing or stale customer value-report proof.",
};

function severityClass(severity: OperatorIssueRow["severity"]) {
  if (severity === "critical") {
    return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  }
  if (severity === "high") {
    return "border-orange-300/30 bg-orange-300/10 text-orange-100";
  }
  if (severity === "medium") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
  return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
}

function sourceLabel(source: OperatorIssueRow["source"]) {
  return ISSUE_SOURCE_LABELS[source] ?? source.replace(/_/g, " ");
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
  const year = date.getUTCFullYear();
  const hour = `${date.getUTCHours()}`.padStart(2, "0");
  const minute = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${month} ${day}, ${year}, ${hour}:${minute} UTC`;
}

function asFixPrompt(issues: OperatorIssueRow[]) {
  return [
    "You are Codex working on DealFlow OS. Investigate and fix the following production issue log.",
    "Rules: do not expose secrets, do not create real charges, do not create active Meta ads, keep paid providers guarded.",
    "Issues:",
    ...issues.map(
      (issue, index) =>
        `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.source} ${issue.rawReference}: ${issue.title}. Detail: ${issue.detail}. Route: ${issue.route ?? "none"}.`,
    ),
    "Return root cause, patch, validation results, and remaining risk.",
  ].join("\n");
}

export default async function IssuesPage() {
  try {
    await assertInternalOperatorAccess();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    throw error;
  }

  const issues = await loadIssueLogRows(100);
  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const high = issues.filter((issue) => issue.severity === "high").length;
  const open = issues.filter((issue) => issue.status === "open").length;
  const fixPrompt = asFixPrompt(issues.slice(0, 12));
  const groupedIssues = ISSUE_SOURCE_ORDER.map((source) => ({
    source,
    issues: issues.filter((issue) => issue.source === source),
  })).filter((group) => group.issues.length > 0);

  return (
    <div className="relative min-h-full overflow-hidden rounded-[32px] border border-cyan-300/16 bg-[#030811] p-5 text-cyan-50 shadow-[0_0_130px_-58px_rgba(34,211,238,0.55)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.12),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.05)_1px,transparent_1px)] bg-[size:38px_38px] opacity-35" />

      <div className="relative z-10 space-y-6">
        <header className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
          <div className="rounded-[28px] border border-cyan-300/18 bg-black/42 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                internal diagnostics
              </span>
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-amber-100">
                exportable fix intake
              </span>
            </div>
            <h1 className="mt-5 text-4xl font-black uppercase tracking-[-0.08em] text-white sm:text-5xl">
              Error / bug logs
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-cyan-100/68">
              Aggregated operator issues from failed jobs, failed Stripe webhooks, billing recovery states, customer-success follow-ups, activation stalls, stale value reports, and campaign consistency alerts.
              Use this page to copy a clean fix prompt when something needs to be routed back into engineering.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/24 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50"
                href="/admin/command-center"
              >
                <Bug className="size-4" />
                Back to command center
              </Link>
              <a
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/80"
                download="dealflow-issue-fix-prompt.txt"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(fixPrompt)}`}
              >
                <Download className="size-4" />
                Download fix prompt
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={ShieldAlert} label="Critical" value={critical} tone="red" />
            <MetricCard icon={AlertTriangle} label="High" value={high} tone="amber" />
            <MetricCard icon={Bug} label="Open" value={open} tone="cyan" />
            <MetricCard icon={CheckCircle2} label="Indexed" value={issues.length} tone="green" />
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-100/45">
                  issue queue
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  Current radar
                </h2>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-xs text-cyan-100">
                {issues.length} rows
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {groupedIssues.length > 0 ? (
                groupedIssues.map((group) => (
                  <section className="rounded-2xl border border-cyan-300/12 bg-white/[0.025] p-3" key={group.source}>
                    <div className="flex flex-wrap items-start justify-between gap-3 px-1">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{sourceLabel(group.source)}</h3>
                        <p className="mt-1 text-xs leading-5 text-cyan-100/52">
                          {ISSUE_SOURCE_DETAILS[group.source]}
                        </p>
                      </div>
                      <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] text-cyan-100">
                        {group.issues.length} row{group.issues.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {group.issues.map((issue) => (
                        <div
                          className="rounded-2xl border border-white/8 bg-white/[0.035] p-4"
                          key={issue.id}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${severityClass(issue.severity)}`}>
                                {issue.severity}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase text-cyan-100/60">
                                {sourceLabel(issue.source)}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase text-cyan-100/60">
                                {issue.status}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-cyan-100/45">
                              {formatDateTime(issue.createdAt)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-white">{issue.title}</p>
                          <p className="mt-2 text-sm leading-6 text-cyan-50/64">{issue.detail}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-cyan-100/50">
                            <span className="font-mono">ref: {issue.rawReference}</span>
                            {issue.route ? (
                              <Link className="text-cyan-100 underline-offset-4 hover:underline" href={issue.route}>
                                Open context
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm text-emerald-100">
                  No current production issues were found in the operator radar.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-100/45">
              codex handoff block
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
              Copy this into a fix run
            </h2>
            <pre className="mt-4 max-h-[640px] overflow-auto whitespace-pre-wrap rounded-2xl border border-cyan-300/12 bg-[#02050a] p-4 text-xs leading-6 text-cyan-50/72">
              {fixPrompt}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "red" | "amber" | "cyan" | "green";
}) {
  const className =
    tone === "red"
      ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
      : tone === "amber"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : tone === "green"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return (
    <div className={`rounded-[24px] border p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-5" />
        <span className="font-mono text-3xl font-black">{value}</span>
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] opacity-70">{label}</p>
    </div>
  );
}
