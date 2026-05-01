import { z } from "zod";
import {
  apiSuccess,
  handleApiError,
  parseJsonBody,
  ApiError,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimitBuckets,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";
import { debugLog } from "@/lib/debug";
import {
  getMetaCookiesFromHeader,
} from "@/lib/integrations/meta/conversions";
import { logError, logOperationalEvent } from "@/lib/logging";
import {
  createPublicLeadAndStartConversation,
  queueFailedPublicLeadCapture,
} from "@/lib/services/lead-handler-service";
import { queueLeadSideEffectsJob } from "@/lib/services/system-job-service";

const leadCaptureSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    email: z.string().trim().email("Enter a valid email address.").optional(),
    phone: z.string().trim().min(6, "Enter a valid phone number.").optional(),
    campaign_id: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    funnel_id: z.string().trim().min(1).optional(),
    stage: z.enum(["onboarding", "generated", "launched"]).optional(),
    sms_consent: z.boolean().optional(),
    smsConsent: z.boolean().optional(),
    sms_consent_copy: z.string().trim().min(1).max(1000).optional(),
    website: z.string().max(500).optional(),
    company_website: z.string().max(500).optional(),
    hp: z.string().max(500).optional(),
    utm_source: z.string().trim().max(200).optional(),
    utm_medium: z.string().trim().max(200).optional(),
    utm_campaign: z.string().trim().max(200).optional(),
    ad_id: z.string().trim().max(200).optional(),
    landing_page_url: z.string().trim().url().max(2000).optional(),
    form_started_at: z.union([z.number(), z.string()]).optional(),
    formStartedAt: z.union([z.number(), z.string()]).optional(),
    turnstile_token: z.string().trim().min(1).max(4096).optional(),
    turnstileToken: z.string().trim().min(1).max(4096).optional(),
    "cf-turnstile-response": z.string().trim().min(1).max(4096).optional(),
    load_test: z.boolean().optional(),
    loadTest: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.email?.trim() && !value.phone?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Either an email or phone number is required.",
      });
    }

    if (!value.campaign_id?.trim() && !value.campaignId?.trim() && !value.funnel_id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["campaign_id"],
        message: "campaignId or funnel_id is required.",
      });
    }

    if (value.phone?.trim() && value.sms_consent !== true && value.smsConsent !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sms_consent"],
        message: "SMS consent is required when a phone number is submitted.",
      });
    }

    if (value.website?.trim() || value.company_website?.trim() || value.hp?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website"],
        message: "Lead submission was rejected.",
      });
    }
  });

function getTurnstileSecret() {
  return process.env.TURNSTILE_SECRET_KEY?.trim() || null;
}

function canBypassTurnstileSecret() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_PUBLIC_LEAD_NO_TURNSTILE === "true";
}

function timingSafeTextEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  let mismatch = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= candidate.charCodeAt(index % candidate.length) ^ expected.charCodeAt(index % expected.length);
  }

  return mismatch === 0;
}

function getLoadTestBypass(params: {
  req: Request;
  requestId: string;
  campaignScope: string;
  name: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  requested: boolean;
}) {
  if (!params.requested) {
    return false;
  }

  const enabled = process.env.LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED === "true";
  const expectedSecret = process.env.LEAD_CAPTURE_LOAD_TEST_SECRET?.trim() ?? "";
  const providedSecret = params.req.headers.get("x-dealflow-load-test-secret")?.trim() ?? null;
  const email = params.email?.trim().toLowerCase() ?? "";
  const phone = params.phone?.trim() ?? "";
  const validFakeLead =
    params.name.trim().startsWith("Load Test") &&
    email.endsWith("@example.com") &&
    phone.length === 0;

  if (
    !enabled ||
    expectedSecret.length < 32 ||
    !timingSafeTextEquals(providedSecret, expectedSecret) ||
    !validFakeLead
  ) {
    logOperationalEvent("lead_capture.load_test_bypass_rejected", {
      requestId: params.requestId,
      campaignScope: getHashedRateLimitIdentifier(params.campaignScope),
      enabled,
      hasSecret: Boolean(providedSecret),
      validFakeLead,
    });
    throw new ApiError(403, "Lead submission was rejected.", "lead_load_test_rejected");
  }

  logOperationalEvent("lead_capture.load_test_bypass_allowed", {
    requestId: params.requestId,
    campaignScope: getHashedRateLimitIdentifier(params.campaignScope),
  });

  return true;
}

