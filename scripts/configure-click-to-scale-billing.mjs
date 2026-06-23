#!/usr/bin/env node

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const CONFIRMATION = "CONFIGURE_CLICKTOSCALE_BILLING";
const PARTNER_SLUG = "click-to-scale";
const PRODUCT_NAME = "Click to Scale AI Ads Platform";
const PLAN_LABEL = "Click to Scale AI Ads Platform";
const UNIT_AMOUNT_CENTS = 29700;

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw?.startsWith("--")) continue;
    const [key, inlineValue] = raw.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function loadEnvFile(path) {
  if (!path) return;
  const body = readFileSync(path, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) {
      process.env[key] = unquoteEnvValue(value);
    }
  }
}

function redactId(id) {
  if (!id || id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

async function findOrCreateProduct({ stripe, apply }) {
  const search = await stripe.products.search({
    query: `name:'${PRODUCT_NAME.replace(/'/g, "\\'")}' AND active:'true'`,
    limit: 10,
  });
  const existing = search.data.find(
    (product) =>
      product.name === PRODUCT_NAME &&
      (product.metadata?.dealflow_partner_slug === PARTNER_SLUG ||
        product.metadata?.dealflow_product_role === "partner_subscription" ||
        product.metadata?.dealflow_product_role === "click_to_scale_subscription"),
  );

  if (existing) {
    return { product: existing, action: "reused" };
  }

  if (!apply) {
    return {
      product: {
        id: "dry_run_product",
        name: PRODUCT_NAME,
        metadata: {
          dealflow_partner_slug: PARTNER_SLUG,
          dealflow_product_role: "partner_subscription",
        },
      },
      action: "would_create",
    };
  }

  const product = await stripe.products.create(
    {
      name: PRODUCT_NAME,
      description: "Click to Scale partner-branded DealFlow Pro subscription.",
      metadata: {
        dealflow_partner_slug: PARTNER_SLUG,
        dealflow_product_role: "partner_subscription",
        internal_plan_tier: "pro",
      },
    },
    { idempotencyKey: `click_to_scale_product:${PRODUCT_NAME}` },
  );

  return { product, action: "created" };
}

async function findOrCreatePrice({ stripe, productId, apply }) {
  if (!apply && productId === "dry_run_product") {
    return {
      price: {
        id: "dry_run_price",
        currency: "usd",
        unit_amount: UNIT_AMOUNT_CENTS,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: {
          dealflow_partner_slug: PARTNER_SLUG,
          dealflow_price_role: "pro",
          internal_plan_tier: "pro",
        },
      },
      action: "would_create",
    };
  }

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  const existing = prices.data.find(
    (price) =>
      price.currency === "usd" &&
      price.unit_amount === UNIT_AMOUNT_CENTS &&
      price.recurring?.interval === "month" &&
      price.recurring?.usage_type === "licensed" &&
      price.metadata?.dealflow_partner_slug === PARTNER_SLUG &&
      price.metadata?.internal_plan_tier === "pro",
  );

  if (existing) {
    return { price: existing, action: "reused" };
  }

  if (!apply) {
    return {
      price: {
        id: "dry_run_price",
        currency: "usd",
        unit_amount: UNIT_AMOUNT_CENTS,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: {
          dealflow_partner_slug: PARTNER_SLUG,
          dealflow_price_role: "pro",
          internal_plan_tier: "pro",
        },
      },
      action: "would_create",
    };
  }

  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: UNIT_AMOUNT_CENTS,
      recurring: {
        interval: "month",
        usage_type: "licensed",
      },
      nickname: `${PRODUCT_NAME} Pro`,
      metadata: {
        dealflow_partner_slug: PARTNER_SLUG,
        dealflow_price_role: "pro",
        internal_plan_tier: "pro",
      },
    },
    { idempotencyKey: `click_to_scale_pro_price:${productId}:${UNIT_AMOUNT_CENTS}` },
  );

  return { price, action: "created" };
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnvFile(args.get("env-file"));
  const apply = args.has("apply");
  const dryRun = args.has("dry-run") || !apply;
  const confirm = args.get("confirm");

  if (apply && confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}.`);
  }

  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-04-22.dahlia",
  });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,slug,brand_name,status")
    .eq("slug", PARTNER_SLUG)
    .maybeSingle();
  if (partnerError) throw new Error(`Partner lookup failed: ${partnerError.message}`);
  if (!partner?.id) throw new Error(`Partner ${PARTNER_SLUG} not found.`);

  const { data: branding, error: brandingError } = await supabase
    .from("partner_branding")
    .select("pricing_json")
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (brandingError) throw new Error(`Partner branding lookup failed: ${brandingError.message}`);

  const productResult = await findOrCreateProduct({ stripe, apply });
  const priceResult = await findOrCreatePrice({ stripe, productId: productResult.product.id, apply });

  const nextPricingJson = {
    displayProductName: PRODUCT_NAME,
    checkoutHeadline: PRODUCT_NAME,
    visiblePlans: ["pro"],
    allowDefaultDealFlowPrices: false,
    billingModel: null,
    leadChargeAmountCents: null,
    plans: {
      pro: {
        label: PLAN_LABEL,
        priceId: priceResult.price.id,
      },
    },
    stripeMode: "live",
  };

  if (apply) {
    const { error: updateError } = await supabase.from("partner_branding").upsert(
      {
        partner_id: partner.id,
        pricing_json: nextPricingJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id" },
    );
    if (updateError) throw new Error(`Partner pricing update failed: ${updateError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: dryRun ? "dry-run" : "apply",
        partner: {
          id: partner.id,
          slug: partner.slug,
          brandName: partner.brand_name,
          status: partner.status,
        },
        product: {
          action: productResult.action,
          id: redactId(productResult.product.id),
          name: productResult.product.name,
        },
        price: {
          action: priceResult.action,
          id: redactId(priceResult.price.id),
          unitAmountCents: priceResult.price.unit_amount,
          currency: priceResult.price.currency,
          interval: priceResult.price.recurring?.interval,
          usageType: priceResult.price.recurring?.usage_type,
        },
        pricingConfig: {
          previous: branding?.pricing_json ?? null,
          next: nextPricingJson,
        },
        safety: {
          targetedPartnerOnly: partner.slug === PARTNER_SLUG,
          defaultDealFlowPriceFallbackDisabled: nextPricingJson.allowDefaultDealFlowPrices === false,
          visiblePlans: nextPricingJson.visiblePlans,
          otherPartnersTouched: false,
          checkoutHostedProductName: PRODUCT_NAME,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
