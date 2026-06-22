import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import {
  loadFulfillmentMonitorData,
  type FulfillmentMonitorLeadRow,
} from "@/lib/services/fulfillment-monitor-service";
import { loadGhlProvisioningOverview } from "@/lib/services/ghl-provisioning-service";
import { loadOperatorPageSection } from "@/lib/services/internal-operator-page-timeout";
import { CrmRetryButton } from "@/app/(app)/admin/fulfillment-monitor/fulfillment-monitor-actions";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function statusTone(value: string | null | undefined) {
  if (value === "synced" || value === "completed" || value === "charged") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }
  if (value === "failed" || value === "dead_letter") {
    return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  }
  if (value === "skipped" || value === "pending" || value === "processing") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }
  return "border-white/10 bg-white/[0.04] text-cyan-50";
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(value)}`}>
      {value ?? "not recorded"}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "cyan",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  tone?: "cyan" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-300/18 bg-emerald-300/8"
      : tone === "amber"
        ? "border-amber-300/18 bg-amber-300/8"
        : tone === "red"
          ? "border-rose-300/18 bg-rose-300/8"
          : "border-cyan-300/18 bg-cyan-300/8";

  return (
    <div className={`rounded-2xl border ${toneClass} p-4`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-cyan-200" />
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/50">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-cyan-100/58">{detail}</p>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">{label}</p>
      <p className="mt-1 break-all text-xs text-cyan-50">{value === null || value === undefined || value === "" ? "Not set" : String(value)}</p>
    </div>
  );
}

function FulfillmentRow({ row }: { row: FulfillmentMonitorLeadRow }) {
  return (
    <tr className="border-b border-white/8 align-top">
      <td className="px-3 py-4">
        <div className="space-y-1">
          <p className="font-semibold text-white">{row.leadLabel}</p>
          <p className="text-xs text-cyan-100/55">{row.emailMasked}</p>
          <p className="font-mono text-[11px] text-cyan-100/45">{row.leadId}</p>
          <p className="text-xs text-cyan-100/45">{formatDateTime(row.createdAt)}</p>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="space-y-1">
          <p className="text-sm text-cyan-50">{row.workspaceLabel}</p>
          <p className="font-mono text-[11px] text-cyan-100/45">{row.workspaceId ?? "no workspace"}</p>
          <p className="text-xs text-cyan-100/55">{row.campaignLabel}</p>
          <p className="font-mono text-[11px] text-cyan-100/45">{row.campaignId ?? "no campaign"}</p>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="space-y-2">
          <StatusBadge value={row.leadSideEffectsJob?.status} />
          <p className="text-xs text-cyan-100/50">Lead job: {row.leadSideEffectsJob?.id ?? "not found"}</p>
          <p className="max-w-[260px] text-xs text-cyan-100/58">{row.leadSideEffectsJob?.resultSummary ?? "No side-effect result recorded"}</p>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="space-y-2">
          <StatusBadge value={row.performanceBillingJob?.status ?? row.billingEvent?.status} />
          <p className="text-xs text-cyan-100/50">Job: {row.performanceBillingJob?.id ?? "not found"}</p>
          <p className="text-xs text-cyan-100/50">Ledger: {row.billingEvent?.id ?? "not found"}</p>
          <p className="text-xs text-cyan-100/58">{row.billingEvent?.reason ?? row.performanceBillingJob?.resultSummary ?? "No billing issue recorded"}</p>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="space-y-2">
          <StatusBadge value={row.crmEvent?.status} />
          <p className="text-xs text-cyan-100/50">Event: {row.crmEvent?.id ?? "not found"}</p>
          <p className="text-xs text-cyan-100/50">Contact: {row.crmEvent?.contactIdMasked ?? "not set"}</p>
          <p className="text-xs text-cyan-100/50">Opportunity: {row.crmEvent?.opportunityIdMasked ?? "not set"}</p>
          <p className="max-w-[260px] text-xs text-cyan-100/58">{row.crmEvent?.metadataSummary ?? "No CRM metadata"}</p>
          {row.crmEvent?.lastErrorCode ? (
            <p className="max-w-[260px] text-xs text-rose-100">{row.crmEvent.lastErrorCode}: {row.crmEvent.lastErrorMessage ?? "No message"}</p>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="space-y-2">
          <p className="text-xs text-cyan-100/58">{row.retryEligibility.reason}</p>
          <p className="text-xs text-cyan-100/45">Marker: {row.proofMarker}</p>
          {row.retryEligibility.eligible ? (
            <CrmRetryButton
              leadId={row.leadId}
              requiresDeadLetterConfirmation={row.retryEligibility.requiresDeadLetterConfirmation}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export default async function FulfillmentMonitorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await assertInternalOperatorAccess();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    throw error;
  }

  const params = searchParams ? await searchParams : {};
  const filters = {
    workspaceId: typeof params.workspaceId === "string" ? params.workspaceId : null,
    campaignId: typeof params.campaignId === "string" ? params.campaignId : null,
    status: typeof params.status === "string" ? params.status : null,
    search: typeof params.search === "string" ? params.search : null,
    from: typeof params.from === "string" ? params.from : null,
    to: typeof params.to === "string" ? params.to : null,
    failedOnly: params.failedOnly === "true",
  };

  const dataSection = await loadOperatorPageSection(
    "Fulfillment monitor",
    () => loadFulfillmentMonitorData(filters),
    {
      filters,
      rows: [],
      health: {
        checkedAt: new Date().toISOString(),
        writeGates: {
          contactWritesEnabled: false,
          opportunityWritesEnabled: false,
          autoProvisioningEnabled: false,
          provisioningWritesEnabled: false,
          workflowEnrollmentEnabled: false,
        },
        recentCrmFailures: 0,
        recentDeadLetters: 0,
        pendingLeadSideEffectJobs: 0,
        failedLeadSideEffectJobs: 0,
        mappings: [],
      },
    },
  );
  const provisioningSection = await loadOperatorPageSection(
    "GHL provisioning",
    () => loadGhlProvisioningOverview(),
    {
      checkedAt: new Date().toISOString(),
      gates: {
        contactWritesEnabled: false,
        opportunityWritesEnabled: false,
        autoProvisioningEnabled: false,
        provisioningWritesEnabled: false,
        workflowEnrollmentEnabled: false,
      },
      rows: [],
      safety: {
        dbMutation: false,
        ghlLocationWrite: false,
        ghlUserWrite: false,
        ghlPipelineWrite: false,
        ghlWorkflowWrite: false,
        contactWrite: false,
        opportunityWrite: false,
        workflowEnrollment: false,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        providerGeneration: false,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
    },
  );
  const data = dataSection.data;
  const provisioning = provisioningSection.data;
  const failedRows = data.rows.filter((row) => row.crmEvent?.status === "failed" || row.crmEvent?.status === "dead_letter" || row.leadSideEffectsJob?.status === "failed");
  const syncedRows = data.rows.filter((row) => row.crmEvent?.status === "synced");
  const readyProvisioningRows = provisioning.rows.filter((row) => row.ready);

  return (
    <div className="relative min-h-full overflow-hidden rounded-[32px] border border-cyan-300/16 bg-[#030811] p-5 text-cyan-50 shadow-[0_0_130px_-58px_rgba(34,211,238,0.55)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.05)_1px,transparent_1px)] bg-[size:38px_38px] opacity-35" />

      <div className="relative z-10 space-y-6">
        <header className="grid gap-4 xl:grid-cols-[1fr_0.72fr]">
          <div className="rounded-[28px] border border-cyan-300/18 bg-black/42 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                fulfillment v1
              </span>
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-amber-100">
                admin only
              </span>
            </div>
            <h1 className="mt-5 text-4xl font-black uppercase tracking-[-0.08em] text-white sm:text-5xl">
              Fulfillment monitor
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-cyan-100/68">
              Operator visibility for public leads, lead-side-effect jobs, performance billing, CRM sync events, and GHL contact/opportunity delivery. Recovery actions only retry CRM sync and do not trigger SMS, Meta, Stripe, providers, provisioning, or workflow enrollment.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/24 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50"
                href="/admin/command-center"
              >
                <Activity className="size-4" />
                Command center
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/80"
                href="/admin/issues"
              >
                <AlertTriangle className="size-4" />
                Issue logs
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={Activity} label="Recent leads" value={data.rows.length} detail="Rows loaded for current filters." />
            <MetricCard icon={CheckCircle2} label="CRM synced" value={syncedRows.length} detail="Latest CRM event is synced." tone="green" />
            <MetricCard icon={AlertTriangle} label="Needs review" value={failedRows.length} detail="Failed/dead-letter job or CRM event." tone={failedRows.length > 0 ? "red" : "green"} />
            <MetricCard icon={ShieldCheck} label="Write gates" value={data.health.writeGates.contactWritesEnabled ? "on" : "off"} detail="Contact write gate state." tone={data.health.writeGates.contactWritesEnabled ? "amber" : "green"} />
          </div>
        </header>

        {dataSection.degraded ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            {dataSection.reason}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
          <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="space-y-1 text-xs text-cyan-100/60">
              Workspace
              <input className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-cyan-50" name="workspaceId" defaultValue={filters.workspaceId ?? ""} />
            </label>
            <label className="space-y-1 text-xs text-cyan-100/60">
              Campaign
              <input className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-cyan-50" name="campaignId" defaultValue={filters.campaignId ?? ""} />
            </label>
            <label className="space-y-1 text-xs text-cyan-100/60">
              Status
              <select className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-cyan-50" name="status" defaultValue={filters.status ?? ""}>
                <option value="">Any</option>
                <option value="synced">synced</option>
                <option value="failed">failed</option>
                <option value="dead_letter">dead_letter</option>
                <option value="skipped">skipped</option>
                <option value="pending">pending</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-cyan-100/60">
              Search
              <input className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-cyan-50" name="search" defaultValue={filters.search ?? ""} />
            </label>
            <label className="flex items-end gap-2 text-xs text-cyan-100/70">
              <input className="mb-3" name="failedOnly" type="checkbox" value="true" defaultChecked={filters.failedOnly} />
              <span className="pb-2">Failed/dead-letter only</span>
            </label>
            <button className="self-end rounded-md border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50" type="submit">
              Filter
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Database className="size-4 text-cyan-200" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Health checks</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ReadonlyField label="Checked at" value={formatDateTime(data.health.checkedAt)} />
              <ReadonlyField label="Recent CRM failures" value={data.health.recentCrmFailures} />
              <ReadonlyField label="Recent dead letters" value={data.health.recentDeadLetters} />
              <ReadonlyField label="Pending lead jobs" value={data.health.pendingLeadSideEffectJobs} />
              <ReadonlyField label="Failed lead jobs" value={data.health.failedLeadSideEffectJobs} />
              <ReadonlyField label="Opportunity writes" value={data.health.writeGates.opportunityWritesEnabled} />
              <ReadonlyField label="Provisioning writes" value={data.health.writeGates.provisioningWritesEnabled} />
              <ReadonlyField label="Workflow enrollment" value={data.health.writeGates.workflowEnrollmentEnabled} />
            </div>
          </div>

          <div className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">GHL mappings</h2>
            <div className="mt-4 max-h-[280px] space-y-3 overflow-auto">
              {data.health.mappings.length === 0 ? (
                <p className="text-sm text-cyan-100/55">No workspace GHL mappings found.</p>
              ) : data.health.mappings.map((mapping) => (
                <div key={`${mapping.workspaceId}-${mapping.partnerId}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="font-mono text-[11px] text-cyan-100/60">{mapping.workspaceId}</p>
                  <p className="font-mono text-[11px] text-cyan-100/45">{mapping.partnerId}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge value={mapping.syncEnabled ? "sync_enabled" : "sync_disabled"} />
                    <StatusBadge value={mapping.credentialConfigured ? "credential_configured" : "credential_missing"} />
                    <StatusBadge value={mapping.pipelineConfigured && mapping.stageConfigured ? "opportunity_configured" : "opportunity_deferred"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">GHL provisioning readiness</h2>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-cyan-100/58">
                Operator-assisted setup status for GHL location, pipeline, stage, workflow, and workspace mapping. This panel is read-only and does not create GHL locations, users, pipelines, workflows, contacts, opportunities, SMS, Meta, Stripe, or provider work.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusBadge value={provisioning.gates.provisioningWritesEnabled ? "provisioning_writes_on" : "provisioning_writes_off"} />
              <StatusBadge value={provisioning.gates.autoProvisioningEnabled ? "auto_provisioning_on" : "auto_provisioning_off"} />
              <StatusBadge value={`${readyProvisioningRows.length}/${provisioning.rows.length} ready`} />
            </div>
          </div>
          {provisioningSection.degraded ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
              {provisioningSection.reason}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {provisioning.rows.length === 0 ? (
              <p className="text-sm text-cyan-100/55">No GHL provisioning mappings found.</p>
            ) : provisioning.rows.map((row) => (
              <div key={`${row.workspaceId}-${row.partnerId}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge value={row.status} />
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100/55">
                    {row.mode}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <ReadonlyField label="Workspace" value={row.workspaceId} />
                  <ReadonlyField label="Partner" value={row.partnerId} />
                  <ReadonlyField label="Location" value={row.locationIdMasked} />
                  <ReadonlyField label="Pipeline" value={row.pipelineIdMasked} />
                  <ReadonlyField label="Stage" value={row.stageIdMasked} />
                  <ReadonlyField label="Workflow" value={row.workflowIdMasked} />
                  <ReadonlyField label="Latest job" value={row.latestJobStatus} />
                  <ReadonlyField label="Operator action" value={row.operatorActionNeeded} />
                </div>
                {row.missing.length > 0 || row.failures.length > 0 ? (
                  <p className="mt-3 text-xs leading-6 text-amber-100">
                    {[...row.missing, ...row.failures].join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-cyan-300/16 bg-black/42 p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-cyan-100/45">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-3 font-medium">Lead</th>
                  <th className="px-3 py-3 font-medium">Workspace / campaign</th>
                  <th className="px-3 py-3 font-medium">Lead side effects</th>
                  <th className="px-3 py-3 font-medium">Performance billing</th>
                  <th className="px-3 py-3 font-medium">CRM / GHL</th>
                  <th className="px-3 py-3 font-medium">Recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-cyan-100/60" colSpan={6}>
                      No fulfillment rows match the current filters.
                    </td>
                  </tr>
                ) : data.rows.map((row) => <FulfillmentRow key={row.leadId} row={row} />)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