async function verifyTurnstileToken(params: {
  token?: string | null;
  ip?: string | null;
  requestId: string;
}) {
  const secret = getTurnstileSecret();

  if (!secret) {
    if (!canBypassTurnstileSecret()) {
      logOperationalEvent("lead_capture.turnstile_rejected", {
        requestId: params.requestId,
        reason: "turnstile_secret_missing",
      });
      throw new ApiError(503, "Lead verification is temporarily unavailable.", "turnstile_unconfigured");
    }

    return;
  }

  const token = params.token?.trim();

  if (!token) {
    logOperationalEvent("lead_capture.turnstile_rejected", {
      requestId: params.requestId,
      reason: "missing_token",
    });
    throw new ApiError(400, "Lead submission was rejected.", "turnstile_required");
  }

  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);

  if (params.ip) {
    formData.set("remoteip", params.ip);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    logOperationalEvent("lead_capture.turnstile_rejected", {
      requestId: params.requestId,
      reason: "siteverify_unavailable",
      status: response.status,
    });
    throw new ApiError(503, "Lead verification is temporarily unavailable.", "turnstile_unavailable");
  }

  const result = (await response.json().catch(() => null)) as
    | { success?: boolean; "error-codes"?: string[] }
    | null;

  if (!result?.success) {
    logOperationalEvent("lead_capture.turnstile_rejected", {
      requestId: params.requestId,
      reason: "invalid_token",
      errors: result?.["error-codes"] ?? [],
    });
    throw new ApiError(400, "Lead submission was rejected.", "turnstile_failed");
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let capturedPayload:
    | {
        campaignId: string;
        funnelId: string | null;
        name: string;
        email: string | null;
        phone: string | null;
        source: string;
        notes: string;
        stage: string;
        smsConsent: boolean;
        smsConsentCopy: string;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        adId: string | null;
        landingPageUrl: string | null;
      }
    | null = null;

  try {
    const requestIp = getRequestIp(req);
    const cookieHeader = req.headers.get("cookie");
    const userAgent = req.headers.get("user-agent");
    const ipHash = getHashedRateLimitIdentifier(requestIp);

    const payload = await parseJsonBody(req, leadCaptureSchema, {
      maxBytes: 16 * 1024,
      code: "lead_capture_body_too_large",
    });

    const campaignId = payload.campaign_id?.trim() || payload.campaignId?.trim() || "";
    const funnelId = payload.funnel_id?.trim() || "";
    const campaignScope = campaignId || funnelId || "unknown";
    const isLoadTestBypass = getLoadTestBypass({
      req,
      requestId,
      campaignScope,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      requested: payload.load_test === true || payload.loadTest === true,
    });
    if (!isLoadTestBypass) {
      await verifyTurnstileToken({
        token:
          payload.turnstile_token ??
          payload.turnstileToken ??
          payload["cf-turnstile-response"] ??
          null,
        ip: requestIp,
        requestId,
      });
    }
    const contactHash = getHashedRateLimitIdentifier(payload.email?.trim() || payload.phone?.trim() || payload.name);
    const startedAtRaw = payload.form_started_at ?? payload.formStartedAt;
    const startedAt =
      typeof startedAtRaw === "number"
        ? startedAtRaw
        : typeof startedAtRaw === "string"
          ? Number.parseInt(startedAtRaw, 10)
          : null;

    if (startedAt && Number.isFinite(startedAt) && Date.now() - startedAt < 800) {
      logOperationalEvent("lead_capture.spam_rejected", {
        requestId,
        reason: "form_timing",
        campaignScope: getHashedRateLimitIdentifier(campaignScope),
      });
      throw new ApiError(400, "Lead submission was rejected.", "lead_spam_rejected");
    }

    if (!isLoadTestBypass) {
      const rateLimit = await consumeRateLimitBuckets([
        {
          key: getRateLimitKey(req, "lead-capture:ip", ipHash),
          limit: 30,
          windowMs: 60_000,
        },
        {
          key: getRateLimitKey(req, "lead-capture:campaign-ip", `${campaignScope}:${ipHash}`),
          limit: 8,
          windowMs: 60_000,
        },
        {
          key: getRateLimitKey(req, "lead-capture:campaign-global", campaignScope),
          limit: 120,
          windowMs: 60_000,
        },
        {
          key: getRateLimitKey(req, "lead-capture:contact", `${campaignScope}:${contactHash}`),
          limit: 3,
          windowMs: 5 * 60_000,
        },
        ...(funnelId
          ? [
              {
                key: getRateLimitKey(req, "lead-capture:funnel", `${funnelId}:${ipHash}`),
                limit: 12,
                windowMs: 60_000,
              },
            ]
          : []),
      ]);

      if (rateLimit && !rateLimit.allowed) {
        logOperationalEvent("rate_limit.blocked", {
          requestId,
          route: "lead-capture",
          bucket: "layered",
          campaignScope: getHashedRateLimitIdentifier(campaignScope),
        });
        return buildRateLimitResponse(rateLimit.resetAt);
      }
    }

    if (!campaignId && !payload.funnel_id?.trim()) {
      throw new ApiError(400, "campaignId or funnel_id is required.", "validation_error");
    }

    const normalizedStage = payload.stage?.trim() ?? "generated";
    const phone = payload.phone?.trim() || null;
    const email = payload.email?.trim() || null;
    const smsConsent = payload.sms_consent === true || payload.smsConsent === true;
    const smsConsentCopy =
      payload.sms_consent_copy?.trim() ||
      "By checking this box, I agree to receive SMS messages from DealFlow OS and/or the business operating this campaign about my inquiry, follow-ups, and appointment coordination. Message and data rates may apply. Message frequency may vary. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";
    const isDevelopment = process.env.NODE_ENV !== "production";
    const source = isLoadTestBypass ? "lead_capture_load_test" : `lead_capture_${normalizedStage}`;
    const notes = isLoadTestBypass
      ? `Captured from internal lead-write load proof at stage: ${normalizedStage}.`
      : `Captured from lead capture flow at stage: ${normalizedStage}.`;

    capturedPayload = {
      campaignId,
      funnelId: payload.funnel_id?.trim() || null,
      name: payload.name,
      email,
      phone,
      source,
      notes,
      stage: normalizedStage,
      smsConsent,
      smsConsentCopy,
      utmSource: payload.utm_source?.trim() || null,
      utmMedium: payload.utm_medium?.trim() || null,
      utmCampaign: payload.utm_campaign?.trim() || null,
      adId: payload.ad_id?.trim() || null,
      landingPageUrl: payload.landing_page_url || req.headers.get("referer"),
    };

    const lead = await createPublicLeadAndStartConversation({
      campaign_id: campaignId,
      funnel_id: payload.funnel_id,
      name: payload.name,
      email,
      phone: phone ?? "",
      source,
      notes,
      sms_consent: smsConsent,
      sms_consent_copy: smsConsentCopy,
      consent_source: "public_lead_capture_form",
      consent_url: req.headers.get("referer"),
      utm_source: payload.utm_source,
      utm_medium: payload.utm_medium,
      utm_campaign: payload.utm_campaign,
      ad_id: payload.ad_id,
      landing_page_url: payload.landing_page_url || req.headers.get("referer"),
      skip_recent_duplicate_fallback: isLoadTestBypass,
      skip_lead_loop_verification: isLoadTestBypass,
    });

    logOperationalEvent("lead_capture.succeeded", {
      requestId,
      campaignId: lead.campaign_id,
      organizationId: lead.organization_id,
      leadId: lead.id,
      source: lead.source ?? source,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
    });

    if (!lead.campaign_id || !lead.organization_id) {
      throw new ApiError(
        500,
        "Lead capture could not be linked to the campaign workspace.",
        "lead_context_missing",
      );
    }

    const landingPageUrl = payload.landing_page_url || req.headers.get("referer");
    const metaCookies = getMetaCookiesFromHeader(cookieHeader);
    const notificationLead = {
      ...lead,
      phone_raw: phone,
      phone_e164: null,
      lead_type: null,
      utm_source: payload.utm_source,
      utm_medium: payload.utm_medium,
      utm_campaign: payload.utm_campaign,
      ad_id: payload.ad_id,
      landing_page_url: landingPageUrl,
    };

    const sideEffectJob = await queueLeadSideEffectsJob({
      organizationId: lead.organization_id,
      userId: lead.user_id,
      campaignId: lead.campaign_id,
      payload: {
        requestId,
        lead: notificationLead,
        metaConversion: {
          organizationId: lead.organization_id,
          leadId: lead.id,
          campaignId: lead.campaign_id,
          eventSourceUrl: landingPageUrl,
          eventTime: lead.created_at,
          name: lead.name,
          email,
          phone,
          clientIp: requestIp,
          clientUserAgent: userAgent,
          fbp: metaCookies.fbp,
          fbc: metaCookies.fbc,
        },
      },
    });

    logOperationalEvent("lead_capture.side_effects_queued", {
      requestId,
      leadId: lead.id,
      organizationId: lead.organization_id,
      jobId: sideEffectJob.id,
      loadTest: isLoadTestBypass,
    });

    if (isDevelopment) {
      debugLog("lead-capture", {
        leadId: lead.id,
        campaignId: lead.campaign_id,
        organizationId: lead.organization_id,
        source: lead.source ?? source,
        timestamp: lead.created_at,
      });
    }

    return apiSuccess({
      ok: true,
      success: true,
      lead_id: lead.id,
      id: lead.id,
      requestId,
      ...(isDevelopment
        ? {
            debug: {
              requestId,
              leadId: lead.id,
              campaignId: lead.campaign_id,
              organizationId: lead.organization_id,
              source: lead.source ?? source,
              timestamp: lead.created_at,
              dashboardScope: {
                campaignId: lead.campaign_id,
                organizationId: lead.organization_id,
              },
            },
          }
        : {}),
    });
  } catch (error) {
    const isServerFailure =
      error instanceof ApiError ? error.status >= 500 : true;

    if (capturedPayload && isServerFailure) {
      const queuedJob = await queueFailedPublicLeadCapture({
        requestId,
        campaign_id: capturedPayload.campaignId,
        funnel_id: capturedPayload.funnelId,
        name: capturedPayload.name,
        email: capturedPayload.email,
        phone: capturedPayload.phone,
        source: capturedPayload.source,
        notes: capturedPayload.notes,
        stage: capturedPayload.stage,
        failureReason: error instanceof Error ? error.message : "Lead capture failed.",
        smsConsent: capturedPayload.smsConsent,
        smsConsentCopy: capturedPayload.smsConsentCopy,
        consentUrl: capturedPayload.landingPageUrl,
        utmSource: capturedPayload.utmSource,
        utmMedium: capturedPayload.utmMedium,
        utmCampaign: capturedPayload.utmCampaign,
        adId: capturedPayload.adId,
        landingPageUrl: capturedPayload.landingPageUrl,
      });

      if (queuedJob) {
        return apiSuccess(
          {
            ok: false,
            queued: true,
            requestId,
            retryJobId: queuedJob.id,
            message:
              "Lead capture is temporarily delayed. The submission was saved for retry and the team can recover it.",
          },
          { status: 202 },
        );
      }
    }

    logError("Lead capture failed", {
      requestId,
      code: error instanceof ApiError ? error.code : "lead_capture_unknown_failure",
      message: error instanceof Error ? error.message : "Unknown lead capture failure",
      campaignId: capturedPayload?.campaignId ?? null,
      queuedFallback: false,
    });

    return handleApiError(error, "Lead capture");
  }
}
