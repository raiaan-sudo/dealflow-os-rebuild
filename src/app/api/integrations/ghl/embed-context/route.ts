import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";
import { getSupabaseEnv, isInternalAdminEmail } from "@/lib/env";
import { decryptGhlSignedUserContext } from "@/lib/integrations/gohighlevel/signed-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  createGhlEmbedAuthHandoff,
  createGhlEmbedCapability,
  createGhlEmbedSessionMarker,
  createGhlEmbedSignedContextDigest,
  getGhlAppSharedSecret,
  getGhlEmbedCapabilityCookieOptions,
  getGhlEmbedSessionCookieOptions,
  GHL_EMBED_CAPABILITY_COOKIE,
  GHL_EMBED_SESSION_COOKIE,
  resolveAllowedGhlParentOrigin,
  verifyGhlEmbedAuthHandoff,
  verifyGhlEmbedCapability,
} from "@/lib/white-label/ghl-embed-capability";
import { resolveGhlEmbedHostContext } from "@/lib/white-label/ghl-embed-host-context";
import { isExactVerifiedPartnerRequestOrigin } from "@/lib/white-label/ghl-embed-request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  encryptedData: z.string().min(24).max(32_768),
  parentOrigin: z.string().url().max(512),
  handoffToken: z.string().min(128).max(8_192).optional(),
}).strict();

const BLOCKED_PASSWORDLESS_ROLES = new Set([
  "platform_admin",
  "internal_admin",
  "operator",
]);

