import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/env";
import { resolveGhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel/lifecycle-gate";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  createGhlMarketplaceConnectBinding,
  GHL_MARKETPLACE_STATE_COOKIE,
} from "@/lib/services/ghl-marketplace-runtime-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedContext();
    const url = new URL(request.url);
    const binding = await createGhlMarketplaceConnectBinding({
      userId: auth.userId,
      organizationId: auth.organizationId,
      providerEnvironment: resolveGhlLifecycleEnvironment(),
      installScope: url.searchParams.get("scope") === "company" ? "company" : "location",
      returnPath: url.searchParams.get("returnTo"),
      reconnectRequested: url.searchParams.get("reconnect") === "true",
    });
    const cookieStore = await cookies();
    cookieStore.set(GHL_MARKETPLACE_STATE_COOKIE, binding.state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/ghl/marketplace",
      maxAge: 10 * 60,
    });
    return NextResponse.redirect(binding.installUrl);
  } catch {
    const fallback = new URL("/settings", getPublicAppUrl());
    fallback.searchParams.set("ghl_error", "connection_start_failed");
    return NextResponse.redirect(fallback);
  }
}
