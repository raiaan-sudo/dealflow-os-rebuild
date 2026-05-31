#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const migration = read("supabase/migrations/20260531160000_create_white_label_partner_infrastructure.sql");
const resolver = read("src/lib/white-label/resolver.ts");
const permissions = read("src/lib/white-label/permissions.ts");
const attribution = read("src/lib/white-label/attribution.ts");
const loginForm = read("src/components/auth/login-form.tsx");
const partnerCreateForm = read("src/components/white-label/partner-create-form.tsx");
const platformPartnersAdmin = read("src/components/white-label/platform-partners-admin.tsx");
const billingService = read("src/lib/services/billing-service.ts");
const stripeService = read("src/lib/integrations/stripe/service.ts");
const proxy = read("src/proxy.ts");
const adminPartnerRoute = read("src/app/api/admin/partners/route.ts");

for (const table of [
  "partners",
  "partner_domains",
  "partner_branding",
  "partner_memberships",
  "partner_invites",
  "partner_accounts",
  "partner_billing_attribution",
  "partner_commission_events",
  "partner_audit_logs",
  "partner_vertical_configs",
  "partner_support_settings",
  "partner_feature_flags",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} table must exist`);
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`), `${table} must force RLS`);
}

for (const existingTable of [
  "organizations",
  "users",
  "campaign_plans",
  "leads",
  "creative_assets",
  "billing_subscriptions",
  "system_jobs",
]) {
  assert.match(migration, new RegExp(`alter table if exists public\\.${existingTable} add column if not exists partner_id`), `${existingTable} must receive nullable partner_id`);
}

assert.match(migration, /is_current_user_partner_member/, "partner membership RLS helper must exist");
assert.match(migration, /partner_commission_events_invoice_event_unique/, "commission event idempotency index must exist");
assert.match(migration, /partner_id is null/, "native DealFlow null partner path must be preserved");

assert.match(resolver, /findPartnerByInvite[\s\S]*findPartnerByVerifiedDomain[\s\S]*findPartnerBySlug/, "resolver must prefer explicit invite attribution before slug/domain fallback");
assert.match(resolver, /byInvite\.partner\.slug === normalizedSlug/, "partner invite routes must reject slug/code mismatches");
assert.match(resolver, /verification_status", "verified"/, "resolver must reject unverified custom domains");
assert.match(resolver, /nativeFallback/, "resolver must have native fallback");
assert.match(resolver, /isInviteUsableForPartner/, "invite route must validate expiry and use limits");

assert.match(permissions, /requirePlatformAdmin/, "platform admin guard must exist");
assert.match(permissions, /requirePartnerMembership/, "partner membership guard must exist");
assert.match(permissions, /requirePartnerAdmin/, "partner admin guard must exist");
assert.match(permissions, /requireAccountAccess/, "account access guard must exist");

assert.match(attribution, /partner_accounts[\s\S]*onConflict: "account_id"/, "partner attribution must lock account attribution");
assert.match(attribution, /partner_slug/, "signup metadata must support slug attribution");
assert.match(attribution, /partner_invite_code/, "signup metadata must support invite attribution");

assert.match(loginForm, /partnerAttribution/, "LoginForm must accept partner attribution");
assert.match(loginForm, /partner_slug/, "sign-up must pass partner_slug to auth metadata");
assert.match(loginForm, /partner_invite_code/, "sign-up must pass partner_invite_code to auth metadata");
assert.match(loginForm, /Powered by DealFlow/, "partner shell must preserve DealFlow disclosure");

assert.match(stripeService, /partner_id/, "Stripe checkout metadata must include partner_id");
assert.match(stripeService, /partner_slug/, "Stripe checkout metadata must include partner_slug");
assert.match(billingService, /partner_billing_attribution/, "billing sync must create partner billing attribution");
assert.match(billingService, /partner_commission_events/, "invoice payment must create commission events");
assert.match(billingService, /createPartnerCommissionEventForInvoice/, "commission ledger helper must exist");
assert.match(adminPartnerRoute, /assertSameOriginRequest/, "admin partner creation must require same-origin requests");
assert.match(adminPartnerRoute, /requirePlatformAdmin/, "admin partner creation must require platform admin");
assert.match(adminPartnerRoute, /partner_audit_logs/, "admin partner creation must write audit logs");
assert.match(platformPartnersAdmin, /mode\?: "list" \| "new"/, "admin partners shell must support a dedicated new-partner mode");
assert.match(platformPartnersAdmin, /<PartnerCreateForm \/>/, "new-partner route must render the create form instead of only the partner list");
assert.match(partnerCreateForm, /fetch\("\/api\/admin\/partners"/, "new-partner form must submit to the secured partner creation API");
assert.match(partnerCreateForm, /router\.push\(`\/admin\/partners\/\$\{payload\.partner\.id\}`\)/, "successful partner creation must navigate to the created partner detail page");

assert.match(proxy, /pathname\.startsWith\("\/p\/"\)/, "partner slug routes must be public before auth");
assert.match(proxy, /pathname\.startsWith\("\/invite\/"\)/, "custom-domain invite routes must be public before auth");

for (const route of [
  "src/app/p/[partnerSlug]/start/page.tsx",
  "src/app/p/[partnerSlug]/invite/[code]/page.tsx",
  "src/app/start/page.tsx",
  "src/app/invite/[code]/page.tsx",
  "src/app/(app)/partner/page.tsx",
  "src/app/(app)/partner/customers/page.tsx",
  "src/app/(app)/partner/trials/page.tsx",
  "src/app/(app)/partner/revenue/page.tsx",
  "src/app/(app)/partner/commissions/page.tsx",
  "src/app/(app)/partner/invite-links/page.tsx",
  "src/app/(app)/partner/settings/page.tsx",
  "src/app/(app)/admin/partners/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/branding/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/domains/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/commissions/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/audit-log/page.tsx",
  "src/app/api/admin/partners/route.ts",
]) {
  assert.equal(exists(route), true, `${route} must exist`);
}

const source = [
  resolver,
  permissions,
  attribution,
  loginForm,
  billingService,
  stripeService,
].join("\n");
assert.doesNotMatch(source, /partner_slug\s*===\s*["']|partnerSlug\s*===\s*["']/, "white-label logic must not hardcode partner-specific slug branches");

console.log("White-label foundation tests passed.");
