import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/env";
import { resolveGhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel/lifecycle-gate";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  completeGhlMarketplaceOAuthCallback,
  GHL_MARKETPLACE_STATE_COOKIE,
} from "@/lib/services/ghl-marketplace-runtime-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Provider-facing white-label alias for the HighLevel OAuth callback. The
 * legacy /api/integrations/ghl/marketplace/callback route remains available
 * for already-configured installations, but new Marketplace apps must use a
 * neutral URL because HighLevel rejects white-label redirect URLs containing
 * HighLevel/GHL branding references.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const fallback = new URL("/settings", getPublicAppUrl());
  try {
    const auth = await getAuthenticatedContext();
    const url = new URL(request.url);
    const state = cookieStore.get(GHL_MARKETPLACE_STATE_COOKIE)?.value ?? "";
    const code = url.searchParams.get("code")?.trim() ?? "";
    const result = await completeGhlMarketplaceOAuthCallback({
      state,
      code,
      userId: auth.userId,
      organizationId: auth.organizationId,
      providerEnvironment: resolveGhlLifecycleEnvironment(),
    });
    cookieStore.delete(GHL_MARKETPLACE_STATE_COOKIE);
    const destination = new URL(result.returnPath, getPublicAppUrl());
    destination.searchParams.set("ghl_connected", "true");
    return NextResponse.redirect(destination);
  } catch {
    cookieStore.delete(GHL_MARKETPLACE_STATE_COOKIE);
    fallback.searchParams.set("ghl_error", "connection_callback_failed");
    return NextResponse.redirect(fallback);
  }
}
