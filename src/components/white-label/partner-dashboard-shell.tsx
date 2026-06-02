import Link from "next/link";
import { getPartnerDashboardSummary } from "@/lib/white-label/queries";
import { requirePartnerMembership } from "@/lib/white-label/permissions";

const partnerNav = [
  ["/partner", "Overview"],
  ["/partner/customers", "Customers"],
  ["/partner/trials", "Trials"],
  ["/partner/revenue", "Revenue"],
  ["/partner/commissions", "Commissions"],
  ["/partner/invite-links", "Invite Links"],
  ["/partner/settings", "Settings"],
] as const;

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function PartnerDashboardShell({ section = "Overview" }: { section?: string }) {
  const scoped = await requirePartnerMembership().catch(() => null);

  if (!scoped?.membership?.partner_id) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center">
        <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-6">
          <p className="df-eyebrow">Partner Portal</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">No partner access</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This area is for partner agency users. Customer workspaces can continue from the main dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex h-11 items-center rounded-full border border-primary/20 bg-primary/10 px-5 text-sm font-semibold text-primary"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const summary = await getPartnerDashboardSummary(scoped.membership.partner_id).catch(() => ({
    signups: 0,
    activeTrials: 0,
    paidCustomers: 0,
    attributedMrrCents: 0,
    churnedCustomers: 0,
    commissionPendingCents: 0,
    commissionApprovedCents: 0,
    commissionPaidCents: 0,
    inviteLinks: [],
    campaignStatusSummary: { total: 0, live: 0, launchReady: 0, blocked: 0 },
    warnings: ["Partner dashboard metrics are temporarily unavailable."],
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="df-eyebrow">Partner Portal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{section}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Read-only partner visibility. Billing, provider, launch, and platform controls remain DealFlow-owned.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {partnerNav.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border border-white/10 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/30 hover:text-foreground">
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Signups", String(summary.signups)],
          ["Active trials", String(summary.activeTrials)],
          ["Paid customers", String(summary.paidCustomers)],
          ["Attributed MRR", money(summary.attributedMrrCents)],
          ["Pending commission", money(summary.commissionPendingCents)],
          ["Approved commission", money(summary.commissionApprovedCents)],
          ["Paid commission", money(summary.commissionPaidCents)],
          ["Churned customers", String(summary.churnedCustomers)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {summary.warnings.length > 0 ? (
        <div className="rounded-df-panel border border-amber-300/20 bg-amber-300/10 p-5 text-sm leading-6 text-amber-100">
          <p className="font-semibold">Some partner metrics are temporarily unavailable.</p>
          <p className="mt-2 text-amber-50/80">
            The portal remains usable. Missing optional metrics are hidden until their data source recovers.
          </p>
        </div>
      ) : null}

      <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
        <h2 className="text-lg font-semibold">Campaign Status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {Object.entries(summary.campaignStatusSummary).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
        <h2 className="text-lg font-semibold">Safety Boundary</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Partner users cannot access native DealFlow customers, other partners, provider secrets, raw webhooks,
          Stripe internals, Meta tokens, or platform-wide admin controls.
        </p>
      </div>
    </div>
  );
}
