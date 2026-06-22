import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import {
  getSafeDegradationStatus,
  loadScaleMonitorIncidents,
  type ScaleMonitorIncident,
  type ScaleMonitorIncidentStatus,
  type ScaleMonitorSeverity,
} from "@/lib/services/scale-monitor-service";

const STATUS_FILTERS = ["all", "open", "acknowledged", "resolved"] as const;
const SEVERITY_FILTERS = ["all", "p0", "p1", "p2", "p3"] as const;
const SUBSYSTEM_FILTERS = [
  "all",
  "billing",
  "queue",
  "provider",
  "meta",
  "lead_sms",
  "client_errors",
  "support",
  "operator_debt",
  "production_smoke",
  "alias_deploy",
] as const;

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: string | undefined) {
  return STATUS_FILTERS.includes(value as (typeof STATUS_FILTERS)[number]) ? (value as string) : "open";
}

function normalizeSeverity(value: string | undefined) {
  return SEVERITY_FILTERS.includes(value as (typeof SEVERITY_FILTERS)[number]) ? (value as string) : "all";
}

function normalizeSubsystem(value: string | undefined) {
  return SUBSYSTEM_FILTERS.includes(value as (typeof SUBSYSTEM_FILTERS)[number]) ? (value as string) : "all";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "None";
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

function severityClass(severity: ScaleMonitorSeverity) {
  if (severity === "p0" || severity === "p1") {
    return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  }
  if (severity === "p2") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function statusClass(status: ScaleMonitorIncidentStatus) {
  if (status === "resolved") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }
  if (status === "acknowledged") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function buildFilterHref(params: {
  status: string;
  severity: string;
  subsystem: string;
}) {
  const search = new URLSearchParams();
  if (params.status !== "open") {
    search.set("status", params.status);
  }
  if (params.severity !== "all") {
    search.set("severity", params.severity);
  }
  if (params.subsystem !== "all") {
    search.set("subsystem", params.subsystem);
  }
  const suffix = search.toString();
  return `/admin/incidents${suffix ? `?${suffix}` : ""}`;
}

function FilterPill({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-cyan-300/40 bg-cyan-300/14 text-cyan-50"
          : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-slate-100"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function safeJsonPreview(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 1800);
  } catch {
    return "{}";
  }
}

function IncidentCard({ incident }: { incident: ScaleMonitorIncident }) {
  const channels = Array.isArray(incident.alert_channels)
    ? incident.alert_channels.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${severityClass(incident.severity)}`}>
              {incident.severity}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(incident.status)}`}>
              {incident.status}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase text-slate-400">
              {incident.subsystem}
            </span>
            {incident.synthetic ? (
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] uppercase text-cyan-100">
                synthetic
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">{incident.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{incident.recommended_action}</p>
        </div>
        <div className="grid min-w-[190px] gap-1 rounded-xl border border-white/8 bg-black/20 p-3 text-xs text-slate-400">
          <span>first seen: {formatDateTime(incident.first_seen_at)}</span>
          <span>last seen: {formatDateTime(incident.last_seen_at)}</span>
          <span>resolved: {formatDateTime(incident.resolved_at)}</span>
          <span>recurrence: {incident.recurrence_count}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.55fr]">
        <pre className="max-h-72 overflow-auto rounded-xl border border-white/8 bg-black/28 p-3 text-xs leading-5 text-slate-300">
          {safeJsonPreview(incident.evidence)}
        </pre>
        <div className="grid gap-3">
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Alert path</p>
            <p className="mt-2 text-sm text-slate-200">{channels.length > 0 ? channels.join(", ") : "admin_incident_inbox"}</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Safe affected refs</p>
            <p className="mt-2 text-sm text-slate-200">
              org {incident.affected_organization_id ? "redacted" : "none"} / campaign {incident.affected_campaign_id ? "redacted" : "none"}
            </p>
          </div>
          {incident.status !== "resolved" ? (
            <form action={`/api/admin/incidents/${incident.id}`} className="grid gap-2" method="post">
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                maxLength={500}
                name="note"
                placeholder="Resolution note"
              />
              <div className="flex flex-wrap gap-2">
                {incident.status === "open" ? (
                  <button
                    className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100"
                    name="action"
                    type="submit"
                    value="acknowledge"
                  >
                    Acknowledge
                  </button>
                ) : null}
                <button
                  className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100"
                  name="action"
                  type="submit"
                  value="resolve"
                >
                  Resolve
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <Icon className="size-5" />
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-[-0.06em] text-white">{value}</p>
    </div>
  );
}

export default async function IncidentsPage({
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
  const status = normalizeStatus(readSingleParam(params.status));
  const severity = normalizeSeverity(readSingleParam(params.severity));
  const subsystem = normalizeSubsystem(readSingleParam(params.subsystem));
  const [incidents, safeDegradation] = await Promise.all([
    loadScaleMonitorIncidents({ status, severity, subsystem }),
    Promise.resolve(getSafeDegradationStatus()),
  ]);
  const openCount = incidents.filter((incident) => incident.status === "open").length;
  const acknowledgedCount = incidents.filter((incident) => incident.status === "acknowledged").length;
  const resolvedCount = incidents.filter((incident) => incident.status === "resolved").length;
  const p0p1Count = incidents.filter((incident) => incident.severity === "p0" || incident.severity === "p1").length;

  return (
    <div className="min-h-full rounded-[30px] border border-cyan-300/16 bg-[#030711] p-4 text-slate-100 shadow-[0_0_140px_-70px_rgba(34,211,238,0.65)] sm:p-6">
      <div className="grid gap-5">
        <header className="rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,20,34,0.96),rgba(3,7,17,0.98))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-cyan-100">
                  automated monitoring
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-slate-300">
                  admin only
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-black uppercase tracking-[-0.07em] text-white sm:text-5xl">
                Incident inbox
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                Scheduled scale monitor incidents, smoke failures, operator debt, and safe degradation signals land here first.
                External alert env can be absent; the admin inbox remains the fail-closed alert path.
              </p>
            </div>
            <Link
              className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50"
              href="/admin/control-room"
            >
              Control room
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric icon={ShieldAlert} label="P0/P1" value={p0p1Count} tone="border-rose-300/18 bg-rose-300/8 text-rose-100" />
            <Metric icon={AlertTriangle} label="Open" value={openCount} tone="border-amber-300/18 bg-amber-300/8 text-amber-100" />
            <Metric icon={Clock3} label="Acknowledged" value={acknowledgedCount} tone="border-cyan-300/18 bg-cyan-300/8 text-cyan-100" />
            <Metric icon={CheckCircle2} label="Resolved" value={resolvedCount} tone="border-emerald-300/18 bg-emerald-300/8 text-emerald-100" />
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="grid gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STATUS_FILTERS.map((item) => (
                  <FilterPill
                    active={status === item}
                    href={buildFilterHref({ status: item, severity, subsystem })}
                    key={item}
                    label={item}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Severity</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SEVERITY_FILTERS.map((item) => (
                  <FilterPill
                    active={severity === item}
                    href={buildFilterHref({ status, severity: item, subsystem })}
                    key={item}
                    label={item}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Subsystem</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUBSYSTEM_FILTERS.map((item) => (
                  <FilterPill
                    active={subsystem === item}
                    href={buildFilterHref({ status, severity, subsystem: item })}
                    key={item}
                    label={item.replace(/_/g, " ")}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-5">
          {Object.entries(safeDegradation).map(([key, value]) => (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" key={key}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{key}</p>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
                {safeJsonPreview(value)}
              </pre>
            </div>
          ))}
        </section>

        <section className="grid gap-3">
          {incidents.length > 0 ? (
            incidents.map((incident) => <IncidentCard incident={incident} key={incident.id} />)
          ) : (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm text-emerald-100">
              No incidents match the selected filters.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
