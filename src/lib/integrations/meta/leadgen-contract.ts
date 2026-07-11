import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/route";

export const META_LEADGEN_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
export const META_LEADGEN_MAX_EVENTS_PER_DELIVERY = 50;

const providerIdSchema = z.string().trim().regex(/^\d{5,40}$/);

const leadgenValueSchema = z.object({
  leadgen_id: providerIdSchema,
  page_id: providerIdSchema.optional(),
  form_id: providerIdSchema,
  ad_id: providerIdSchema.optional(),
  created_time: z.number().int().nonnegative().optional(),
});

const leadgenWebhookSchema = z.object({
  object: z.literal("page"),
  entry: z
    .array(
      z.object({
        id: providerIdSchema,
        time: z.number().int().nonnegative().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().trim().max(100),
              value: z.unknown(),
            }),
          )
          .max(META_LEADGEN_MAX_EVENTS_PER_DELIVERY),
      }),
    )
    .max(META_LEADGEN_MAX_EVENTS_PER_DELIVERY),
});

const providerLeadSchema = z.object({
  id: providerIdSchema,
  created_time: z.string().trim().max(100).optional(),
  ad_id: providerIdSchema,
  form_id: providerIdSchema,
  field_data: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        values: z.array(z.string().max(2_000)).max(20),
      }),
    )
    .max(100),
});

const providerAdSchema = z.object({
  id: providerIdSchema,
  account_id: providerIdSchema,
});

export type MetaLeadgenWebhookEvent = {
  providerLeadgenId: string;
  providerPageId: string;
  providerFormId: string;
  providerAdId: string | null;
  providerCreatedAt: string | null;
};

export type MetaLeadgenProviderLead = z.infer<typeof providerLeadSchema>;
export type MetaLeadgenProviderAd = z.infer<typeof providerAdSchema>;

export type NormalizedMetaLead = {
  name: string | null;
  email: string | null;
  phone: string | null;
  customAnswers: Record<string, string>;
  providerCreatedAt: string | null;
};

function parseSha256Signature(signatureHeader: string | null) {
  const match = signatureHeader?.trim().match(/^sha256=([0-9a-f]{64})$/i);

  if (!match) {
    return null;
  }

  return Buffer.from(match[1], "hex");
}

export function verifyMetaLeadgenWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}) {
  const expected = createHmac("sha256", params.appSecret).update(params.rawBody, "utf8").digest();
  const supplied = parseSha256Signature(params.signatureHeader);

  return Boolean(
    supplied &&
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected),
  );
}

export function timingSafeMetaVerifyTokenEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

export function parseMetaLeadgenWebhookPayload(rawBody: string): MetaLeadgenWebhookEvent[] {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "Meta leadgen webhook body must be valid JSON.", "meta_leadgen_invalid_json");
  }

  const parsed = leadgenWebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "Meta leadgen webhook payload is malformed.",
      "meta_leadgen_payload_invalid",
    );
  }

  const events: MetaLeadgenWebhookEvent[] = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") {
        continue;
      }

      const value = leadgenValueSchema.safeParse(change.value);
      if (!value.success) {
        throw new ApiError(
          400,
          "Meta leadgen change is malformed.",
          "meta_leadgen_change_invalid",
        );
      }

      const providerPageId = value.data.page_id ?? entry.id;
      if (providerPageId !== entry.id) {
        throw new ApiError(
          400,
          "Meta leadgen Page identity is inconsistent.",
          "meta_leadgen_page_identity_mismatch",
        );
      }

      events.push({
        providerLeadgenId: value.data.leadgen_id,
        providerPageId,
        providerFormId: value.data.form_id,
        providerAdId: value.data.ad_id ?? null,
        providerCreatedAt:
          typeof value.data.created_time === "number"
            ? new Date(value.data.created_time * 1_000).toISOString()
            : null,
      });

      if (events.length > META_LEADGEN_MAX_EVENTS_PER_DELIVERY) {
        throw new ApiError(
          400,
          "Meta leadgen delivery contains too many events.",
          "meta_leadgen_event_limit_exceeded",
        );
      }
    }
  }

  if (events.length === 0) {
    throw new ApiError(
      400,
      "Meta leadgen delivery does not contain a leadgen event.",
      "meta_leadgen_event_missing",
    );
  }

  return events;
}

