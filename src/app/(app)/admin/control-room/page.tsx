import { notFound } from "next/navigation";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  Bug,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  LifeBuoy,
  RadioTower,
  ServerCog,
  ShieldCheck,
  TimerReset,
  Workflow,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/lib/api/route";
import { META_OPERATOR_ASSISTED_ADMIN_CHECKLIST } from "@/lib/integrations/meta/operator-assisted";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { loadOpenOperatorDebtJobs, type OperatorDebtJob } from "@/lib/services/operator-debt-service";
import {
  loadScaleReadinessSnapshot,
  type ScaleHealthStatus,
  type ScaleReadinessSnapshot,
} from "@/lib/services/scale-readiness-service";

function statusClass(status: ScaleHealthStatus) {
  if (status === "GO") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "WATCH") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }

  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function number(value: number | null) {
  return value === null ? "n/a" : value.toLocaleString("en-US");
}

function currency(cents: number | null) {
  return cents === null ? "unavailable" : `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-5 text-slate-400">{detail}</p> : null}
    </div>
  );
}

function Section({
  title,
  status,
  icon: Icon,
  children,
}: {
  title: string;
  status: ScaleHealthStatus;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-[#07111d] p-4 shadow-[0_24px_80px_-56px_rgba(34,211,238,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/10 text-cyan-100">
            <Icon className="size-5" />
          </div>
          <h2 className="min-w-0 text-xl font-semibold tracking-[-0.04em] text-white">{title}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(status)}`}>
          {status}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function CapPressureList({ caps }: { caps: ScaleReadinessSnapshot["provider"]["capPressure"] }) {
  if (caps.length === 0) {
    return <Metric label="Cap pressure" value="clear" detail="No provider cap is above the 70% watch line." />;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:col-span-2 xl:col-span-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Provider caps</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {caps.map((cap) => (
          <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={cap.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-white">{cap.label}</span>
              <span className="font-mono text-cyan-100">{cap.usage}/{cap.limit}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300"
                style={{ width: `${Math.min(100, Math.round(cap.ratio * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassificationList({
  title,
  entries,
}: {
  title: string;
  entries: ScaleReadinessSnapshot["issueClassification"]["historicalReviewed"];
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
        <p className="mt-2 text-sm text-slate-300">none</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <div className="mt-3 grid gap-3">
        {entries.map((entry) => (
          <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={`${title}-${entry.subsystem}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-white">{entry.subsystem}</p>
              <span className="font-mono text-xs text-cyan-100">{entry.count}</span>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-400">{entry.reason}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{entry.recommendedAction}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortId(value: string | null) {
  if (!value) {
    return "none";
  }

  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function OperatorDebtList({ jobs }: { jobs: OperatorDebtJob[] }) {
  if (jobs.length === 0) {
    return (
      <section className="rounded-[26px] border border-emerald-300/18 bg-[#07111d] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-300/10 text-emerald-100">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 className="min-w-0 text-xl font-semibold tracking-[-0.04em] text-white">Operator debt V2</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">No unreviewed failed or dead-letter system jobs.</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase text-emerald-100">
            clear
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[26px] border border-amber-300/18 bg-[#07111d] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/18 bg-amber-300/10 text-amber-100">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h2 className="min-w-0 text-xl font-semibold tracking-[-0.04em] text-white">Operator debt V2</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Failed/dead-letter rows stay as evidence. Recovery actions only mark reviewed with an audit note.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase text-amber-100">
          {jobs.length} open
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {jobs.map((job) => (
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" key={job.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[10px] uppercase text-slate-300">
                    {job.kind}
                  </span>
                  <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-100">
                    {job.deadLetteredAt ? "dead-letter" : job.status}
                  </span>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] text-cyan-100">
                    {shortId(job.id)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{job.errorMessage ?? job.deadLetterReason ?? "No error message recorded."}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{job.recovery.recommendedAction}</p>
              </div>
              <div className="grid min-w-[220px] gap-1 rounded-xl border border-white/8 bg-black/20 p-3 text-xs text-slate-400">
                <span>org {shortId(job.organizationId)}</span>
                <span>campaign {shortId(job.campaignId)}</span>
                <span>attempts {job.attemptCount}/{job.maxAttempts}</span>
                <span>code {job.lastErrorCode ?? "none"}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.55fr]">
              <pre className="max-h-44 overflow-auto rounded-xl border border-white/8 bg-black/28 p-3 text-xs leading-5 text-slate-300">
                {JSON.stringify({ payload: job.payloadSummary, result: job.resultSummary }, null, 2)}
              </pre>
              <form action={`/api/admin/operator-debt/${job.id}`} className="grid content-start gap-2" method="post">
                <input type="hidden" name="action" value="acknowledge" />
                <textarea
                  className="min-h-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                  maxLength={1000}
                  name="note"
                  placeholder="Audit note for why this can be acknowledged"
                />
                <button
                  className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!job.recovery.acknowledgeAllowed}
                  type="submit"
                >
                  Acknowledge with audit note
                </button>
                <p className="text-xs leading-5 text-slate-500">
                  Retry allowed: {job.recovery.retryAllowed ? "yes" : "no"}. This action never retries, deletes, sends SMS/email, charges Stripe, calls GHL, mutates Meta, or runs providers.
                </p>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function ControlRoomPage() {
  try {
    await assertInternalOperatorAccess();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    throw error;
  }

  const [snapshot, operatorDebtJobs] = await Promise.all([
    loadScaleReadinessSnapshot(),
    loadOpenOperatorDebtJobs(20),
  ]);
  const hasBlockers = snapshot.blockers.length > 0;
  const metaFailureSignals =
    snapshot.meta.driftWarnings +
    snapshot.meta.destinationWarnings +
    snapshot.meta.duplicateObjectWarnings +
    snapshot.meta.trackingDomainWarnings;
  const autonomyWarnings = [
    snapshot.meta.spendAnomalyNote ? `Spend warning: ${snapshot.meta.spendAnomalyNote}` : null,
    snapshot.leadSms.leadsToday === 0 ? "Lead-quality warning: no leads recorded today." : null,
    snapshot.meta.staleSyncSnapshots > 0 ? `${snapshot.meta.staleSyncSnapshots} stale Meta sync snapshot warning(s).` : null,
    snapshot.provider.failed7d > 0 ? `${snapshot.provider.failed7d} provider failure(s) in the last 7 days.` : null,
  ].filter((item): item is string => Boolean(item));
  const rollbackNeededCount = metaFailureSignals + snapshot.provider.failed7d;
  const autonomyQueueRows = [
    {
      label: "Pending actions",
      count: 0,
      status: "pending",
      detail: "No durable autonomy action reader is wired into this page yet; pending rows must come from the autonomy service before execution can be claimed.",
    },
    {
      label: "Approved actions",
      count: 0,
      status: "approved",
      detail: "Approval UI is visible below. Approved counts stay zero until durable approvals are loaded.",
    },
    {
      label: "Executed actions",
      count: 0,
      status: "executed",
      detail: "No executed autonomy claim is made from scale-readiness data alone.",
    },
    {
      label: "Failed actions",
      count: metaFailureSignals,
      status: "failed",
      detail: "Meta drift, destination, duplicate object, and tracking warnings that need operator review.",
    },
    {
      label: "Rollback-needed",
      count: rollbackNeededCount,
      status: "rollback-needed",
      detail: "Rollback review is required when Meta/provider warnings indicate a change may need reversal.",
    },
  ];

  return (
    <div className="min-h-full overflow-hidden rounded-[30px] border border-cyan-300/16 bg-[#030711] p-4 text-slate-100 shadow-[0_0_140px_-70px_rgba(34,211,238,0.75)] sm:p-6">
      <div className="grid gap-5">
        <header className="rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,20,34,0.96),rgba(3,7,17,0.98))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(snapshot.status)}`}>
                  {snapshot.verdict}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-slate-300">
                  deploy {snapshot.deployId}
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-black uppercase tracking-[-0.07em] text-white sm:text-5xl">
                300-client control room
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                Daily operator view for queues, provider caps, billing, lead delivery, Meta drift,
                support readiness, and first-party client errors. The page reads existing durable
                tables only and never triggers Stripe, Meta, SMS, Freshdesk, or provider actions.
              </p>
            </div>
            <div className="grid min-w-[220px] gap-2 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Last updated</p>
                <p className="mt-1 font-medium text-white">{formatDateTime(snapshot.generatedAt)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Daily report</p>
                <p className="mt-1 font-medium text-white">npm run operator:scale-report</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric
              label={hasBlockers ? "Top blocker" : "Next action"}
              value={hasBlockers ? snapshot.blockers[0] : snapshot.nextActions[0]}
              detail={hasBlockers ? "This must be cleared before raising the 300-client status." : "Run this before each operator review window."}
            />
            <Metric label="Queue lane cap" value={`heavy ${snapshot.queue.workerCaps.heavy}`} detail="Heavy provider jobs stay isolated from critical jobs by lane classification and cap policy." />
            <Metric label="Support state" value={snapshot.support.configured ? "Freshdesk ready" : "warning"} detail={snapshot.support.warning ?? snapshot.support.unresolvedTicketsSummary} />
          </div>
        </header>

        {snapshot.warnings.length > 0 ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" />
              Data warnings
            </div>
            <ul className="mt-2 list-inside list-disc">
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <OperatorDebtList jobs={operatorDebtJobs} />

        <section className="rounded-[26px] border border-white/10 bg-[#07111d] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/10 text-cyan-100">
                <Gauge className="size-5" />
              </div>
              <div>
                <h2 className="min-w-0 text-xl font-semibold tracking-[-0.04em] text-white">Autonomy queue</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Operator proof lane for pending, approved, executed, failed, rollback-needed, replay, idempotency, and kill-switch visibility. This section is read-only and does not mutate Meta.
                </p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(rollbackNeededCount > 0 ? "WATCH" : "GO")}`}>
              {rollbackNeededCount > 0 ? "review" : "clear"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {autonomyQueueRows.map((row) => (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" key={row.label}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{row.label}</p>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                    {row.status}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{row.count}</p>
                <p className="mt-2 text-sm leading-5 text-slate-400">{row.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Approval controls</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Approve", "Reject", "Monitor"].map((label) => (
                  <button
                    className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                    key={`autonomy-${label}`}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                UI affordances are present for operator review. They do not replay, approve, reject, or execute backend actions from this read-only control room.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Replay / idempotency</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["Replay jobs", snapshot.leadSms.leadCaptureRetryJobs, "Critical lane lead replay jobs."],
                  ["Launch locks", snapshot.meta.activeLaunchLocks, "Active locks prevent duplicate live launch objects."],
                  ["Retry pressure", snapshot.queue.retryPressure, `${snapshot.queue.jobsApproachingMaxAttempts} near max attempts.`],
                ].map(([label, value, detail]) => (
                  <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                    <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Metric label="Meta failures" value={metaFailureSignals} detail="Drift, destination, duplicate object, and tracking warnings." />
            <Metric label="No-data warnings" value={autonomyWarnings.length} detail={autonomyWarnings[0] ?? "No autonomy warnings from scale-readiness snapshot."} />
            <Metric label="Kill-switch visibility" value={snapshot.provider.killSwitches.filter((item) => item.enabled).length} detail={snapshot.provider.killSwitches.map((item) => `${item.envName}=${item.enabled ? "on" : "off"}`).join(", ")} />
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-[#07111d] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-300/10 text-emerald-100">
                <ShieldCheck className="size-5" />
              </div>
              <h2 className="min-w-0 text-xl font-semibold tracking-[-0.04em] text-white">WATCH classification</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase text-slate-200">
              evidence retained
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Meta snapshots", snapshot.issueClassification.summary.metaSnapshots],
              ["Lead notifications", snapshot.issueClassification.summary.leadNotifications],
              ["Dead letters", snapshot.issueClassification.summary.deadLetters],
            ].map(([label, value]) => (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                <p className="mt-2 break-words text-sm font-semibold leading-6 text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <ClassificationList title="Active blockers" entries={snapshot.issueClassification.activeBlockers} />
            <ClassificationList title="Current watch" entries={snapshot.issueClassification.currentWatch} />
            <ClassificationList title="Historical reviewed" entries={snapshot.issueClassification.historicalReviewed} />
            <ClassificationList title="Cleared" entries={snapshot.issueClassification.cleared} />
          </div>
        </section>

        <Section title="Queue / job health" status={snapshot.queue.status} icon={Workflow}>
          <Metric label="Critical lane" value={`${snapshot.queue.byLane.critical.queued} queued`} detail={`${snapshot.queue.byLane.critical.failed} failed, ${snapshot.queue.byLane.critical.deadLetter} dead-letter`} />
          <Metric label="Heavy lane" value={`${snapshot.queue.byLane.heavy.queued} queued`} detail={`${snapshot.queue.byLane.heavy.processing} processing, ${snapshot.queue.byLane.heavy.deadLetter} dead-letter`} />
          <Metric label="Oldest queued" value={`${number(snapshot.queue.oldestQueuedAgeMinutes)} min`} detail="Null means no queued backlog in the read window." />
          <Metric label="Oldest processing" value={`${number(snapshot.queue.oldestProcessingAgeMinutes)} min`} detail={`${snapshot.queue.staleProcessingJobs} stale or expired processing leases.`} />
          <Metric label="Deferred creative renders" value={snapshot.queue.deferredCreativeJobs} detail={`${snapshot.queue.staleDeferredCreativeJobs} stale worker-required creative job(s).`} />
          <Metric label="Retry pressure" value={snapshot.queue.retryPressure} detail={`${snapshot.queue.jobsApproachingMaxAttempts} jobs are approaching max attempts.`} />
          <Metric label="Kinds watched" value={Object.keys(snapshot.queue.byKind).length} detail="Grouped by critical, normal, and heavy lanes." />
        </Section>

        <Section title="Provider / creative generation" status={snapshot.provider.status} icon={ServerCog}>
          <Metric label="Static jobs" value={`${snapshot.provider.staticToday} today`} detail={`${snapshot.provider.static7d} over 7 days.`} />
          <Metric label="AI UGC/video jobs" value={`${snapshot.provider.videoToday} today`} detail={`${snapshot.provider.video7d} over 7 days.`} />
          <Metric label="Success rate" value={snapshot.provider.successRate7d === null ? "n/a" : `${snapshot.provider.successRate7d}%`} detail={`${snapshot.provider.failed7d} failed provider events over 7 days.`} />
          <Metric label="Reservations" value={`${snapshot.provider.consumed7d} consumed`} detail={`${snapshot.provider.released7d} released, ${snapshot.provider.reservedStale} stale reserved.`} />
          <Metric label="Cost today" value={currency(snapshot.provider.estimatedCostTodayCents)} detail="Based on existing provider usage event cost fields." />
          <Metric label="Kill switches" value={snapshot.provider.killSwitches.filter((item) => item.enabled).length} detail={snapshot.provider.killSwitches.map((item) => `${item.envName}=${item.enabled ? "on" : "off"}`).join(", ")} />
          <CapPressureList caps={snapshot.provider.capPressure} />
        </Section>

        <Section title="Billing / Stripe lifecycle" status={snapshot.billing.status} icon={CircleDollarSign}>
          <Metric label="Trialing" value={snapshot.billing.trialing} detail={`${snapshot.billing.trialEndingSoon} trials end within 3 days.`} />
          <Metric label="Active" value={snapshot.billing.active} detail={`${snapshot.billing.cancelAtPeriodEnd} cancel-at-period-end accounts.`} />
          <Metric label="Past due" value={snapshot.billing.pastDue} detail="Includes past_due, incomplete, and unpaid states." />
          <Metric label="Canceled/inactive" value={snapshot.billing.canceled} />
          <Metric label="Checkout funnel" value={`${snapshot.billing.checkoutStarted} started`} detail={`${snapshot.billing.checkoutAbandoned} abandoned events inferred from Stripe webhooks.`} />
          <Metric label="Webhook issues" value={snapshot.billing.stripeWebhookFailures7d} detail={`${snapshot.billing.webhookLagWarnings} stale processing, ${snapshot.billing.unknownPriceWarnings} price warnings.`} />
        </Section>

        <Section title="Lead / SMS reliability" status={snapshot.leadSms.status} icon={Bell}>
          <Metric label="Leads" value={`${snapshot.leadSms.leadsToday} today`} detail={`${snapshot.leadSms.leads7d} over 7 days.`} />
          <Metric label="Retry jobs" value={snapshot.leadSms.leadCaptureRetryJobs} detail="Critical lane lead capture replay jobs." />
          <Metric label="SMS success" value={snapshot.leadSms.smsSentOrDelivered} detail={`${snapshot.leadSms.smsFailed} failed or undelivered notifications.`} />
          <Metric label="Saved lead, failed notice" value={snapshot.leadSms.savedLeadNotificationFailures} />
          <Metric label="Internal alerts" value={snapshot.leadSms.policy.internalLeadNotificationsEnabled ? "enabled" : "blocked"} detail={`Twilio env present: ${snapshot.leadSms.policy.hasTwilioConfig ? "yes" : "no"}.`} />
          <Metric label="Outbound lead SMS" value={snapshot.leadSms.policy.outboundLeadSmsEnabled ? "enabled" : "blocked"} detail="Lead save continues even when outbound SMS remains disabled." />
        </Section>

        <Section title="Meta / launch drift" status={snapshot.meta.status} icon={RadioTower}>
          <Metric label="Active tracked" value={snapshot.meta.activeCampaignsTracked} />
          <Metric label="Drift warnings" value={snapshot.meta.driftWarnings} detail={`${snapshot.meta.staleSyncSnapshots} stale snapshots.`} />
          <Metric label="Launch locks" value={snapshot.meta.activeLaunchLocks} detail="Active locks prevent duplicate live launch object creation." />
          <Metric label="Budget cap" value={currency(snapshot.meta.expectedBudgetCapCents)} detail={`Spend today: ${currency(snapshot.meta.spendTodayCents)}.`} />
          <Metric label="Destination/domain" value={snapshot.meta.destinationWarnings + snapshot.meta.trackingDomainWarnings} detail="Warnings are read from app-owned sync snapshots." />
          <Metric label="Duplicate objects" value={snapshot.meta.duplicateObjectWarnings} detail={snapshot.meta.spendAnomalyNote ?? "Spend/drift data available from snapshots."} />
        </Section>

        <Section title="Client error visibility" status={snapshot.clientErrors.status} icon={Bug}>
          <Metric label="Today" value={snapshot.clientErrors.today} />
          <Metric label="7 days" value={snapshot.clientErrors.sevenDays} detail={`${snapshot.clientErrors.recentUnresolved} unresolved grouped errors.`} />
          <Metric label="Top route" value={snapshot.clientErrors.topRoutes[0]?.route ?? "none"} detail={`${snapshot.clientErrors.topRoutes[0]?.count ?? 0} occurrences in the read window.`} />
          <Metric label="Top class" value={snapshot.clientErrors.topClasses[0]?.errorClass ?? "none"} detail={`${snapshot.clientErrors.topClasses[0]?.count ?? 0} grouped events.`} />
          <Metric label="Top browser" value={snapshot.clientErrors.browsers[0]?.label ?? "none"} />
          <Metric label="Sanitization" value="server-scrubbed" detail="Telemetry service redacts secrets, emails, phone-like strings, and risky metadata keys." />
        </Section>

        <Section title="Support / runbook state" status={snapshot.support.status} icon={LifeBuoy}>
          <Metric label="Freshdesk" value={snapshot.support.configured ? "configured" : "missing env"} detail={snapshot.support.warning ?? "Freshdesk ticket creation is available server-side."} />
          <Metric label="Categories" value={snapshot.support.categories} detail={snapshot.support.priorityMapReady ? "Priority map complete." : "Priority map incomplete."} />
          <Metric label="Unresolved tickets" value="provider-side" detail={snapshot.support.unresolvedTicketsSummary} />
          <Metric label="Safe fallback" value="enabled" detail="Missing Freshdesk env returns customer-safe unavailable copy." />
          <Metric label="No side effects" value="true" detail="This page never creates tickets or calls Freshdesk APIs." />
          <Metric label="Runbook" value="300-client SOP" detail="See docs/production-300-client-runbook.md." />
        </Section>

        <section className="grid gap-3 rounded-[26px] border border-white/10 bg-[#07111d] p-4 md:grid-cols-3">
          <Link className="rounded-2xl border border-cyan-300/18 bg-cyan-300/10 p-4 text-cyan-100 transition hover:bg-cyan-300/15" href="/admin/command-center">
            <Activity className="size-5" />
            <p className="mt-3 font-semibold">Command center</p>
            <p className="mt-1 text-sm text-cyan-100/70">Launch evidence and operator issue radar.</p>
          </Link>
          <Link className="rounded-2xl border border-emerald-300/18 bg-emerald-300/10 p-4 text-emerald-100 transition hover:bg-emerald-300/15" href="/admin/issues">
            <TimerReset className="size-5" />
            <p className="mt-3 font-semibold">Issue logs</p>
            <p className="mt-1 text-sm text-emerald-100/70">Exportable fix intake for unresolved operator issues.</p>
          </Link>
          <Link className="rounded-2xl border border-amber-300/18 bg-amber-300/10 p-4 text-amber-100 transition hover:bg-amber-300/15" href="/admin/launch-monitor">
            {snapshot.status === "DEGRADED" ? <XCircle className="size-5" /> : <CheckCircle2 className="size-5" />}
            <p className="mt-3 font-semibold">Launch monitor</p>
            <p className="mt-1 text-sm text-amber-100/70">Campaign-specific launch and lead-loop state.</p>
          </Link>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-[#07111d] p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-300/10 text-emerald-100">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Incident switches</h2>
              <p className="text-sm text-slate-400">Env names only; no values are shown.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Provider generation" value="ALLOW_HIGGSFIELD_*" detail="Disable image/video generation while queue and customer copy remain safe." />
            <Metric label="Meta live launch" value="ALLOW_META_LIVE_LAUNCH" detail={`Leave false unless owner approves live Meta launch work. ${META_OPERATOR_ASSISTED_ADMIN_CHECKLIST}`} />
            <Metric label="Internal SMS" value="INTERNAL_LEAD_SMS_ENABLED" detail="Lead saves continue when internal alerts are blocked." />
            <Metric label="Support degrade" value="FRESHDESK_*" detail="Missing env triggers safe support fallback." />
          </div>
        </section>
      </div>
    </div>
  );
}
