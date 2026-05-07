import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/route";
import {
  assertInternalOperatorAccess,
  loadIssueLogRows,
  loadLaunchMonitorRows,
} from "@/lib/services/internal-launch-monitor";
import { getSmsOutboundPolicyStatus } from "@/lib/services/sms-service";
import { loadCustomerSuccessChecklistRows } from "@/lib/services/customer-success-service";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { CommandCenterConsole } from "./command-center-console";
import type {
  AgentConsole,
  CommandCenterIssue,
  ProofEvent,
  ReadinessMetric,
  WorkLogEntry,
} from "./command-center-console";
import type { CustomerSuccessChecklist } from "@/lib/services/customer-success-service";

type OpsSummary = {
  failedJobs: number;
  processingJobs: number;
  deadLetterJobs: number;
  recentStripeFailures: number;
  recentStripeProcessed: number;
};

async function loadOpsSummary(): Promise<OpsSummary> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      failedJobs: 0,
      processingJobs: 0,
      deadLetterJobs: 0,
      recentStripeFailures: 0,
      recentStripeProcessed: 0,
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

  return {
    failedJobs: failedJobs.count ?? 0,
    processingJobs: processingJobs.count ?? 0,
    deadLetterJobs: deadLetterJobs.count ?? 0,
    recentStripeFailures: stripeFailures.count ?? 0,
    recentStripeProcessed: stripeProcessed.count ?? 0,
  };
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

  const [rows, ops, issues] = await Promise.all([
    loadLaunchMonitorRows(24),
    loadOpsSummary(),
    loadIssueLogRows(36),
  ]);

  const liveCampaigns = rows.filter((row) => row.launchStatus.includes("completed") || row.launchStatus.includes("live"));
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
  const validationAlertCount =
    planMismatchCount + rows.filter((row) => row.consistencyMissingFields.length > 0).length;
  const operatorAlertCount =
    ops.failedJobs + ops.deadLetterJobs + ops.recentStripeFailures + planMismatchCount;
  const unresolvedIssues = issues.filter((issue) => issue.status !== "resolved").length;
  const smsPolicy = getSmsOutboundPolicyStatus();
  const customerSuccess = await loadCustomerSuccessChecklistRows(rows, 12).catch(
    () => [] as CustomerSuccessChecklist[],
  );
  const customerSuccessDue = customerSuccess.filter((checklist) => checklist.dueCount > 0).length;
  const customerSuccessAtRisk = customerSuccess.filter(
    (checklist) => checklist.riskLevel === "blocked" || checklist.riskLevel === "at_risk",
  ).length;

  const metrics: ReadinessMetric[] = [
    {
      label: "Controlled beta",
      value: 100,
      detail: "Operator readiness score from latest proof run; verify smoke checks before each launch window.",
      sourceLabel: "manual proof score",
      tone: "cyan",
    },
    {
      label: "100-client live",
      value: 100,
      detail: "Operator readiness score from persisted proof notes, route checks, and smoke validation.",
      sourceLabel: "manual proof score",
      tone: "green",
    },
    {
      label: "Self-serve launch",
      value: smsPolicy.automationEnabled ? 90 : 86,
      detail: smsPolicy.automationEnabled
        ? "SMS automation guard is enabled with compliance acknowledgement."
        : "SMS automation remains default-off until Twilio and compliance gates are explicitly enabled.",
      sourceLabel: "guarded readiness score",
      tone: "amber",
    },
    {
      label: "1,000-client scale",
      value: 62,
      detail: "Estimated scale score; needs load-test proof, external alerting, and deeper isolation tests.",
      sourceLabel: "estimated, not live telemetry",
      tone: "blue",
    },
  ];

  const metaSignal =
    rows.length > 0 && metaReady.length === rows.length
      ? "All monitored campaigns show connected/preflight-ready Meta signals."
      : `${metaReady.length}/${rows.length} monitored campaigns show ready Meta signals.`;
  const issueSignal =
    unresolvedIssues > 0
      ? `${unresolvedIssues} unresolved operator issues on radar.`
      : "No unresolved operator issues in current radar window.";

  const agents: AgentConsole[] = [
    {
      id: "jarvis",
      name: "JARVIS",
      role: "Meta Launch Sentinel",
      status: "Paused retry proof complete",
      readiness: rows.length > 0 && metaReady.length === rows.length ? 100 : 92,
      readinessLabel: "manual proof score",
      signal: metaSignal,
      tone: "cyan",
      logs: [
        "Operator-recorded Meta proof covered known production DB objects.",
        "Prior proof returned PAUSED/effective PAUSED for monitored activatable objects.",
        "Prior retry proof returned alreadyLaunched=true with persisted campaign/ad IDs.",
        "No Meta create, update, activation, or spend path was triggered.",
      ],
    },
    {
      id: "friday",
      name: "FRIDAY",
      role: "Security Cortex",
      status: "Route lockdown active",
      readiness: operatorAlertCount > 0 ? 88 : 98,
      readinessLabel: "CI-backed operator score",
      signal: "Public API allowlist, same-origin guards, and dynamic ownership markers are checked in CI.",
      tone: "green",
      logs: [
        "Added route-security diagnostic and CI gate.",
        "Confirmed public API surface is limited to lead capture, Stripe webhook, Meta callback, and Twilio webhook.",
        "Confirmed private mutating routes include same-origin protection markers.",
        "Confirmed diagnostic routes return protected responses in production.",
      ],
    },
    {
      id: "edith",
      name: "EDITH",
      role: "Reliability Reactor",
      status: "Queues, leads, and billing guarded",
      readiness: ops.deadLetterJobs > 0 || ops.recentStripeFailures > 0 ? 88 : 98,
      readinessLabel: "live DB + proof score",
      signal: `${ops.processingJobs} processing jobs, ${ops.deadLetterJobs} dead-letter jobs, ${ops.recentStripeProcessed} Stripe events / 24h.`,
      tone: "amber",
      logs: [
        "Added deterministic lead_capture_retry idempotency key derivation.",
        "Improved max_attempts and last_error_code persistence across job lifecycle.",
        "Verified valid lead save, invalid rejection, duplicate dedupe, and staging smoke.",
        "Verified Stripe signed event replay stayed single-row and single-billing-state.",
      ],
    },
    {
      id: "veronica",
      name: "VERONICA",
      role: "Operator Armor",
      status: "Command console deployed",
      readiness: validationAlertCount > 0 ? 84 : 96,
      readinessLabel: "live DB + manual proof score",
      signal: `${validationAlertCount} validation alerts, ${rows.length} campaigns watched, ${issues.length} issue rows indexed.`,
      tone: "violet",
      logs: [
        "Built cockpit HUD with agent drill-down and browser SpeechSynthesis briefing.",
        "Added live issue radar from failed jobs, failed webhooks, and campaign consistency drift.",
        "SMS automation is surfaced as guarded/default-off unless compliance env gates and consent records are present.",
        "Kept dashboard admin-only, provider-free, and secret-safe.",
        "Readiness values are labeled as operator scores or estimates when not live telemetry.",
      ],
    },
    {
      id: "pepper",
      name: "PEPPER",
      role: "Customer Success Watch",
      status: customerSuccessDue > 0 ? "Follow-ups due" : "Checklist calm",
      readiness: customerSuccessAtRisk > 0 ? 82 : customerSuccessDue > 0 ? 90 : 98,
      readinessLabel: "live checklist score",
      signal:
        customerSuccess.length > 0
          ? `${customerSuccessDue}/${customerSuccess.length} watched accounts have customer-success checklist items due.`
          : "No customer-success checklist rows are currently in the watch window.",
      tone: customerSuccessAtRisk > 0 ? "red" : customerSuccessDue > 0 ? "amber" : "green",
      logs: [
        "Tracks onboarding review, creative QA, preview review, billing, Meta, assets, launch readiness, and lead-loop status.",
        "Tracks day 7 check-in, day 14 value proof, and day 25 renewal-risk review due dates.",
        "Customer communications are not sent from this layer; operators use the runbook before contacting customers.",
        "Rep KPIs, commissions, and EOD systems are intentionally out of scope for this launch layer.",
      ],
    },
  ];

  const proofs: ProofEvent[] = [
    {
      label: "Stripe replay",
      value: "operator proof",
      detail: "Operator-recorded proof: evt_1TRGD8EF3q1nrT5Us3OKTXmK delivered and resent 200 OK; one DB row, one active billing row.",
      tone: ops.recentStripeFailures > 0 ? "amber" : "green",
    },
    {
      label: "Meta PAUSED proof",
      value: "operator proof",
      detail: "Operator-recorded proof: persisted retry reused existing Meta IDs; activatable objects verified PAUSED.",
      tone: "green",
    },
    {
      label: "Browser smoke",
      value: "operator proof",
      detail: "Operator-recorded proof: authenticated admin/product screens loaded with no critical console errors; public lead flow passed.",
      tone: "green",
    },
    {
      label: "Issue radar",
      value: unresolvedIssues > 0 ? `${unresolvedIssues} open` : "clear",
      detail: issueSignal,
      tone: unresolvedIssues > 0 ? "amber" : "green",
    },
    {
      label: "SMS guard",
      value: smsPolicy.automationEnabled ? "enabled" : "blocked",
      detail: smsPolicy.automationEnabled
        ? "Twilio outbound automation has env gates enabled; per-lead consent and opt-out checks still apply."
        : "Outbound automation is blocked by default; inbound STOP, START, HELP, and MessageSid idempotency remain active.",
      tone: smsPolicy.automationEnabled ? "green" : "amber",
    },
  ];

  const workLog: WorkLogEntry[] = [
    {
      agent: "JARVIS",
      title: "Meta retry/idempotency proof",
      status: "operator proof",
      detail: "Operator-recorded read-only Graph verification and persisted retry proof completed without creating or activating objects.",
    },
    {
      agent: "FRIDAY",
      title: "Route security CI gate",
      status: "complete",
      detail: "Public API allowlist, same-origin mutation guards, and dynamic route ownership markers now checked by CI.",
    },
    {
      agent: "EDITH",
      title: "Lead retry and job observability",
      status: "complete",
      detail: "Lead retry jobs now derive durable idempotency keys and preserve job attempt/error metadata.",
    },
    {
      agent: "VERONICA",
      title: "JARVIS command center",
      status: "complete",
      detail: "Cockpit HUD, clickable agents, voice briefing, proof panels, labeled readiness scores, and issue radar deployed.",
    },
    {
      agent: "PEPPER",
      title: "Launch customer-success checklist",
      status: "complete",
      detail: "Command center surfaces due onboarding, creative, billing, Meta, lead-loop, and first-25-day customer-success follow-ups.",
    },
  ];

  const commandIssues: CommandCenterIssue[] = issues.map((issue) => ({
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
      issues={commandIssues}
      metrics={metrics}
      proofs={proofs}
      stats={{
        campaigns: rows.length,
        liveCampaigns: liveCampaigns.length,
        cleanCampaigns: cleanCampaigns.length,
        leadVerified: verifiedLeads.length,
        failedJobs: ops.failedJobs,
        stripeFailures: ops.recentStripeFailures,
        validationAlerts: validationAlertCount,
        smsAutomationEnabled: smsPolicy.automationEnabled,
        customerSuccessDue,
        customerSuccessAtRisk,
      }}
      customerSuccess={customerSuccess}
      workLog={workLog}
    />
  );
}
