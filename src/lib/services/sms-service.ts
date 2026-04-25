import { createHmac } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { getTwilioEnv } from "@/lib/env";

export type IncomingSmsPayload = {
  from: string;
  to: string;
  body: string;
  messageSid: string | null;
};

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (hasPlus) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return `+${digits}`;
}

export async function sendSMS(to: string, message: string) {
  const env = getTwilioEnv();

  if (!env) {
    throw new ApiError(503, "Twilio is not configured.", "twilio_config_missing");
  }

  const params = new URLSearchParams();
  params.set("To", normalizePhone(to));
  params.set("From", env.phoneNumber);
  params.set("Body", message);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.accountSid}:${env.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | { sid?: string; message?: string }
    | null;

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.message ?? "SMS send failed.",
      "sms_send_failed",
    );
  }

  return {
    sid: data?.sid ?? null,
  };
}

export async function handleIncomingSMS(payload: FormData | URLSearchParams): Promise<IncomingSmsPayload> {
  const getValue = (key: string) => {
    const value = payload.get(key);
    return typeof value === "string" ? value : "";
  };

  const from = normalizePhone(getValue("From"));
  const to = normalizePhone(getValue("To"));
  const body = getValue("Body").trim();
  const messageSid = getValue("MessageSid") || null;

  if (!from || !body) {
    throw new ApiError(400, "Incoming SMS payload is incomplete.", "invalid_sms_payload");
  }

  return {
    from,
    to,
    body,
    messageSid,
  };
}

export function validateTwilioWebhookSignature(params: {
  url: string;
  signature: string | null;
  formData: FormData;
}) {
  const env = getTwilioEnv();

  if (!env || !params.signature) {
    return false;
  }

  const values = Array.from(params.formData.entries())
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([a], [b]) => a.localeCompare(b));

  const base = values.reduce((acc, [key, value]) => `${acc}${key}${value}`, params.url);
  const expected = createHmac("sha1", env.authToken).update(base).digest("base64");

  return expected === params.signature;
}

export { normalizePhone };
