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
const branding = read("src/lib/white-label/branding.ts");
const loginForm = read("src/components/auth/login-form.tsx");
const partnerCreateForm = read("src/components/white-label/partner-create-form.tsx");
const platformPartnersAdmin = read("src/components/white-label/platform-partners-admin.tsx");
const billingService = read("src/lib/services/billing-service.ts");
const stripeService = read("src/lib/integrations/stripe/service.ts");
const proxy = read("src/proxy.ts");
const adminPartnerRoute = read("src/app/api/admin/partners/route.ts");
const appContext = read("src/lib/services/app-context.ts");
const appLayout = read("src/app/(app)/layout.tsx");
const sidebar = read("src/components/layout/sidebar.tsx");
const topBar = read("src/components/layout/top-bar.tsx");
const authenticatedBrand = read("src/lib/white-label/authenticated-brand.ts");
const workspaceAccess = read("src/lib/services/workspace-access.ts");
const workspaceSwitchRoute = read("src/app/api/workspaces/switch/route.ts");
const partnerDashboardShell = read("src/components/white-label/partner-dashboard-shell.tsx");
const partnerDashboardError = read("src/app/(app)/partner/error.tsx");
const settingsPage = read("src/app/(app)/settings/page.tsx");

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
assert.match(attribution, /findActivePartnerFromOrganization/, "authenticated app attribution must trust durable organization partner_id");
assert.match(attribution, /organization\.partner_id/, "organization partner attribution must be preserved after login");
assert.match(attribution, /attribution_detail: "organization\.partner_id"/, "organization partner attribution must create an auditable partner account link");
assert.match(branding, /isSafeBrandAssetUrl/, "brand resolver must allow app-owned root-relative logo assets");
assert.match(branding, /\^\\\/\[a-z0-9\/_\\\-\.\]\+/, "brand asset allowlist must stay path-scoped");

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
assert.match(partnerCreateForm, /logoUrl/, "new-partner form must support logo URL entry");
assert.match(partnerCreateForm, /faviconUrl/, "new-partner form must support favicon URL entry");
assert.match(partnerCreateForm, /Short link also works/, "new-partner form must explain the short partner URL");

assert.match(appContext, /resolveRequestedWorkspaceForUser/, "app context must support server-validated active workspace switching");
assert.match(appContext, /requestedWorkspace\?\.access && requestedWorkspace\.access !== "owner"/, "managed workspace viewing must avoid owner-only partner attribution writes");
assert.match(appContext, /logo_url,favicon_url,primary_color,secondary_color,accent_color/, "authenticated app context must load full partner branding fields");
assert.match(authenticatedBrand, /resolveAuthenticatedBrandContext/, "authenticated brand resolver must exist");
assert.match(authenticatedBrand, /BrandContext/, "authenticated brand context type must exist");
assert.match(appLayout, /resolveAuthenticatedBrandContext/, "app layout must consume canonical brand context");
assert.match(appLayout, /style=\{brandContext\?\.cssVars\}/, "app layout must apply partner theme variables");
assert.match(appLayout, /listManagedWorkspacesForContext/, "app layout must load eligible managed workspaces");
assert.match(sidebar, /BrandMark/, "sidebar must render a safe brand mark");
assert.match(sidebar, /onError=\{\(\) => setLogoFailed\(true\)\}/, "sidebar logo must fall back on broken images");
assert.doesNotMatch(sidebar, /<Logo/, "authenticated shell must not force the default DealFlow logo");
assert.match(sidebar, /displayBrandName = brandName \|\| "DealFlow"/, "authenticated shell brand text must come from canonical brand props before native fallback");
assert.match(sidebar, /alt=\{`\$\{brandName\} logo`\}/, "partner logo alt text must use the partner brand, not DealFlow");
assert.match(sidebar, /WorkspaceSwitcher/, "sidebar must include the agency workspace switcher");
assert.match(topBar, /managedWorkspaces/, "mobile top bar must receive managed workspace options");
assert.match(workspaceAccess, /resolveWorkspaceAccessForUser/, "workspace switching must validate access server-side");
assert.match(workspaceAccess, /partner_memberships[\s\S]*partner_accounts/, "partner workspace access must be scoped through partner accounts");
assert.match(workspaceSwitchRoute, /resolveWorkspaceAccessForUser/, "workspace switch route must validate target workspace");
assert.match(workspaceSwitchRoute, /assertSameOriginRequest/, "workspace switch route must require same-origin requests");
assert.match(workspaceSwitchRoute, /httpOnly: true/, "active workspace cookie must be httpOnly");
assert.match(partnerDashboardShell, /No partner access/, "partner route must gracefully handle non-partner users");
assert.match(partnerDashboardShell, /warnings\.length/, "partner dashboard must fail soft for optional metric issues");
assert.match(partnerDashboardError, /Partner portal is recovering/, "partner route must have a customer-safe error boundary");
assert.match(settingsPage, /export const dynamic = "force-dynamic"/, "settings must be force-dynamic for authenticated workspace data");
assert.match(settingsPage, /export const revalidate = 0/, "settings must disable static revalidation");
assert.match(settingsPage, /export const fetchCache = "force-no-store"/, "settings must avoid cached authenticated fetches");
assert.match(settingsPage, /data-testid="settings-v2-root"/, "settings must expose a stable v2 proof marker");
assert.match(settingsPage, /data-settings-version="settings-v2"/, "settings must expose a safe source/version proof marker");
assert.match(settingsPage, /data-testid="settings-profile-form"/, "settings profile form must be test-addressable");
assert.match(settingsPage, /data-testid="settings-workspace-form"/, "settings workspace form must be test-addressable");
assert.match(settingsPage, /data-testid="settings-billing-card"/, "settings billing card must be test-addressable");
assert.match(settingsPage, /data-testid="settings-credits-card"/, "settings credits card must be test-addressable");
assert.match(settingsPage, /updateProfileAndWorkspace/, "settings must allow safe profile/workspace edits");
assert.match(settingsPage, /Save profile settings/, "settings must expose a non-dead profile save action");

assert.match(proxy, /pathname\.startsWith\("\/p\/"\)/, "partner slug routes must be public before auth");
assert.match(proxy, /pathname\.startsWith\("\/invite\/"\)/, "custom-domain invite routes must be public before auth");
assert.match(proxy, /RESERVED_ROOT_PATHS/, "short partner URLs must reserve app root routes");
assert.match(proxy, /rootSlugMatch/, "short partner URLs must be public before auth");

for (const route of [
  "src/app/p/[partnerSlug]/start/page.tsx",
  "src/app/[partnerSlug]/page.tsx",
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
  "src/app/(app)/partner/error.tsx",
  "src/app/(app)/admin/partners/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/branding/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/domains/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/commissions/page.tsx",
  "src/app/(app)/admin/partners/[partnerId]/audit-log/page.tsx",
  "src/app/api/admin/partners/route.ts",
  "src/app/api/workspaces/switch/route.ts",
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
