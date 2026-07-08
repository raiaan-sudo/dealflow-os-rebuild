import {
  listAccessKeyEventsForAdmin,
  listAccessKeysForAdmin,
} from "@/lib/services/access-key-service";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const STATUS_OPTIONS = ["", "pending_payment", "active", "preclaimed", "claimed", "revoked", "expired"];

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function AdminAccessKeysPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const search = getParam(params, "q");
  const status = getParam(params, "status");
  const rows = await listAccessKeysForAdmin({ limit: 100, search, status });
  const eventsByKey = await listAccessKeyEventsForAdmin(rows.map((row) => row.id));

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6">
      <div>
        <p className="df-eyebrow">Operator controls</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Access keys</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          Paid pre-account checkout keys, claim status, and Stripe linkage. Raw keys are not exposed here.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-df-panel border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_220px_auto]" action="/admin/access-keys">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Search</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Prefix, Stripe id, user, workspace, partner"
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-cyan-200/40"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "all"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-df-control bg-df-primary px-4 py-3 text-sm font-semibold text-slate-950 shadow-df-button"
        >
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-df-panel border border-white/10">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-white/50">
            <tr>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Stripe session</th>
              <th className="px-4 py-3">Claimed workspace</th>
              <th className="px-4 py-3">Recent events</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.id} className="bg-white/[0.018] text-white/75">
                <td className="px-4 py-3 font-mono text-xs text-cyan-100">{row.key_prefix}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.plan_tier}</td>
                <td className="px-4 py-3">{row.partner_slug ?? "native"}</td>
                <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs">{row.stripe_checkout_session_id ?? "n/a"}</td>
                <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs">{row.claimed_organization_id ?? "unclaimed"}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {(eventsByKey.get(row.id) ?? []).slice(0, 3).map((event) => (
                      <div key={event.id} className="text-xs text-white/55">
                        <span className="font-semibold text-white/70">{event.event_type}</span>
                        <span> · {formatDate(event.created_at)}</span>
                      </div>
                    ))}
                    {(eventsByKey.get(row.id) ?? []).length === 0 ? (
                      <span className="text-xs text-white/35">none</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3">
                  {["created", "pending_payment", "active", "preclaimed"].includes(row.status) ? (
                    <form action={`/api/admin/access-keys/${row.id}/revoke`} method="post" className="space-y-2">
                      <input
                        name="reason"
                        placeholder="Reason"
                        className="h-9 w-36 rounded-df-control border border-white/10 bg-black/20 px-2 text-xs text-white outline-none placeholder:text-white/35"
                      />
                      <button
                        type="submit"
                        className="rounded-df-control border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/40"
                      >
                        Revoke
                      </button>
                    </form>
                  ) : (
                    <span className="text-white/35">Locked</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-white/55" colSpan={9}>
                  No access keys found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
