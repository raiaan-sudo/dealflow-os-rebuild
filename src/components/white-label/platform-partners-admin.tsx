import Link from "next/link";
import type { ReactNode } from "react";
import { PartnerCreateForm } from "@/components/white-label/partner-create-form";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";
import { getPlatformPartnerDetail, listPlatformPartners } from "@/lib/white-label/queries";

function money(cents: number | null | undefined) {
  return `$${(Math.max(0, cents ?? 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(value: string | null | undefined) {
  if (!value) return "none";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US");
}

function text(value: unknown, fallback = "not set") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-medium text-white">
      {children}
    </span>
  );
}

function DetailList({
  rows,
}: {
  rows: Array<[string, string | number]>;
}) {
  return (
    <div className="divide-y divide-white/10 rounded-df-panel border border-white/10 bg-white/[0.035]">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_1fr]">
          <span className="text-muted-foreground">{label}</span>
          <span className="break-words font-medium text-white">{value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTable({
  title,
  empty,
  rows,
  renderRow,
}: {
  title: string;
  empty: string;
  rows: Array<Record<string, unknown>>;
  renderRow: (row: Record<string, unknown>, index: number) => React.ReactNode;
}) {
  return (
    <div className="rounded-df-panel border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-white/10">{rows.slice(0, 8).map(renderRow)}</div>
      )}
    </div>
  );
}

export async function PartnerDetailDashboard({ partnerId }: { partnerId: string }) {
  await requirePlatformAdmin();
  const detail = await getPlatformPartnerDetail(partnerId);
  const partner = detail.partner;
  const metrics = detail.metrics;
  const signupUrl = `https://app.agentdealflow.io/${text(partner.slug, "partner")}`;
  const startUrl = `https://app.agentdealflow.io/p/${text(partner.slug, "partner")}/start`;
  const primaryColor = text(partner.primary_color, "#188BF6");
  const secondaryColor = text(partner.secondary_color, "#0A0A0A");
  const accentColor = text(partner.accent_color, "#10B981");
  const pricing = detail.pricing;
  const performance = pricing.plans.performance;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="df-eyebrow">Platform Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{text(partner.brand_name, "Partner")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Partner controls, billing attribution, Stripe product labels, commission tracking, domains, and audit evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/partners" className="rounded-full border border-white/10 px-3 py-2 text-sm">All partners</Link>
          <Link href={startUrl} className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-sm text-cyan-50">Open start</Link>
          <Link href={signupUrl} className="rounded-full border border-white/10 px-3 py-2 text-sm">Short link</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Users signed up" value={metrics.totalSignups} detail={`Latest: ${date(metrics.latestSignup)}`} />
        <MetricCard label="Active customers" value={metrics.activeCustomers} detail={`${metrics.trialingCustomers} trialing, ${metrics.pastDueCustomers} past due`} />
        <MetricCard label="MRR estimate" value={money(metrics.baseMrrCents)} detail={`${money(metrics.leadRevenueCents)} metered lead revenue tracked`} />
        <MetricCard label="Commission owed" value={money(metrics.unpaidCommissionBalanceCents)} detail={`Paid lifetime: ${money(metrics.paidCommissionCents)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Partner setup</p>
                <p className="mt-2 text-xl font-semibold text-white">{text(partner.legal_name, text(partner.brand_name))}</p>
              </div>
              <StatusPill>{text(partner.status)}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Primary", primaryColor],
                ["Secondary", secondaryColor],
                ["Accent", accentColor],
              ].map(([label, color]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="h-8 rounded-xl border border-white/10" style={{ background: color }} />
                  <p className="mt-2 text-xs text-muted-foreground">{label}: <span className="font-mono text-white">{color}</span></p>
                </div>
              ))}
            </div>
          </div>

          <DetailList
            rows={[
              ["Slug", `/${text(partner.slug)}`],
              ["Signup short link", signupUrl],
              ["Partner start link", startUrl],
              ["Support email", text(partner.support_email)],
              ["Logo URL", text(partner.logo_url)],
              ["Favicon URL", text(partner.favicon_url)],
              ["Commission split", `${Math.round(Number(partner.commission_rate ?? 0) * 10000) / 100}%`],
              ["Product display name", text(pricing.displayProductName)],
              ["Checkout headline", text(pricing.checkoutHeadline)],
              ["Default price fallback", pricing.allowDefaultDealFlowPrices ? "enabled" : "disabled"],
              ["Performance label", text(performance?.label)],
              ["Performance base price", text(performance?.basePriceId)],
              ["Performance lead price", text(performance?.meteredLeadPriceId)],
              ["Meter event", text(performance?.meterEventName, "dealflow_billable_lead")],
            ]}
          />
        </div>

        <div className="space-y-4">
          <DetailList
            rows={[
              ["Gross revenue tracked", money(metrics.grossRevenueCents)],
              ["Estimated commission", money(metrics.estimatedCommissionCents)],
              ["Paid commission", money(metrics.paidCommissionCents)],
              ["Last payout amount", money(metrics.lastPayoutAmountCents)],
              ["Last payout date", date(metrics.lastPayoutAt)],
              ["Lead count sampled", metrics.leadCount],
              ["Billable lead events", metrics.billableLeadEvents],
              ["Pending lead billing", metrics.pendingLeadBillingEvents],
              ["Failed subscriptions", metrics.failedSubscriptions],
            ]}
          />

          <MiniTable
            title="Custom domains"
            empty="No custom domains configured yet."
            rows={detail.domains as Array<Record<string, unknown>>}
            renderRow={(row) => (
              <div key={String(row.id)} className="px-4 py-3 text-sm">
                <p className="font-medium text-white">{text(row.domain)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {text(row.verification_status)} / SSL {text(row.ssl_status)} / target {text(row.dns_target)}
                </p>
              </div>
            )}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MiniTable
          title="Recent customers"
          empty="No partner-attributed customers yet."
          rows={detail.accounts as Array<Record<string, unknown>>}
          renderRow={(row) => (
            <div key={String(row.id)} className="px-4 py-3 text-sm">
              <p className="font-mono text-xs text-white">{text(row.account_id)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text(row.attribution_source)} / {date(row.created_at as string)}
              </p>
            </div>
          )}
        />
        <MiniTable
          title="Subscriptions"
          empty="No partner-attributed subscriptions yet."
          rows={detail.billingRows as Array<Record<string, unknown>>}
          renderRow={(row) => (
            <div key={String(row.id)} className="px-4 py-3 text-sm">
              <p className="text-white">{text(row.partner_plan_label, text(row.plan_tier))} <span className="text-muted-foreground">({text(row.status)})</span></p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{text(row.stripe_subscription_id)}</p>
            </div>
          )}
        />
        <MiniTable
          title="Commission ledger"
          empty="No commission events yet."
          rows={detail.commissions as Array<Record<string, unknown>>}
          renderRow={(row) => (
            <div key={String(row.id)} className="px-4 py-3 text-sm">
              <p className="text-white">{text(row.event_type)} / {money(Number(row.commission_amount ?? 0))} <span className="text-muted-foreground">({text(row.status)})</span></p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{text(row.stripe_invoice_id)}</p>
            </div>
          )}
        />
        <MiniTable
          title="Recent audit log"
          empty="No partner audit log rows yet."
          rows={detail.auditLogs as Array<Record<string, unknown>>}
          renderRow={(row) => (
            <div key={String(row.id)} className="px-4 py-3 text-sm">
              <p className="text-white">{text(row.action)} <span className="text-muted-foreground">on {text(row.target_type)}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{date(row.created_at as string)}</p>
            </div>
          )}
        />
      </div>

      <div className="rounded-df-panel border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
        Partner payouts are manual in V1. Mark payout events only after funds are sent outside DealFlow; never use
        Stripe Connect or partner-owned provider keys for this flow.
      </div>
    </div>
  );
}

export async function PlatformPartnersAdmin({
  mode = "list",
  section = mode === "new" ? "New Partner" : "Partners",
}: {
  mode?: "list" | "new";
  section?: string;
}) {
  await requirePlatformAdmin();
  const partners = await listPlatformPartners();

  return (
    <div className="space-y-6">
      <div>
        <p className="df-eyebrow">Platform Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{section}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          White-label controls are centralized here. Every production mutation should write a partner audit log.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/partners" className="rounded-full border border-white/10 px-3 py-2 text-sm">Partners</Link>
        <Link href="/admin/partners/new" className="rounded-full border border-white/10 px-3 py-2 text-sm">New Partner</Link>
      </div>

      {mode === "new" ? (
        <PartnerCreateForm />
      ) : null}

      <div className="rounded-df-panel border border-white/10 bg-white/[0.035]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <span>Partner</span>
          <span>Status</span>
          <span>Updated</span>
        </div>
        {partners.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No partners configured yet.</p>
        ) : (
          partners.map((partner: any) => (
            <Link
              key={partner.id}
              href={`/admin/partners/${partner.id}`}
              className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/5 px-5 py-4 text-sm transition hover:bg-white/[0.035]"
            >
              <span>
                <span className="font-semibold">{partner.brand_name}</span>
                <span className="ml-2 text-muted-foreground">/{partner.slug}</span>
              </span>
              <span>{partner.status}</span>
              <span className="text-muted-foreground">{partner.updated_at ? new Date(partner.updated_at).toLocaleDateString() : "unknown"}</span>
            </Link>
          ))
        )}
      </div>

      <div className="rounded-df-panel border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
        V1 runs on DealFlow&apos;s Stripe account, provider keys, app infrastructure, and campaign engine. Partner
        branding, product names, pricing display, attribution, reporting, and commission tracking are supported.
        Partner payouts are handled manually from the commission ledger.
      </div>
    </div>
  );
}
