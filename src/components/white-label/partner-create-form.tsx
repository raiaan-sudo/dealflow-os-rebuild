"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CreatePartnerState = {
  brandName: string;
  slug: string;
  legalName: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  productName: string;
  checkoutHeadline: string;
  allowDefaultDealFlowPrices: boolean;
  performanceLabel: string;
  performanceBasePriceId: string;
  performanceLeadPriceId: string;
  starterLabel: string;
  starterPriceId: string;
  proLabel: string;
  proPriceId: string;
  commissionRatePercent: string;
  status: "draft" | "active";
};

const initialState: CreatePartnerState = {
  brandName: "",
  slug: "",
  legalName: "",
  logoUrl: "",
  faviconUrl: "",
  supportEmail: "",
  primaryColor: "#67e8f9",
  secondaryColor: "#0f172a",
  accentColor: "#a7f3d0",
  productName: "",
  checkoutHeadline: "",
  allowDefaultDealFlowPrices: false,
  performanceLabel: "",
  performanceBasePriceId: "",
  performanceLeadPriceId: "",
  starterLabel: "",
  starterPriceId: "",
  proLabel: "",
  proPriceId: "",
  commissionRatePercent: "20",
  status: "draft",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function PartnerCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState<CreatePartnerState>(initialState);
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    const slug = slugify(form.slug || form.brandName);
    return slug ? `/p/${slug}/start` : "/p/partner-slug/start";
  }, [form.brandName, form.slug]);

  function updateField<Key extends keyof CreatePartnerState>(key: Key, value: CreatePartnerState[Key]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "brandName" && !slugTouched) {
        next.slug = slugify(String(value));
      }
      if (key === "slug") {
        next.slug = slugify(String(value));
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const commissionRate = Number(form.commissionRatePercent) / 100;
      const response = await fetch("/api/admin/partners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName: form.brandName.trim(),
          slug: slugify(form.slug || form.brandName),
          legalName: form.legalName.trim() || null,
          logoUrl: form.logoUrl.trim() || null,
          faviconUrl: form.faviconUrl.trim() || null,
          supportEmail: form.supportEmail.trim() || null,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor || null,
          accentColor: form.accentColor || null,
          commissionRate: Number.isFinite(commissionRate) ? commissionRate : 0,
          status: form.status,
          pricing: {
            displayProductName: form.productName.trim() || null,
            checkoutHeadline: form.checkoutHeadline.trim() || null,
            visiblePlans: ["performance", "starter", "pro"],
            allowDefaultDealFlowPrices: form.allowDefaultDealFlowPrices,
            plans: {
              performance: {
                label: form.performanceLabel.trim() || form.productName.trim() || null,
                basePriceId: form.performanceBasePriceId.trim() || null,
                meteredLeadPriceId: form.performanceLeadPriceId.trim() || null,
                meterEventName: "dealflow_billable_lead",
              },
              starter: {
                label: form.starterLabel.trim() || null,
                priceId: form.starterPriceId.trim() || null,
              },
              pro: {
                label: form.proLabel.trim() || null,
                priceId: form.proPriceId.trim() || null,
              },
            },
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        partner?: { id?: string };
        error?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.success || !payload.partner?.id) {
        throw new Error(payload?.message ?? payload?.error ?? "Partner could not be created.");
      }

      router.push(`/admin/partners/${payload.partner.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Partner could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-df-panel border border-white/10 bg-white/[0.035] p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Partner name</span>
          <input
            required
            value={form.brandName}
            onChange={(event) => updateField("brandName", event.target.value)}
            placeholder="Smith Realty Group"
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Partner slug</span>
          <input
            required
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true);
              updateField("slug", event.target.value);
            }}
            placeholder="smith-realty"
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Legal name</span>
          <input
            value={form.legalName}
            onChange={(event) => updateField("legalName", event.target.value)}
            placeholder="Optional"
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Support email</span>
          <input
            type="email"
            value={form.supportEmail}
            onChange={(event) => updateField("supportEmail", event.target.value)}
            placeholder="support@partner.com"
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Logo URL</span>
          <input
            type="url"
            value={form.logoUrl}
            onChange={(event) => updateField("logoUrl", event.target.value)}
            placeholder="https://..."
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Favicon URL</span>
          <input
            type="url"
            value={form.faviconUrl}
            onChange={(event) => updateField("faviconUrl", event.target.value)}
            placeholder="Optional https://..."
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Commission rate</span>
          <div className="flex h-11 items-center rounded-df-control border border-white/10 bg-black/20 px-3 focus-within:border-cyan-200/50">
            <input
              inputMode="decimal"
              value={form.commissionRatePercent}
              onChange={(event) => updateField("commissionRatePercent", event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">Status</span>
          <select
            value={form.status}
            onChange={(event) => updateField("status", event.target.value as CreatePartnerState["status"])}
            className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {([
          ["primaryColor", "Primary"],
          ["secondaryColor", "Secondary"],
          ["accentColor", "Accent"],
        ] as const).map(([key, label]) => (
          <label key={key} className="space-y-2">
            <span className="text-sm font-medium text-white">{label} color</span>
            <div className="flex h-11 items-center gap-2 rounded-df-control border border-white/10 bg-black/20 px-3 focus-within:border-cyan-200/50">
              <input
                type="color"
                value={form[key]}
                onChange={(event) => updateField(key, event.target.value)}
                className="h-7 w-8 rounded border-0 bg-transparent p-0"
              />
              <input
                value={form[key]}
                onChange={(event) => updateField(key, event.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </div>
          </label>
        ))}
      </div>

      <div className="rounded-2xl border border-cyan-200/15 bg-cyan-200/10 p-4 text-sm text-cyan-50">
        Signup URL preview: <span className="font-mono text-cyan-100">{previewUrl}</span>
        <span className="mt-1 block text-xs text-cyan-100/70">
          Short link also works: <span className="font-mono">/{slugify(form.slug || form.brandName) || "partner-slug"}</span>
        </span>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">Partner Stripe products</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            These are DealFlow-owned Stripe Product/Price IDs. Partner labels show in Checkout, invoices, receipts, and billing portal.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Product display name</span>
            <input
              value={form.productName}
              onChange={(event) => updateField("productName", event.target.value)}
              placeholder="EGEN ACCELERATOR"
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Checkout headline</span>
            <input
              value={form.checkoutHeadline}
              onChange={(event) => updateField("checkoutHeadline", event.target.value)}
              placeholder="EGEN Accelerator"
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
        </div>
        <label className="flex items-center gap-3 rounded-df-control border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white">
          <input
            type="checkbox"
            checked={form.allowDefaultDealFlowPrices}
            onChange={(event) => updateField("allowDefaultDealFlowPrices", event.target.checked)}
            className="h-4 w-4"
          />
          Allow default DealFlow prices when partner price IDs are missing
        </label>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Performance label</span>
            <input
              value={form.performanceLabel}
              onChange={(event) => updateField("performanceLabel", event.target.value)}
              placeholder="EGEN Accelerator"
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Performance base price</span>
            <input
              value={form.performanceBasePriceId}
              onChange={(event) => updateField("performanceBasePriceId", event.target.value)}
              placeholder="price_..."
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Performance lead price</span>
            <input
              value={form.performanceLeadPriceId}
              onChange={(event) => updateField("performanceLeadPriceId", event.target.value)}
              placeholder="price_..."
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Starter label</span>
            <input
              value={form.starterLabel}
              onChange={(event) => updateField("starterLabel", event.target.value)}
              placeholder="EGEN Launch"
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Starter price</span>
            <input
              value={form.starterPriceId}
              onChange={(event) => updateField("starterPriceId", event.target.value)}
              placeholder="price_..."
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Pro price</span>
            <input
              value={form.proPriceId}
              onChange={(event) => updateField("proPriceId", event.target.value)}
              placeholder="price_..."
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-white">Pro label</span>
            <input
              value={form.proLabel}
              onChange={(event) => updateField("proLabel", event.target.value)}
              placeholder="EGEN Scale"
              className="h-11 w-full rounded-df-control border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/50"
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setForm(initialState);
            setSlugTouched(false);
            setError(null);
          }}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-muted-foreground transition hover:text-white"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-df-primary px-5 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating..." : "Create partner"}
        </button>
      </div>
    </form>
  );
}
