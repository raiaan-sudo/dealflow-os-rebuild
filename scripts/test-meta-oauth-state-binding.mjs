#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const callbackRoute = fs.readFileSync("src/app/api/integrations/meta/callback/route.ts", "utf8");
const connectRoute = fs.readFileSync("src/app/api/integrations/meta/connect/route.ts", "utf8");
const oauthState = fs.readFileSync("src/lib/integrations/meta/oauth-state.ts", "utf8");
const campaignRoutes = fs.readFileSync("src/lib/routing/campaign-routes.ts", "utf8");
const appContext = fs.readFileSync("src/lib/services/app-context.ts", "utf8");
const appLayout = fs.readFileSync("src/app/(app)/layout.tsx", "utf8");
const workspaceAccess = fs.readFileSync("src/lib/services/workspace-access.ts", "utf8");
const proxy = fs.readFileSync("src/proxy.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260625190000_create_integration_oauth_states.sql",
  "utf8",
);

assert.match(oauthState, /originHost\?: string \| null/, "OAuth state must carry the originating host");
assert.match(oauthState, /returnHost\?: string \| null/, "OAuth state must carry the intended return host");
assert.match(oauthState, /campaignId\?: string \| null/, "OAuth state must carry campaign identity");
assert.match(oauthState, /partnerId\?: string \| null/, "OAuth state must carry partner identity");
assert.match(oauthState, /hashMetaOAuthState/, "OAuth state module must expose a state hash helper");

assert.match(
  migration,
  /create table if not exists public\.integration_oauth_states/,
  "Meta OAuth must use a server-side state ledger table",
);
assert.match(migration, /state_hash text not null/, "OAuth ledger must store only state hashes, not raw state");
assert.match(migration, /return_host text not null/, "OAuth ledger must store the intended return host");
assert.match(migration, /campaign_id uuid references public\.campaign_plans/, "OAuth ledger must bind campaign IDs");
assert.match(migration, /force row level security/i, "OAuth ledger must force RLS");
assert.match(migration, /auth\.role\(\) = 'service_role'/, "OAuth ledger must be service-role only");

assert.match(connectRoute, /getCampaignIdFromMetaReturnPath/, "Meta connect must parse campaignId from returnTo");
assert.match(connectRoute, /\.eq\("id", params\.campaignId\)/, "Meta connect must load the requested campaign");
assert.match(
  connectRoute,
  /campaignRow\.organization_id !== params\.organizationId/,
  "Meta connect must reject cross-workspace campaign return targets",
);
assert.match(
  connectRoute,
  /\.from\("integration_oauth_states"\)[\s\S]*?\.insert/,
  "Meta connect must insert server-side OAuth state before redirecting to Meta",
);
assert.match(connectRoute, /state_hash: hashMetaOAuthState\(state\)/, "Meta connect must store a state hash");
assert.match(connectRoute, /return_host: returnHost/, "Meta connect must store the white-label return host");

assert.match(campaignRoutes, /sanitizeMetaReturnHost/, "Meta return hosts must be allowlisted");
assert.match(campaignRoutes, /clicktoscale\.io/, "ClickToScale host must be an approved Meta return host");
assert.match(campaignRoutes, /getMetaReturnOrigin/, "Meta callback must build redirects from approved hosts only");

const handlerStartIndex = callbackRoute.indexOf("export async function GET");
const ledgerLookupIndex = callbackRoute.indexOf(".from(\"integration_oauth_states\")", handlerStartIndex);
const consumeStateIndex = callbackRoute.indexOf(".update({ consumed_at", handlerStartIndex);
const tokenExchangeIndex = callbackRoute.indexOf("const { response: tokenRes", handlerStartIndex);
const tokenStoreIndex = callbackRoute.indexOf(".from(\"marketing_accounts\")");

assert.ok(handlerStartIndex > -1, "Meta callback GET handler must exist");
assert.ok(ledgerLookupIndex > -1, "Meta callback must validate the server-side OAuth state ledger");
assert.ok(consumeStateIndex > -1, "Meta callback must consume the server-side OAuth state");
assert.ok(tokenExchangeIndex > -1, "token exchange must exist");
assert.ok(tokenStoreIndex > -1, "token storage must exist");
assert.ok(ledgerLookupIndex < tokenExchangeIndex, "OAuth ledger validation must run before token exchange");
assert.ok(consumeStateIndex < tokenExchangeIndex, "OAuth state consumption must run before token exchange");
assert.ok(consumeStateIndex < tokenStoreIndex, "OAuth state consumption must run before token storage");

assert.match(
  callbackRoute,
  /oauthStateRow\.organization_id !== verifiedState\.organizationId/,
  "Meta callback must verify server-side organization binding",
);
assert.match(
  callbackRoute,
  /oauthStateRow\.return_host !== verifiedState\.returnHost/,
  "Meta callback must verify server-side return host binding",
);
assert.match(
  callbackRoute,
  /verifiedState\.campaignId[\s\S]*?oauthStateRow\.campaign_id/,
  "Meta callback must verify server-side campaign binding",
);
assert.match(
  callbackRoute,
  /getSafeRedirectBase\(\{[\s\S]*returnHost: verifiedState\?\.returnHost/,
  "Meta callback must redirect back to the signed return host",
);
assert.doesNotMatch(
  callbackRoute,
  /message: "Meta OAuth callback state cookie was missing or did not match\.",/,
  "Cookie mismatch alone must not use the old cookie-only failure path",
);

assert.match(proxy, /requestHeaders\.set\("x-search", request\.nextUrl\.search\)/, "proxy must forward query string to server components");
assert.match(appContext, /headers\(\)/, "app context must inspect request headers for campaign-scoped routes");
assert.match(appContext, /getCampaignIdFromRequestHeaders/, "app context must parse campaignId from current request");
assert.match(
  appContext,
  /resolveCampaignWorkspaceForUser\([\s\S]*requestedCampaignId/,
  "app context must resolve workspace from the URL campaign before using the active workspace cookie",
);
assert.match(
  appContext,
  /const requestedWorkspace = campaignWorkspace \?\? await resolveRequestedWorkspaceForUser/,
  "campaign-bound workspace must take precedence over stale active workspace cookies",
);
assert.match(
  workspaceAccess,
  /export async function resolveCampaignWorkspaceForUser/,
  "workspace access must expose a campaign-bound workspace resolver",
);
assert.match(
  workspaceAccess,
  /\.from\("campaign_plans"\)[\s\S]*\.select\("id,organization_id"\)[\s\S]*\.eq\("id", requestedCampaignId\)/,
  "campaign workspace resolver must load the campaign organization from campaign_plans",
);
assert.match(
  workspaceAccess,
  /return resolveWorkspaceAccessForUser\(supabase, profile, String\(campaignRaw\.organization_id\)\)/,
  "campaign workspace resolver must still enforce normal owner/member/admin/partner access",
);
assert.match(appLayout, /getCampaignIdFromSearch/, "app shell must read campaignId from current URL search");
assert.match(
  appLayout,
  /requestedCampaignId \?\? cookieStore\.get\(ACTIVE_CAMPAIGN_COOKIE\)/,
  "app shell campaign links must prefer the URL campaign over the stale active campaign cookie",
);
assert.match(
  appLayout,
  /record\?\.campaign\.organization_id !== organizationId/,
  "app shell must not use a campaign ID from another workspace for navigation context",
);

console.log("Meta OAuth white-label state binding regression passed.");
