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
  "plan",
  "runtime",
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

function hasInstantFormDestination(value: unknown, depth = 0): boolean {
  const record = asRecord(value);
  if (!record || depth > 5) {
    return false;
  }

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeKey(rawKey);
    const normalizedValue = normalizeValue(rawValue);

    if (DESTINATION_KEYS.has(key) && INSTANT_FORM_VALUES.has(normalizedValue)) {
      return true;
    }

    if (NESTED_KEYS.has(key) && hasInstantFormDestination(rawValue, depth + 1)) {
      return true;
    }
  }

  return false;
}

export function isInstantFormCampaign(campaignPlanOrPayload: unknown): boolean {
  return hasInstantFormDestination(campaignPlanOrPayload);
}
