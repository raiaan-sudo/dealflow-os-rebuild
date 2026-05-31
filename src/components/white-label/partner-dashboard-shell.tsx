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
  const { membership } = await requirePartnerMembership();
  const summary = await getPartnerDashboardSummary(membership.partner_id);

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
        ].map(([label, value]) => (
          <div key={label} className="rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

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
