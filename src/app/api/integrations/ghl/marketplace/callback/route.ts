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

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const fallback = new URL("/settings", getPublicAppUrl());
  try {
    const auth = await getAuthenticatedContext();
    const url = new URL(request.url);
    const state = cookieStore.get(GHL_MARKETPLACE_STATE_COOKIE)?.value ?? "";
    const code = url.searchParams.get("code")?.trim() ?? "";
    // HighLevel's Marketplace callback contract currently documents the code
    // query parameter, not a returned state parameter. The one-time, hash-only
    // state is bound to this authenticated browser through the HttpOnly cookie.
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
