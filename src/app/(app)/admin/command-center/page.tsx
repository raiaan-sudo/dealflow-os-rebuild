import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/route";
import {
  assertInternalOperatorAccess,
  loadIssueLogRows,
  loadLaunchMonitorRows,
  type LaunchMonitorRow,
  type OperatorIssueRow,
} from "@/lib/services/internal-launch-monitor";
import { getSmsOutboundPolicyStatus } from "@/lib/services/sms-service";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { CommandCenterConsole } from "./command-center-console";
import type {
  AgentConsole,
  CommandCenterIssue,
  ProofEvent,
  ReadinessMetric,
  WorkLogEntry,
} from "./command-center-console";

type OpsSummary = {
  available: boolean;
  failedJobs: number | null;
  processingJobs: number | null;
  deadLetterJobs: number | null;
  recentStripeFailures: number | null;
  recentStripeProcessed: number | null;
};

function countOrNull(result: { count: number | null; error: unknown }) {
  return result.error ? null : result.count ?? 0;
}

async function loadOpsSummary(): Promise<OpsSummary> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      available: false,
      failedJobs: null,
      processingJobs: null,
      deadLetterJobs: null,
      recentStripeFailures: null,
      recentStripeProcessed: null,
    };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [failedJobs, processingJobs, deadLetterJobs, stripeFailures, stripeProcessed] =
    await Promise.all([
      admin.from("system_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin.from("system_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
      admin.from("system_jobs").select("id", { count: "exact", head: true }).not("dead_lettered_at", "is", null),
      admin
        .from("stripe_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", since),
      admin
        .from("stripe_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "processed")
        .gte("created_at", since),
    ]);

  const counts = {
    failedJobs: countOrNull(failedJobs),
    processingJobs: countOrNull(processingJobs),
    deadLetterJobs: countOrNull(deadLetterJobs),
    recentStripeFailures: countOrNull(stripeFailures),
    recentStripeProcessed: countOrNull(stripeProcessed),
  };

  return {
    available: Object.values(counts).every((count) => count !== null),
    ...counts,
  };
}

function percentage(numerator: number, denominator: number, available: boolean) {
  if (!available || denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 100);
}

function countLabel(value: number | null, suffix: string) {
  return value === null ? "Unavailable" : `${value} ${suffix}`;
}

export default async function CommandCenterPage() {
  try {
    await assertInternalOperatorAccess();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    throw error;
  }

  const rowsResult = await loadLaunchMonitorRows(24)
    .then((rows) => ({ available: true as const, rows }))
    .catch(() => ({ available: false as const, rows: [] as LaunchMonitorRow[] }));
  const [ops, issuesResult] = await Promise.all([
    loadOpsSummary().catch(() => ({
      available: false,
      failedJobs: null,
      processingJobs: null,
      deadLetterJobs: null,
      recentStripeFailures: null,
      recentStripeProcessed: null,
    } satisfies OpsSummary)),
    loadIssueLogRows(36, rowsResult.rows)
      .then((issues) => ({ available: true as const, issues }))
      .catch(() => ({ available: false as const, issues: [] as OperatorIssueRow[] })),
  ]);

  const rows = rowsResult.rows;
  const issues = issuesResult.issues;
  const liveCampaigns = rows.filter(
    (row) => row.launchStatus.includes("completed") || row.launchStatus.includes("live"),
  );
  const cleanCampaigns = rows.filter(
    (row) => !row.consistencyMismatch && row.consistencyMissingFields.length === 0,
  );
  const verifiedLeads = rows.filter((row) => row.leadLoopVerified);
  const metaReady = rows.filter(
    (row) =>
      row.metaConnectionStatus.includes("connected") ||
      row.preflightStatus.includes("passed") ||
      row.preflightStatus.includes("selection"),
  );
  const planMismatchCount = rows.filter((row) => row.consistencyMismatch).length;
  const validationAlertCount = rowsResult.available
    ? planMismatchCount + rows.filter((row) => row.consistencyMissingFields.length > 0).length
    : null;
  const unresolvedIssues = issuesResult.available
    ? issues.filter((issue) => issue.status !== "resolved").length
    : null;
  const smsPolicy = getSmsOutboundPolicyStatus();

  const metrics: ReadinessMetric[] = [
    {
      label: "Live/complete coverage",
      value: percentage(liveCampaigns.length, rows.length, rowsResult.available),
      detail:
        rows.length > 0
          ? `${liveCampaigns.length}/${rows.length} monitored campaign rows report live or complete.`
          : rowsResult.available
            ? "No monitored campaign rows are available; no percentage is asserted."
            : "Campaign monitoring data is unavailable.",
      sourceLabel: "observed database coverage",
      tone: "cyan",
    },
    {
      label: "Plan consistency coverage",
      value: percentage(cleanCampaigns.length, rows.length, rowsResult.available),
      detail:
        rows.length > 0
          ? `${cleanCampaigns.length}/${rows.length} monitored plans have no detected consistency gap.`
          : "No denominator is available; no readiness claim is made.",
      sourceLabel: "observed database coverage",
      tone: "green",
    },
    {
      label: "Lead-loop proof coverage",
      value: percentage(verifiedLeads.length, rows.length, rowsResult.available),
      detail:
        rows.length > 0
          ? `${verifiedLeads.length}/${rows.length} monitored plans carry a persisted lead-loop verification marker.`
          : "No denominator is available; no proof percentage is asserted.",
      sourceLabel: "persisted marker coverage",
      tone: "amber",
    },
    {
      label: "Meta-ready signal coverage",
      value: percentage(metaReady.length, rows.length, rowsResult.available),
      detail:
        rows.length > 0
          ? `${metaReady.length}/${rows.length} monitored rows expose a connected or preflight-ready signal.`
          : "No monitored rows are available; provider readiness is not proven.",
      sourceLabel: "observed app state, not provider proof",
      tone: "blue",
    },
  ];

  const agents: AgentConsole[] = [
    {
      id: "jarvis",
      name: "JARVIS",
      role: "Meta signal monitor",
      status: rowsResult.available ? "Observed app-state signals" : "Data unavailable",
      readiness: percentage(metaReady.length, rows.length, rowsResult.available),
      readinessLabel: "observed signal coverage",
      signal:
        rowsResult.available
          ? `${metaReady.length}/${rows.length} monitored campaigns expose a connected/preflight-ready app signal. This is not live Graph API proof.`
          : "Campaign monitor query was unavailable; no Meta readiness claim is made.",
      tone: "cyan",
      logs: [
        "Source: tenant campaign rows and persisted preflight state.",
        "Provider-side delivery, PAUSED state, and idempotent replay are not queried by this page.",
      ],
    },
    {
      id: "friday",
      name: "FRIDAY",
      role: "Security evidence monitor",
      status: "Live security score not implemented",
      readiness: null,
      readinessLabel: "unavailable",
      signal: "This page has no current CI, route-scan, or vulnerability feed, so it does not infer a security percentage.",
      tone: "green",
      logs: [
        "Internal access is allowlist-gated before this page loads.",
        "Run artifacts and CI evidence must be reviewed outside this page.",
      ],
    },
    {
      id: "edith",
      name: "EDITH",
      role: "Queue and billing monitor",
      status: ops.available ? "24-hour operational counts loaded" : "Operational counts unavailable",
      readiness: null,
      readinessLabel: "counts only; no score",
      signal: `${countLabel(ops.processingJobs, "processing jobs")}, ${countLabel(ops.deadLetterJobs, "dead-letter jobs")}, ${countLabel(ops.recentStripeProcessed, "processed Stripe events / 24h")}.`,
      tone: "amber",
      logs: [
        `Failed jobs: ${ops.failedJobs ?? "unavailable"}.`,
        `Failed Stripe events in 24h: ${ops.recentStripeFailures ?? "unavailable"}.`,
        "A zero count means the query returned zero; unavailable means the query was not proven.",
      ],
    },
    {
      id: "veronica",
      name: "VERONICA",
      role: "Issue and consistency monitor",
      status:
        rowsResult.available && issuesResult.available
          ? "Current query window loaded"
          : "One or more data sources unavailable",
      readiness: percentage(cleanCampaigns.length, rows.length, rowsResult.available),
      readinessLabel: "plan consistency coverage",
      signal: `${validationAlertCount ?? "Unavailable"} validation alerts, ${rowsResult.available ? rows.length : "unavailable"} campaigns observed, ${issuesResult.available ? issues.length : "unavailable"} issue rows indexed.`,
      tone: "violet",
      logs: [
        "Issue radar sources: failed/stuck jobs, failed Stripe webhooks, provider reservations/failures, plan consistency, and support tickets.",
        "Absence of returned issues is not a substitute for end-to-end production proof.",
      ],
    },
  ];

  const proofs: ProofEvent[] = [
    {
      label: "Stripe webhook window",
      value: ops.available ? `${ops.recentStripeProcessed} processed` : "unavailable",
      detail: ops.available
        ? `${ops.recentStripeFailures} failed and ${ops.recentStripeProcessed} processed events were returned for the last 24 hours. Replay idempotency is not re-tested here.`
        : "Stripe event counts could not be loaded; no health claim is made.",
      tone: ops.recentStripeFailures && ops.recentStripeFailures > 0 ? "amber" : "blue",
    },
    {
      label: "Meta provider proof",
      value: "not queried",
      detail: "This page reads persisted application state only. It does not call Meta or prove provider-side status.",
      tone: "blue",
    },
    {
      label: "Browser journey proof",
      value: "not connected",
      detail: "No browser-run evidence feed is connected to this page; inspect the release evidence bundle for current test artifacts.",
      tone: "blue",
    },
    {
      label: "Issue radar",
      value: unresolvedIssues === null ? "unavailable" : `${unresolvedIssues} unresolved`,
      detail:
        unresolvedIssues === null
          ? "The issue query was unavailable; a clear state is not asserted."
          : `${unresolvedIssues} unresolved rows were returned in the current radar window.`,
      tone: unresolvedIssues && unresolvedIssues > 0 ? "amber" : "blue",
    },
    {
      label: "SMS guard",
      value: smsPolicy.automationEnabled ? "enabled by configuration" : "blocked by default",
      detail: smsPolicy.automationEnabled
        ? "Configuration permits outbound automation; per-lead consent and opt-out enforcement remain separate runtime checks."
        : "Outbound automation is configuration-blocked. This does not test inbound provider delivery.",
      tone: smsPolicy.automationEnabled ? "amber" : "green",
    },
  ];

  const workLog: WorkLogEntry[] = [
    {
      agent: "JARVIS",
      title: "Meta evidence boundary",
      status: "observed",
      detail: "Shows persisted app signals and labels provider-side status as unproven.",
    },
    {
      agent: "FRIDAY",
      title: "Security evidence feed",
      status: "unavailable",
      detail: "No live CI or scanner feed is connected; no percentage is manufactured.",
    },
    {
      agent: "EDITH",
      title: "Operational query window",
      status: ops.available ? "observed" : "unavailable",
      detail: "Displays query-backed job and Stripe counts without converting them into readiness scores.",
    },
    {
      agent: "VERONICA",
      title: "Issue radar query",
      status: issuesResult.available ? "observed" : "unavailable",
      detail: "Surfaces returned issue rows and preserves an explicit unavailable state on query failure.",
    },
  ];

  const commandIssues: CommandCenterIssue[] = issues.slice(0, 8).map((issue) => ({
    id: issue.id,
    source: issue.source,
    severity: issue.severity,
    title: issue.title,
    detail: issue.detail,
    status: issue.status,
    createdAt: issue.createdAt,
    route: issue.route,
  }));

  return (
    <CommandCenterConsole
      agents={agents}
      dataStatus={{
        campaignsAvailable: rowsResult.available,
        issuesAvailable: issuesResult.available,
        operationsAvailable: ops.available,
      }}
      issues={commandIssues}
      metrics={metrics}
      proofs={proofs}
      stats={{
        campaigns: rowsResult.available ? rows.length : null,
        liveCampaigns: rowsResult.available ? liveCampaigns.length : null,
        cleanCampaigns: rowsResult.available ? cleanCampaigns.length : null,
        leadVerified: rowsResult.available ? verifiedLeads.length : null,
        failedJobs: ops.failedJobs,
        stripeFailures: ops.recentStripeFailures,
        validationAlerts: validationAlertCount,
        smsAutomationEnabled: smsPolicy.automationEnabled,
      }}
      workLog={workLog}
    />
  );
}
