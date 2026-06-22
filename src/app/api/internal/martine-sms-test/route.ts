import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TARGET_PHONE_E164 = "+15146635045";
const TARGET_PHONE_DISPLAY = "514-663-5045";
const PROOF_GATE = "MARTINE_SMS_TEST_ENABLED";

function assertProofEnabled() {
  if (process.env[PROOF_GATE] !== "true") {
    throw new ApiError(404, "Martine SMS test route is not enabled.", "martine_sms_test_disabled");
  }
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new ApiError(503, "Twilio is not configured.", "twilio_not_configured");
  }

  return { accountSid, authToken, messagingServiceSid };
}

async function postTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  to: string;
  body: string;
}) {
  const body = new URLSearchParams({
    To: params.to,
    Body: params.body,
    MessagingServiceSid: params.messagingServiceSid,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const data = (await response.json().catch(() => null)) as {
    sid?: string;
    status?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    throw new ApiError(502, data?.message || `Twilio returned ${response.status}`, "twilio_send_failed");
  }

  return {
    sid: data?.sid ?? null,
    status: data?.status ?? null,
  };
}

function maskSid(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertProofEnabled();

    const message = "DealFlow test: Martine lead alert phone is now connected. No action needed.";
    const config = getTwilioConfig();
    const result = await postTwilioMessage({
      ...config,
      to: TARGET_PHONE_E164,
      body: message,
    });

    return apiSuccess(
      {
        success: true,
        proof: "martine_sms_alert_phone_test",
        targetPhone: TARGET_PHONE_DISPLAY,
        targetPhoneE164: TARGET_PHONE_E164,
        twilioStatus: result.status,
        providerMessageIdMasked: maskSid(result.sid),
        safety: {
          internalBearerRequired: true,
          envGate: PROOF_GATE,
          createdLead: false,
          createdSystemJob: false,
          mutatedMeta: false,
          mutatedGhl: false,
          createdStripeCharge: false,
          ranProviderGeneration: false,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Martine SMS test route");
  }
}
