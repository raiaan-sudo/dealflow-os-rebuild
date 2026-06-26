type JsonRecord = Record<string, unknown>;

const INSTANT_FORM_VALUES = new Set([
  "facebook_instant_form",
  "facebook_lead_form",
  "instant_form",
  "instant_forms",
  "lead_ad_form",
  "lead_ads",
  "lead_form",
  "meta_instant_form",
  "meta_lead_form",
  "native_lead_form",
  "on_facebook",
  "volume_lead_form",
]);

const QUALITY_FUNNEL_VALUES = new Set([
  "deep_qualification",
  "funnel",
  "landing_page",
  "landing_page_book_call",
  "landing_page_form",
  "landing_page_survey",
  "public_funnel",
  "quality_funnel",
  "website",
  "website_funnel",
]);

const DESTINATION_KEYS = new Set([
  "campaign_destination",
  "campaigndestination",
  "conversion_location",
  "conversionlocation",
  "destination",
  "destination_type",
  "destinationtype",
  "form_type",
  "formtype",
  "lead_capture_mode",
  "leadcapturemode",
  "lead_destination",
  "leaddestination",
  "meta_destination",
  "metadestination",
  "traffic_destination",
  "trafficdestination",
]);

const NESTED_KEYS = new Set([
  "campaign_payload",
  "campaignpayload",
  "funnel",
  "launch",
  "meta_ready_payload",
  "metareadypayload",
  "metadata",
  "plan",
  "runtime",
  "strategy",
]);

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizeKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function normalizeValue(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    : "";
}

export function normalizeLeadCaptureMode(value: unknown): string | null {
  const normalizedValue = normalizeValue(value);

  if (INSTANT_FORM_VALUES.has(normalizedValue)) {
    return "volume_lead_form";
  }

  if (QUALITY_FUNNEL_VALUES.has(normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

export function getLeadCaptureModeFromRecord(value: unknown, depth = 0): string | null {
  const record = asRecord(value);
  if (!record || depth > 5) {
    return null;
  }

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeKey(rawKey);

    if (DESTINATION_KEYS.has(key)) {
      const normalizedMode = normalizeLeadCaptureMode(rawValue);

      if (normalizedMode) {
        return normalizedMode;
      }
    }

    if (NESTED_KEYS.has(key)) {
      const nestedMode = getLeadCaptureModeFromRecord(rawValue, depth + 1);

      if (nestedMode) {
        return nestedMode;
      }
    }
  }

  return null;
}

function hasInstantFormDestination(value: unknown): boolean {
  const mode = getLeadCaptureModeFromRecord(value);
  return Boolean(mode && INSTANT_FORM_VALUES.has(mode));
}

export function isInstantFormCampaign(campaignPlanOrPayload: unknown): boolean {
  return hasInstantFormDestination(campaignPlanOrPayload);
}
