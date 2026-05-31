import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";
import { listPlatformPartners } from "@/lib/white-label/queries";

export async function PlatformPartnersAdmin({ section = "Partners" }: { section?: string }) {
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
        V1 deliberately excludes Stripe Connect payouts, cloned apps, partner-owned Stripe accounts, partner-owned provider keys,
        and partner-specific campaign engines.
      </div>
    </div>
  );
}
