import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody, ApiError } from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { recordLeadTrackingEvent } from "@/lib/services/lead-tracking-service";

const browserPixelSchema = z.object({
  lead_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  pixel_id: z.string().trim().min(1).max(100).optional(),
  event_id: z.string().trim().min(1).max(200).optional(),
});

async function handleBrowserPixelAttempt(request: Request) {
  const requestIp = getRequestIp(request);
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "lead-tracking:browser-pixel", getHashedRateLimitIdentifier(requestIp)),
    limit: 120,
    windowMs: 60_000,
  });

  if (rateLimit && !rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit.resetAt);
  }

  const payload = await parseJsonBody(request, browserPixelSchema, {
    maxBytes: 2 * 1024,
    code: "browser_pixel_body_too_large",
  });
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data: lead, error } = await (admin as any)
    .from("leads")
    .select("id,organization_id,campaign_id")
    .eq("id", payload.lead_id)
    .eq("campaign_id", payload.campaign_id)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_tracking_lead_lookup_failed");
  }

  if (!lead?.organization_id || !lead?.campaign_id) {
    throw new ApiError(404, "Lead tracking target was not found.", "lead_tracking_target_missing");
  }

  await recordLeadTrackingEvent({
    organizationId: lead.organization_id,
    campaignId: lead.campaign_id,
    leadId: lead.id,
    eventType: "browser_pixel_attempted",
    status: "recorded",
    source: "public_funnel_browser",
    eventId: payload.event_id ?? payload.lead_id,
    pixelId: payload.pixel_id ?? null,
    metadata: {
      userAgentPresent: Boolean(request.headers.get("user-agent")),
    },
  });

  return apiSuccess({ ok: true });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    return await handleBrowserPixelAttempt(request);
  } catch (error) {
    return handleApiError(error, "Browser pixel tracking");
  }
}
