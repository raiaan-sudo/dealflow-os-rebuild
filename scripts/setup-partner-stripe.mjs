#!/usr/bin/env node

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--")) {
    const key = value.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const partnerSlug = (args.get("partner") ?? "egenmedia").trim().toLowerCase();
const mode = (args.get("mode") ?? "test").trim().toLowerCase();
const writeConfig = args.get("write-config") !== "false";

if (!["test", "live"].includes(mode)) {
  throw new Error("Use --mode test or --mode live.");
}

const secretKey = mode === "test" ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
if (!secretKey?.trim()) {
  throw new Error(`Missing ${mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY"}.`);
}

const stripe = new Stripe(secretKey.trim(), {
  apiVersion: "2026-04-22.dahlia",
});

const productName = args.get("product-name") ?? "EGEN ACCELERATOR";
const checkoutHeadline = args.get("checkout-headline") ?? "EGEN Accelerator";
const performanceLabel = args.get("performance-label") ?? "EGEN Accelerator";
const baseAmount = Number(args.get("base-cents") ?? 9700);
const leadAmount = Number(args.get("lead-cents") ?? 300);
const commissionRate = Number(args.get("commission-rate") ?? 0.5);

function assertAmount(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer amount in cents.`);
  }
}

assertAmount(baseAmount, "base-cents");
assertAmount(leadAmount, "lead-cents");

async function findOrCreateProduct() {
  const products = await stripe.products.search({
    query: `name:'${productName.replace(/'/g, "\\'")}' AND active:'true'`,
    limit: 10,
  });
  const existing = products.data.find((product) => product.name === productName);
  if (existing) return existing;

  return stripe.products.create(
    {
      name: productName,
      description: "Partner-branded DealFlow performance subscription.",
      metadata: {
        dealflow_partner_slug: partnerSlug,
        dealflow_product_role: "partner_performance",
      },
    },
    { idempotencyKey: `partner_stripe_product:${mode}:${partnerSlug}:${productName}` },
  );
}

async function findRecurringPrice(productId, role, unitAmount, recurring) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
    expand: ["data.product"],
  });

  return prices.data.find((price) => {
    const metadataRole = price.metadata?.dealflow_price_role;
    return (
      metadataRole === role &&
      price.currency === "usd" &&
      price.unit_amount === unitAmount &&
      price.recurring?.interval === recurring.interval &&
      price.recurring?.usage_type === recurring.usage_type
    );
  }) ?? null;
}

async function findOrCreateBasePrice(productId) {
  const existing = await findRecurringPrice(productId, "performance_base", baseAmount, {
    interval: "month",
    usage_type: "licensed",
  });
  if (existing) return existing;

  return stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: baseAmount,
      recurring: {
        interval: "month",
        usage_type: "licensed",
      },
      nickname: `${productName} base`,
      metadata: {
        dealflow_partner_slug: partnerSlug,
        dealflow_price_role: "performance_base",
        internal_plan_tier: "performance",
      },
    },
    { idempotencyKey: `partner_stripe_base_price:${mode}:${partnerSlug}:${baseAmount}` },
  );
}

async function updatePartnerConfig(basePrice) {
  if (!writeConfig) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service-role env; cannot write partner config.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,slug,brand_name")
    .eq("slug", partnerSlug)
    .maybeSingle();

  if (partnerError) throw new Error(`Partner lookup failed: ${partnerError.message}`);
  if (!partner?.id) throw new Error(`Partner slug ${partnerSlug} not found.`);

  const pricingJson = {
    displayProductName: productName,
    checkoutHeadline,
    visiblePlans: ["performance"],
    allowDefaultDealFlowPrices: false,
    plans: {
      performance: {
        label: performanceLabel,
        basePriceId: basePrice.id,
      },
    },
    billingModel: "base_plus_immediate_lead_charge",
    leadChargeAmountCents: leadAmount,
    stripeMode: mode,
  };

  const { error: partnerUpdateError } = await supabase
    .from("partners")
    .update({
      support_email: process.env.EGEN_SUPPORT_EMAIL ?? "rayan@scaleholdings.co",
      primary_color: "#188BF6",
      secondary_color: "#0A0A0A",
      accent_color: "#10B981",
      commission_rate: Number.isFinite(commissionRate) ? commissionRate : 0.5,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", partner.id);

  if (partnerUpdateError) throw new Error(`Partner update failed: ${partnerUpdateError.message}`);

  const { error: brandingError } = await supabase.from("partner_branding").upsert(
    {
      partner_id: partner.id,
      theme_json: {
        primaryColor: "#188BF6",
        secondaryColor: "#0A0A0A",
        accentColor: "#10B981",
      },
      pricing_json: pricingJson,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id" },
  );

  if (brandingError) throw new Error(`Partner branding update failed: ${brandingError.message}`);

  const domain = "app.egenmediaaccelerator.com";
  await supabase.from("partner_domains").upsert(
    {
      partner_id: partner.id,
      domain,
      type: "primary",
      verification_status: "pending",
      ssl_status: "unknown",
      dns_target: "cname.vercel-dns.com",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "domain" },
  );

  return {
    partnerId: partner.id,
    slug: partner.slug,
  };
}

const product = await findOrCreateProduct();
const basePrice = await findOrCreateBasePrice(product.id);
const partnerConfig = await updatePartnerConfig(basePrice);

console.log(JSON.stringify({
  status: "PASS",
  mode,
  partner: partnerConfig,
  product: {
    id: product.id,
    name: product.name,
  },
  prices: {
    performanceBasePriceId: basePrice.id,
    immediateLeadChargeAmountCents: leadAmount,
  },
}, null, 2));
