import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyFunnelUrlButton } from "@/components/internal/copy-funnel-url-button";
import {
  assertInternalOperatorAccess,
  loadLaunchMonitorRows,
} from "@/lib/services/internal-launch-monitor";
import { ApiError } from "@/lib/api/route";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const className =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : "border-white/10 bg-white/[0.04] text-foreground";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {value}
    </span>
  );
}

function renderConsistencyBadge(row: {
  consistencyMismatch: boolean;
  consistencyMismatchCount: number;
  consistencyMissingFields: string[];
}) {
  if (row.consistencyMismatch) {
    return (
      <StatusBadge
        value={`Consistency mismatch (${row.consistencyMismatchCount})`}
        tone="danger"
      />
    );
  }

  if (row.consistencyMissingFields.length > 0) {
    return (
      <StatusBadge
        value={`Critical fields missing (${row.consistencyMissingFields.length})`}
        tone="warning"
      />
    );
  }

  return <StatusBadge value="Consistency clean" tone="success" />;
}

export default async function LaunchMonitorPage({
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
  const selectedCampaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0 ? params.campaignId : null;
  const rows = await loadLaunchMonitorRows(50);
  const selectedRow = selectedCampaignId
    ? rows.find((row) => row.campaignId === selectedCampaignId) ?? null
    : rows[0] ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal"
        title="Launch monitor"
        description="Monitor recent campaign builds, Meta launch state, public funnel status, and recent leads across workspaces."
        guidance="This view is intentionally operational. Use it to spot broken launches fast and verify what happened before contacting a client."
      />

      <Card className="p-5 sm:p-7">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <tr className="border-b border-white/10">
                <th className="px-3 py-3 font-medium">Workspace / user</th>
                <th className="px-3 py-3 font-medium">Campaign</th>
                <th className="px-3 py-3 font-medium">Build</th>
                <th className="px-3 py-3 font-medium">Meta</th>
                <th className="px-3 py-3 font-medium">Launch</th>
                <th className="px-3 py-3 font-medium">Funnel / leads</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowSelected = row.campaignId === selectedRow?.campaignId;
                const launchTone =
                  row.launchStatus.includes("completed")
                    ? "success"
                    : row.launchStatus.includes("failed")
                      ? "danger"
                      : row.launchStatus.includes("progress")
                        ? "warning"
                        : "neutral";
                const metaTone =
                  row.metaConnectionStatus.includes("connected")
                    ? "success"
                    : row.preflightStatus.includes("failed") || row.preflightStatus.includes("incomplete")
                      ? "warning"
                      : "neutral";

                return (
                  <tr
                    key={row.campaignId}
                    className={`border-b border-white/6 align-top ${rowSelected ? "bg-white/[0.03]" : ""}`}
                  >
                    <td className="px-3 py-4">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{row.organizationLabel}</p>
                        <p className="text-xs text-muted-foreground">{row.userLabel}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-foreground">{row.campaignId}</p>
                        <p className="text-xs text-muted-foreground">Created {formatDateTime(row.createdAt)}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        <StatusBadge value={`Onboarding: ${row.onboardingStatus}`} />
                        <StatusBadge value={`Funnel: ${row.funnelStatus}`} />
                        <StatusBadge value={`Creative: ${row.creativeStatus}`} />
                        {renderConsistencyBadge(row)}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        <StatusBadge value={row.metaConnectionStatus} tone={metaTone} />
                        <p className="text-xs text-muted-foreground">Account: {row.selectedAdAccount}</p>
                        <p className="text-xs text-muted-foreground">Page: {row.selectedPage}</p>
                        <p className="text-xs text-muted-foreground">Pixel: {row.selectedPixel}</p>
                        <p className="text-xs text-muted-foreground">Preflight: {row.preflightStatus}</p>
                        <p className="text-xs text-muted-foreground">Last sync: {formatDateTime(row.lastSyncTime)}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        <StatusBadge value={row.launchStatus} tone={launchTone} />
                        <p className="text-xs text-muted-foreground">Step: {row.launchStep}</p>
                        <p className="max-w-[260px] text-xs text-muted-foreground">
                          Last error: {row.lastError}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Slug: {row.publicSlug || "Not published"}
                        </p>
                        <p className="text-xs text-muted-foreground">Leads: {row.leadCount}</p>
                        <StatusBadge
                          value={row.leadLoopVerified ? "Lead loop verified" : "Lead loop not verified"}
                          tone={row.leadLoopVerified ? "success" : "warning"}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-col gap-2">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/admin/launch-monitor?campaignId=${encodeURIComponent(row.campaignId)}`}>
                            View details
                          </Link>
                        </Button>
                        {row.funnelUrl ? <CopyFunnelUrlButton url={row.funnelUrl} /> : null}
                        <p className="text-[11px] text-muted-foreground">
                          Launch retry and cross-workspace Meta refresh stay manual in this first operator pass.
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedRow ? (
        <Card className="p-5 sm:p-7">
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Details</p>
              <h2 className="mt-2 text-xl font-semibold">{selectedRow.organizationLabel}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Campaign {selectedRow.campaignId} · Created {formatDateTime(selectedRow.createdAt)}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Launch state</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p>Launch status: {selectedRow.launchStatus}</p>
                  <p>Current step: {selectedRow.launchStep}</p>
                  <p>Preflight: {selectedRow.preflightStatus}</p>
                  <p>Last Meta sync: {formatDateTime(selectedRow.lastSyncTime)}</p>
                  <p>Last error: {selectedRow.lastError}</p>
                </div>
              </div>

              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Funnel and lead loop</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p>Public slug: {selectedRow.publicSlug || "Not published"}</p>
                  <p>Funnel URL: {selectedRow.funnelUrl || "Unavailable"}</p>
                  <p>Lead count: {selectedRow.leadCount}</p>
                  <p>Lead loop: {selectedRow.leadLoopVerified ? "verified" : "not yet verified"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Consistency</p>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  Status:{" "}
                  {selectedRow.consistencyMismatch
                    ? `mismatch detected (${selectedRow.consistencyMismatchCount})`
                    : selectedRow.consistencyMissingFields.length > 0
                      ? `critical fields missing (${selectedRow.consistencyMissingFields.length})`
                      : "clean"}
                </p>
                <p>
                  Missing critical fields:{" "}
                  {selectedRow.consistencyMissingFields.length > 0
                    ? selectedRow.consistencyMissingFields.join(", ")
                    : "None"}
                </p>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Recent lead submissions</p>
              {selectedRow.recentLeads.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <tr className="border-b border-white/10">
                        <th className="px-3 py-2 font-medium">Lead</th>
                        <th className="px-3 py-2 font-medium">Contact</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRow.recentLeads.map((lead) => (
                        <tr key={lead.id} className="border-b border-white/6">
                          <td className="px-3 py-3">{lead.name}</td>
                          <td className="px-3 py-3 text-muted-foreground">{lead.contact}</td>
                          <td className="px-3 py-3 text-muted-foreground">{lead.status}</td>
                          <td className="px-3 py-3 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No leads saved for this campaign yet.</p>
              )}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
