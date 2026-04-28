import { z } from "zod";
import {
  apiSuccess,
  handleApiError,
  parseJsonBody,
  ApiError,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { debugLog } from "@/lib/debug";
import { logError, logOperationalEvent } from "@/lib/logging";
import {
  createPublicLeadAndStartConversation,
  queueFailedPublicLeadCapture,
} from "@/lib/services/lead-handler-service";

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
  });

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
      }
    | null = null;

  try {
    const payload = await parseJsonBody(req, leadCaptureSchema);
    const campaignId = payload.campaign_id?.trim() || payload.campaignId?.trim() || "";
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(req, "lead-capture", campaignId || null),
      limit: 8,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
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
      "By checking this box and submitting, I agree to receive automated and manual SMS messages about this request from DealFlow OS and its customer. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";
    const isDevelopment = process.env.NODE_ENV !== "production";
    const source = `lead_capture_${normalizedStage}`;
    const notes = `Captured from lead capture flow at stage: ${normalizedStage}.`;

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
