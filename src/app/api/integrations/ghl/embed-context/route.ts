import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";
import { decryptGhlSignedUserContext } from "@/lib/integrations/gohighlevel/signed-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  createGhlEmbedCapability,
  createGhlEmbedSessionMarker,
  getGhlAppSharedSecret,
  getGhlEmbedCapabilityCookieOptions,
  getGhlEmbedSessionCookieOptions,
  GHL_EMBED_BOOTSTRAP_PATH,
  GHL_EMBED_CAPABILITY_COOKIE,
  GHL_EMBED_SESSION_COOKIE,
  resolveAllowedGhlParentOrigin,
  verifyGhlEmbedCapability,
} from "@/lib/white-label/ghl-embed-capability";
import { loadVerifiedPartnerDomainContext } from "@/lib/white-label/verified-partner-domain";
import { isExactVerifiedPartnerRequestOrigin } from "@/lib/white-label/ghl-embed-request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  encryptedData: z.string().min(24).max(32_768),
  parentOrigin: z.string().url().max(512),
}).strict();

function rows(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function deny(code: string, status = 403) {
  return NextResponse.json(
    { error: "The embedded CRM context could not be verified.", code },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const partnerContext = await loadVerifiedPartnerDomainContext(requestUrl.hostname);
    const referer = request.headers.get("referer")?.trim() ?? "";
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
    if (
      !partnerContext ||
      requestUrl.hostname.toLowerCase() !== partnerContext.domain ||
      (!isExplicitNonProductionDeployment() && requestUrl.protocol !== "https:") ||
      !referer ||
      new URL(referer).origin !== requestUrl.origin ||
      (fetchSite && fetchSite !== "same-origin")
    ) {
      return deny("ghl_embed_cookie_probe_invalid");
    }
    const capability = await verifyGhlEmbedCapability(
      request.cookies.get(GHL_EMBED_CAPABILITY_COOKIE)?.value,
      { expectedHost: partnerContext.domain },
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
    const partnerContext = await loadVerifiedPartnerDomainContext(requestUrl.hostname);
    if (
      !partnerContext ||
      !isExactVerifiedPartnerRequestOrigin({
        requestUrl: request.url,
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        fetchSite: request.headers.get("sec-fetch-site"),
        partnerDomain: partnerContext.domain,
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

    const parentOrigin = partnerContext
      ? resolveAllowedGhlParentOrigin({
          candidate: body.parentOrigin,
          partnerHost: partnerContext.domain,
        })
      : null;
    const signedContext = decryptGhlSignedUserContext(body.encryptedData, sharedSecret);
    if (!parentOrigin || !signedContext) {
      return deny("ghl_embed_context_invalid");
    }

    const admin = createAdminClient();
    if (!admin) return deny("ghl_embed_authority_unavailable", 503);
    const allowedEnvironments = isExplicitNonProductionDeployment()
      ? ["sandbox", "test"]
      : ["production"];

    const mappingResult = await (admin as any)
      .from("ghl_location_mappings")
      .select("id,organization_id,partner_id,installation_id,environment,provider_location_id,status")
      .eq("provider_location_id", signedContext.activeLocation)
      .eq("partner_id", partnerContext.partnerId)
      .eq("status", "active")
      .in("environment", allowedEnvironments)
      .limit(2);
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
      (admin as any)
        .from("ghl_workspace_tenants")
        .select("organization_id,partner_id,tenant_kind,status")
        .eq("organization_id", mapping.organization_id)
        .eq("partner_id", partnerContext.partnerId)
        .eq("tenant_kind", "partner_child")
        .eq("status", "active")
        .limit(2),
      (admin as any)
        .from("workspace_ghl_users")
        .select("workspace_id,partner_id,ghl_location_id,ghl_user_id,email,invite_status")
        .eq("workspace_id", mapping.organization_id)
        .eq("partner_id", partnerContext.partnerId)
        .eq("ghl_location_id", signedContext.activeLocation)
        .eq("ghl_user_id", signedContext.userId)
        .ilike("email", signedContext.email)
        .eq("invite_status", "active")
        .limit(2),
    ]);
    const installations = rows(installationResult.data);
    const tenants = rows(tenantResult.data);
    const ghlUsers = rows(ghlUserResult.data);
    const installation = installations[0] as Record<string, unknown> | undefined;
    if (
      installationResult.error ||
      tenantResult.error ||
      ghlUserResult.error ||
      installations.length !== 1 ||
      tenants.length !== 1 ||
      ghlUsers.length !== 1 ||
      installation?.provider_agency_id !== signedContext.companyId ||
      installation?.partner_id !== partnerContext.partnerId
    ) {
      return deny("ghl_embed_tenant_context_mismatch");
    }

    const routeClient = await createRouteHandlerClient();
    const authResult = routeClient ? await routeClient.auth.getUser() : null;
    const dealflowUser = authResult?.data.user ?? null;
    if (authResult?.error) return deny("ghl_embed_dealflow_session_invalid", 401);

    let stage: "preauth" | "authenticated" = "preauth";
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
        dealflowUser.email?.trim().toLowerCase() !== signedContext.email
      ) {
        return deny("ghl_embed_dealflow_membership_mismatch");
      }
      stage = "authenticated";
    }

    const capability = await createGhlEmbedCapability({
      stage,
      partnerId: partnerContext.partnerId,
      domain: partnerContext.domain,
      organizationId: String(mapping.organization_id),
      locationId: signedContext.activeLocation,
      companyId: signedContext.companyId,
      ghlUserId: signedContext.userId,
      ghlEmail: signedContext.email,
      parentOrigin,
      dealflowUserId: dealflowUser?.id ?? null,
    });
    const sessionMarker = await createGhlEmbedSessionMarker({
      domain: partnerContext.domain,
      partnerId: partnerContext.partnerId,
      parentOrigin,
      dealflowUserId: dealflowUser?.id ?? null,
    });
    if (!capability || !sessionMarker) {
      return deny("ghl_embed_capability_unavailable", 503);
    }

    const response = NextResponse.json({
      status: stage === "authenticated" ? "ready" : "authentication_required",
      nextPath: stage === "authenticated"
        ? "/dashboard"
        : `/login?embed=ghl&redirectedFrom=${encodeURIComponent(GHL_EMBED_BOOTSTRAP_PATH)}`,
    });
    response.cookies.set(
      GHL_EMBED_CAPABILITY_COOKIE,
      capability,
      getGhlEmbedCapabilityCookieOptions(requestUrl.protocol === "https:", stage),
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