function rows(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function bindPartnerId(query: any, partnerId: string | null) {
  return partnerId === null ? query.is("partner_id", null) : query.eq("partner_id", partnerId);
}

function deny(code: string, status = 403) {
  return NextResponse.json(
    { error: "The embedded CRM context could not be verified.", code },
    { status },
  );
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function authUserIsActive(authUser: Record<string, unknown>, expectedEmail: string) {
  const bannedUntil = authUser.banned_until ? Date.parse(String(authUser.banned_until)) : NaN;
  return authUser.id &&
    normalized(authUser.email) === expectedEmail &&
    !authUser.deleted_at &&
    authUser.is_anonymous !== true &&
    Boolean(authUser.email_confirmed_at) &&
    (!Number.isFinite(bannedUntil) || bannedUntil <= Date.now());
}

function isMissingAuthSession(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  return candidate?.name === "AuthSessionMissingError" ||
    /auth session missing/i.test(String(candidate?.message ?? ""));
}

async function verifyPasswordlessEmbedAuthority(input: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  userId: string;
  email: string;
  partnerId: string | null;
  organizationId: string;
}) {
  if (isInternalAdminEmail(input.email)) return false;
  const [profileResult, membershipResult, operatorResult, suspensionResult, authResult] =
    await Promise.all([
      bindPartnerId(
        (input.admin as any)
          .from("users")
          .select("id,email,partner_id")
          .eq("id", input.userId),
        input.partnerId,
      ).limit(2),
      (input.admin as any)
        .from("organization_memberships")
        .select("organization_id,user_id,role")
        .eq("organization_id", input.organizationId)
        .eq("user_id", input.userId)
        .limit(2),
      (input.admin as any)
        .rpc("has_platform_operator_grant_v1", {
          p_user_id: input.userId,
        }),
      (input.admin as any)
        .from("account_deletion_suspensions")
        .select("organization_id,requested_by_user_id")
        .or(`organization_id.eq.${input.organizationId},requested_by_user_id.eq.${input.userId}`)
        .limit(1),
      input.admin.auth.admin.getUserById(input.userId),
    ]);
  const profiles = rows(profileResult.data);
  const memberships = rows(membershipResult.data);
  const suspensions = rows(suspensionResult.data);
  const membership = memberships[0] as Record<string, unknown> | undefined;
  const authUser = authResult.data?.user as unknown as Record<string, unknown> | undefined;
  return !profileResult.error &&
    !membershipResult.error &&
    !operatorResult.error &&
    !suspensionResult.error &&
    !authResult.error &&
    profiles.length === 1 &&
    memberships.length === 1 &&
    operatorResult.data === false &&
    suspensions.length === 0 &&
    normalized((profiles[0] as Record<string, unknown>).email) === input.email &&
    !BLOCKED_PASSWORDLESS_ROLES.has(normalized(membership?.role)) &&
    Boolean(authUser && authUserIsActive(authUser, input.email));
}

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const hostContext = await resolveGhlEmbedHostContext(requestUrl.hostname);
    const referer = request.headers.get("referer")?.trim() ?? "";
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
    if (
      !hostContext ||
      requestUrl.hostname.toLowerCase() !== hostContext.domain ||
      (!isExplicitNonProductionDeployment() && requestUrl.protocol !== "https:") ||
      !referer ||
      new URL(referer).origin !== requestUrl.origin ||
      (fetchSite && fetchSite !== "same-origin")
    ) {
      return deny("ghl_embed_cookie_probe_invalid");
    }
    const capability = await verifyGhlEmbedCapability(
      request.cookies.get(GHL_EMBED_CAPABILITY_COOKIE)?.value,
      { expectedHost: hostContext.domain },
    );
    if (!capability) return deny("ghl_embed_cookie_unavailable", 401);
    return NextResponse.json(
      { available: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return deny("ghl_embed_cookie_probe_failed", 400);
  }
}

export async function POST(request: Request) {
  try {
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "ghl-embed-context"),
      limit: 20,
      windowMs: 60_000,
    });
    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const requestUrl = new URL(request.url);
    const hostContext = await resolveGhlEmbedHostContext(requestUrl.hostname);
    if (
      !hostContext ||
      !isExactVerifiedPartnerRequestOrigin({
        requestUrl: request.url,
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        fetchSite: request.headers.get("sec-fetch-site"),
        partnerDomain: hostContext.domain,
        requireHttps: !isExplicitNonProductionDeployment(),
      })
    ) {
      return deny("ghl_embed_same_origin_invalid");
    }

    const body = await parseJsonBody(request, bodySchema);
    const sharedSecret = getGhlAppSharedSecret();
    if (!sharedSecret || process.env.GHL_IFRAME_EMBED_ENABLED !== "true") {
      return deny("ghl_embed_disabled", 503);
    }

    const parentOrigin = resolveAllowedGhlParentOrigin({
      candidate: body.parentOrigin,
      partnerHost: hostContext.domain,
    });
    const nonProductionDeployment = isExplicitNonProductionDeployment();
    const signedContext = decryptGhlSignedUserContext(body.encryptedData, sharedSecret, {
      allowDraft: nonProductionDeployment,
    });
    if (!parentOrigin || !signedContext) {
      return deny("ghl_embed_context_invalid");
    }
    if (isInternalAdminEmail(signedContext.email)) {
      return deny("ghl_embed_passwordless_authority_denied");
    }

    const admin = createAdminClient();
    if (!admin) return deny("ghl_embed_authority_unavailable", 503);
    const allowedEnvironments = nonProductionDeployment
      ? ["sandbox", "test"]
      : ["production"];

    const mappingResult = await bindPartnerId(
      (admin as any)
        .from("ghl_location_mappings")
        .select("id,organization_id,partner_id,installation_id,environment,provider_location_id,status")
        .eq("provider_location_id", signedContext.activeLocation)
        .eq("status", "active")
        .in("environment", allowedEnvironments),
      hostContext.partnerId,
    ).limit(2);
    const mappings = rows(mappingResult.data);
    if (mappingResult.error || mappings.length !== 1) {
      return deny("ghl_embed_location_unbound");
    }
    const mapping = mappings[0] as Record<string, unknown>;

    const [installationResult, tenantResult, ghlUserResult] = await Promise.all([
      (admin as any)
        .from("ghl_installations")
        .select("id,environment,partner_id,provider_agency_id,status")
        .eq("id", mapping.installation_id)
        .eq("environment", mapping.environment)
        .eq("status", "active")
        .limit(2),
      bindPartnerId(
        (admin as any)
          .from("ghl_workspace_tenants")
          .select("organization_id,partner_id,tenant_kind,status")
          .eq("organization_id", mapping.organization_id)
          .eq("tenant_kind", hostContext.tenantKind)
          .eq("status", "active"),
        hostContext.partnerId,
      ).limit(2),
      bindPartnerId(
        (admin as any)
          .from("workspace_ghl_users")
          .select("workspace_id,partner_id,ghl_location_id,ghl_user_id,email,invite_status,dealflow_user_id")
          .eq("workspace_id", mapping.organization_id)
          .eq("ghl_location_id", signedContext.activeLocation)
          .eq("ghl_user_id", signedContext.userId)
          .ilike("email", signedContext.email)
          .eq("invite_status", "active"),
        hostContext.partnerId,
      ).limit(2),
    ]);
    const installations = rows(installationResult.data);
    const tenants = rows(tenantResult.data);
    let ghlUsers = rows(ghlUserResult.data);
    const installation = installations[0] as Record<string, unknown> | undefined;
    if (
      hostContext.tenantKind === "direct_realtor" &&
      hostContext.partnerId === null &&
      !installationResult.error &&
      !tenantResult.error &&
      !ghlUserResult.error &&
      installations.length === 1 &&
      tenants.length === 1 &&
      ghlUsers.length === 0 &&
      installation?.provider_agency_id === signedContext.companyId &&
      installation?.partner_id === null
    ) {
      const directBindingResult = await (admin as any).rpc(
        "bind_direct_workspace_ghl_user_v1",
        {
          p_workspace_id: String(mapping.organization_id),
          p_ghl_location_id: signedContext.activeLocation,
          p_ghl_user_id: signedContext.userId,
          p_normalized_email: signedContext.email,
        },
      );
      if (!directBindingResult.error && typeof directBindingResult.data === "string") {
        ghlUsers = [{
          email: signedContext.email,
          dealflow_user_id: directBindingResult.data,
        }];
      }
    }
    const ghlUser = ghlUsers[0] as Record<string, unknown> | undefined;
    let boundDealflowUserId = String(ghlUser?.dealflow_user_id ?? "");
    if (
      installationResult.error ||
      tenantResult.error ||
      ghlUserResult.error ||
      installations.length !== 1 ||
      tenants.length !== 1 ||
      ghlUsers.length !== 1 ||
      normalized(ghlUser?.email) !== signedContext.email ||
      installation?.provider_agency_id !== signedContext.companyId ||
      installation?.partner_id !== hostContext.partnerId
    ) {
      return deny("ghl_embed_tenant_context_mismatch");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      boundDealflowUserId,
    )) {
      const bindingResult = await (admin as any).rpc("bind_workspace_ghl_dealflow_user_v1", {
        p_workspace_id: String(mapping.organization_id),
        p_partner_id: hostContext.partnerId,
        p_ghl_location_id: signedContext.activeLocation,
        p_ghl_user_id: signedContext.userId,
        p_normalized_email: signedContext.email,
      });
      boundDealflowUserId = typeof bindingResult.data === "string" ? bindingResult.data : "";
      if (
        bindingResult.error ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          boundDealflowUserId,
        )
      ) {
        return deny("ghl_embed_user_binding_unavailable");
      }
    }

    const routeClient = await createRouteHandlerClient();
    const authResult = routeClient ? await routeClient.auth.getUser() : null;
    const dealflowUser = authResult?.data.user ?? null;
    if (authResult?.error && !isMissingAuthSession(authResult.error)) {
      return deny("ghl_embed_dealflow_session_invalid", 401);
    }

    const organizationId = String(mapping.organization_id);
    const partnerId = hostContext.partnerId;
    const payloadDigest = await createGhlEmbedSignedContextDigest(body.encryptedData);
    if (!payloadDigest) return deny("ghl_embed_context_digest_unavailable", 503);

    const authorityValid = await verifyPasswordlessEmbedAuthority({
      admin,
      userId: boundDealflowUserId,
      email: signedContext.email,
      partnerId,
      organizationId,
    });
    if (!authorityValid) return deny("ghl_embed_passwordless_authority_denied");

    if (dealflowUser) {
      const membershipResult = await (admin as any)
        .from("organization_memberships")
        .select("organization_id,user_id")
        .eq("organization_id", mapping.organization_id)
        .eq("user_id", dealflowUser.id)
        .limit(2);
      const memberships = rows(membershipResult.data);
      if (
        membershipResult.error ||
        memberships.length !== 1 ||
        dealflowUser.id !== boundDealflowUserId ||
        dealflowUser.email?.trim().toLowerCase() !== signedContext.email
      ) {
        return deny("ghl_embed_dealflow_membership_mismatch");
      }
      const [capability, sessionMarker] = await Promise.all([
        createGhlEmbedCapability({
          stage: "authenticated",
          partnerId,
          domain: hostContext.domain,
          organizationId,
          locationId: signedContext.activeLocation,
          companyId: signedContext.companyId,
          ghlUserId: signedContext.userId,
          ghlEmail: signedContext.email,
          parentOrigin,
          dealflowUserId: dealflowUser.id,
        }),
        createGhlEmbedSessionMarker({
          domain: hostContext.domain,
          partnerId,
          parentOrigin,
          dealflowUserId: dealflowUser.id,
        }),
      ]);
      if (!capability || !sessionMarker) return deny("ghl_embed_capability_unavailable", 503);
      const response = NextResponse.json({ status: "ready", nextPath: "/dashboard" });
      response.cookies.set(
        GHL_EMBED_CAPABILITY_COOKIE,
        capability,
        getGhlEmbedCapabilityCookieOptions(requestUrl.protocol === "https:", "authenticated"),
      );
      response.cookies.set(
        GHL_EMBED_SESSION_COOKIE,
        sessionMarker,
        getGhlEmbedSessionCookieOptions(requestUrl.protocol === "https:"),
      );
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }

    if (!body.handoffToken) {
      const beginResult = await (admin as any).rpc("begin_ghl_embed_auth_exchange_v1", {
        p_payload_digest: payloadDigest,
        p_partner_id: partnerId,
        p_organization_id: organizationId,
        p_provider_location_id: signedContext.activeLocation,
        p_provider_user_id: signedContext.userId,
        p_dealflow_user_id: boundDealflowUserId,
      });
      const receiptId = typeof beginResult.data === "string" ? beginResult.data : "";
      if (beginResult.error || !receiptId) return deny("ghl_embed_exchange_receipt_denied");
      const [handoffToken, capability, sessionMarker] = await Promise.all([
        createGhlEmbedAuthHandoff({
          receiptId,
          payloadDigest,
          partnerId,
          domain: hostContext.domain,
          organizationId,
          locationId: signedContext.activeLocation,
          companyId: signedContext.companyId,
          ghlUserId: signedContext.userId,
          dealflowUserId: boundDealflowUserId,
          parentOrigin,
        }),
        createGhlEmbedCapability({
          stage: "preauth",
          partnerId,
          domain: hostContext.domain,
          organizationId,
          locationId: signedContext.activeLocation,
          companyId: signedContext.companyId,
          ghlUserId: signedContext.userId,
          ghlEmail: signedContext.email,
          parentOrigin,
          dealflowUserId: null,
        }),
        createGhlEmbedSessionMarker({
          domain: hostContext.domain,
          partnerId,
          parentOrigin,
          dealflowUserId: null,
        }),
      ]);
      if (!handoffToken || !capability || !sessionMarker) {
        return deny("ghl_embed_handoff_unavailable", 503);
      }
      const response = NextResponse.json({
        status: "storage_check_required",
        handoffToken,
      });
      response.cookies.set(
        GHL_EMBED_CAPABILITY_COOKIE,
        capability,
        getGhlEmbedCapabilityCookieOptions(requestUrl.protocol === "https:", "preauth"),
      );
      response.cookies.set(
        GHL_EMBED_SESSION_COOKIE,
        sessionMarker,
        getGhlEmbedSessionCookieOptions(requestUrl.protocol === "https:"),
      );
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }

    const handoff = await verifyGhlEmbedAuthHandoff(body.handoffToken, {
      expectedHost: hostContext.domain,
    });
    if (
      !handoff ||
      handoff.payloadDigest !== payloadDigest ||
      handoff.partnerId !== partnerId ||
      handoff.organizationId !== organizationId ||
      handoff.locationId !== signedContext.activeLocation ||
      handoff.companyId !== signedContext.companyId ||
      handoff.ghlUserId !== signedContext.userId ||
      handoff.dealflowUserId !== boundDealflowUserId ||
      handoff.parentOrigin !== parentOrigin
    ) {
      return deny("ghl_embed_handoff_invalid");
    }

    const consumeResult = await (admin as any).rpc("consume_ghl_embed_auth_exchange_v1", {
      p_exchange_id: handoff.receiptId,
      p_payload_digest: payloadDigest,
      p_dealflow_user_id: boundDealflowUserId,
    });
    if (consumeResult.error || consumeResult.data !== true) {
      return deny("ghl_embed_handoff_consumed_or_expired");
    }

    const linkResult = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: signedContext.email,
    });
    const tokenHash = linkResult.data?.properties?.hashed_token;
    const supabaseEnv = getSupabaseEnv();
    if (linkResult.error || !tokenHash || !supabaseEnv) {
      return deny("ghl_embed_session_link_failed", 503);
    }
    const [capability, sessionMarker] = await Promise.all([
      createGhlEmbedCapability({
        stage: "authenticated",
        partnerId,
        domain: hostContext.domain,
        organizationId,
        locationId: signedContext.activeLocation,
        companyId: signedContext.companyId,
        ghlUserId: signedContext.userId,
        ghlEmail: signedContext.email,
        parentOrigin,
        dealflowUserId: boundDealflowUserId,
      }),
      createGhlEmbedSessionMarker({
        domain: hostContext.domain,
        partnerId,
        parentOrigin,
        dealflowUserId: boundDealflowUserId,
      }),
    ]);
    if (!capability || !sessionMarker) return deny("ghl_embed_capability_unavailable", 503);

    const response = NextResponse.json({ status: "ready", nextPath: "/dashboard" });
    const responseClient = await createServerSupabase(response);
    if (!responseClient) return deny("ghl_embed_session_authority_unavailable", 503);
    const verifiedSession = await responseClient.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (
      verifiedSession.error ||
      verifiedSession.data.user?.id !== boundDealflowUserId ||
      normalized(verifiedSession.data.user?.email) !== signedContext.email ||
      !verifiedSession.data.session?.access_token ||
      !verifiedSession.data.session.refresh_token
    ) {
      return deny("ghl_embed_session_verification_failed", 503);
    }
    const setSessionResult = await responseClient.auth.setSession({
      access_token: verifiedSession.data.session.access_token,
      refresh_token: verifiedSession.data.session.refresh_token,
    });
    if (setSessionResult.error || setSessionResult.data.user?.id !== boundDealflowUserId) {
      return deny("ghl_embed_session_cookie_failed", 503);
    }
    response.cookies.set(
      GHL_EMBED_CAPABILITY_COOKIE,
      capability,
      getGhlEmbedCapabilityCookieOptions(requestUrl.protocol === "https:", "authenticated"),
    );
    response.cookies.set(
      GHL_EMBED_SESSION_COOKIE,
      sessionMarker,
      getGhlEmbedSessionCookieOptions(requestUrl.protocol === "https:"),
    );
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch {
    return deny("ghl_embed_exchange_failed", 400);
  }
}