function normalizeProviderAccountId(value: string) {
  return value.trim().replace(/^act_/, "");
}

export function assertMetaLeadgenProviderIdentity(params: {
  event: MetaLeadgenWebhookEvent;
  expectedAdAccountId: string;
  providerLead: unknown;
  providerAd: unknown;
}) {
  const providerLead = providerLeadSchema.safeParse(params.providerLead);
  const providerAd = providerAdSchema.safeParse(params.providerAd);

  if (!providerLead.success || !providerAd.success) {
    throw new ApiError(
      502,
      "Meta returned an invalid leadgen lookup payload.",
      "meta_leadgen_provider_payload_invalid",
    );
  }

  const eventAdId = params.event.providerAdId;
  const expectedAccountId = normalizeProviderAccountId(params.expectedAdAccountId);
  const actualAccountId = normalizeProviderAccountId(providerAd.data.account_id);

  if (
    providerLead.data.id !== params.event.providerLeadgenId ||
    providerLead.data.form_id !== params.event.providerFormId ||
    providerAd.data.id !== providerLead.data.ad_id ||
    (eventAdId !== null && eventAdId !== providerLead.data.ad_id) ||
    expectedAccountId !== actualAccountId
  ) {
    throw new ApiError(
      409,
      "Meta leadgen provider identity does not match the configured tenant route.",
      "meta_leadgen_provider_identity_mismatch",
    );
  }

  return {
    providerLead: providerLead.data,
    providerAd: providerAd.data,
    normalizedAdAccountId: actualAccountId,
  };
}

function normalizeFieldName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function cleanFieldValue(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function normalizeMetaLeadgenProviderLead(
  providerLeadInput: unknown,
): NormalizedMetaLead {
  const parsed = providerLeadSchema.safeParse(providerLeadInput);
  if (!parsed.success) {
    throw new ApiError(
      502,
      "Meta returned an invalid leadgen lookup payload.",
      "meta_leadgen_provider_payload_invalid",
    );
  }

  const fields = new Map<string, string>();
  for (const field of parsed.data.field_data) {
    const name = normalizeFieldName(field.name);
    const value = cleanFieldValue(field.values[0], 500);
    if (name && value && !fields.has(name)) {
      fields.set(name, value);
    }
  }

  const firstName = cleanFieldValue(fields.get("first_name"), 120);
  const lastName = cleanFieldValue(fields.get("last_name"), 120);
  const fullName =
    cleanFieldValue(fields.get("full_name") ?? fields.get("name"), 240) ??
    cleanFieldValue([firstName, lastName].filter(Boolean).join(" "), 240);
  const rawEmail = cleanFieldValue(fields.get("email"), 320)?.toLowerCase() ?? null;
  const email = rawEmail && z.string().email().safeParse(rawEmail).success ? rawEmail : null;
  const phone = cleanFieldValue(
    fields.get("phone_number") ?? fields.get("phone") ?? fields.get("mobile_phone"),
    64,
  );

  if (!email && !phone) {
    throw new ApiError(
      422,
      "Meta leadgen payload does not contain a usable email address or phone number.",
      "meta_leadgen_contact_missing",
    );
  }

  const reserved = new Set([
    "first_name",
    "last_name",
    "full_name",
    "name",
    "email",
    "phone_number",
    "phone",
    "mobile_phone",
  ]);
  const customAnswers: Record<string, string> = {};

  for (const [name, value] of fields) {
    if (reserved.has(name) || Object.keys(customAnswers).length >= 20) {
      continue;
    }
    customAnswers[name] = value.slice(0, 500);
  }

  const providerCreatedAtMs = parsed.data.created_time
    ? Date.parse(parsed.data.created_time)
    : Number.NaN;

  return {
    name: fullName,
    email,
    phone,
    customAnswers,
    providerCreatedAt: Number.isFinite(providerCreatedAtMs)
      ? new Date(providerCreatedAtMs).toISOString()
      : null,
  };
}
