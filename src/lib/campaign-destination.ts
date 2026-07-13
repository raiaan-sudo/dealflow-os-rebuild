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

const DEALFLOW_WEBSITE_CAPTURE_VALUES = new Set([
  "deep_qualification",
  "quality_funnel",
  "volume_lead_form",
  "website",
  "website_funnel",
]);

const CAPTURE_EXPERIENCE_KEYS = new Set([
  "capture_experience",
  "captureexperience",
  "lead_capture_mode",
  "leadcapturemode",
]);

const EXPLICIT_AD_DESTINATION_KEYS = new Set([
  "ad_destination",
  "addestination",
  "campaign_destination",
  "campaigndestination",
  "conversion_location",
  "conversionlocation",
  "destination_type",
  "destinationtype",
  "meta_destination",
  "metadestination",
  "traffic_destination",
  "trafficdestination",
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

function findNormalizedValueForKeys(
  value: unknown,
  keys: Set<string>,
  depth = 0,
): string | null {
  const record = asRecord(value);
  if (!record || depth > 5) {
    return null;
  }

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeKey(rawKey);
    if (keys.has(key)) {
      const normalizedValue = normalizeValue(rawValue);
      if (normalizedValue) {
        return normalizedValue;
      }
    }
  }

  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (NESTED_KEYS.has(normalizeKey(rawKey))) {
      const nestedValue = findNormalizedValueForKeys(rawValue, keys, depth + 1);
      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return null;
}

export type CampaignCaptureExperience = "dealflow_website" | "meta_instant_form";
export type CampaignAdDestination = "website" | "meta_instant_form";

export type CampaignDestinationContract = {
  captureExperience: CampaignCaptureExperience;
  adDestination: CampaignAdDestination;
  explicitAdDestination: boolean;
};

export function resolveCampaignDestinationContract(
  campaignPlanOrPayload: unknown,
): CampaignDestinationContract {
  const captureValue = findNormalizedValueForKeys(
    campaignPlanOrPayload,
    CAPTURE_EXPERIENCE_KEYS,
  );
  const explicitAdValue = findNormalizedValueForKeys(
    campaignPlanOrPayload,
    EXPLICIT_AD_DESTINATION_KEYS,
  );
  const legacyInstantForm = hasInstantFormDestination(campaignPlanOrPayload);
  const captureExperience =
    captureValue && DEALFLOW_WEBSITE_CAPTURE_VALUES.has(captureValue)
      ? "dealflow_website"
      : captureValue && INSTANT_FORM_VALUES.has(captureValue)
        ? "meta_instant_form"
        : legacyInstantForm
          ? "meta_instant_form"
          : "dealflow_website";
  const explicitAdDestination = Boolean(explicitAdValue);
  const adDestination =
    explicitAdValue && INSTANT_FORM_VALUES.has(explicitAdValue)
      ? "meta_instant_form"
      : explicitAdValue
        ? "website"
        : captureExperience === "meta_instant_form"
          ? "meta_instant_form"
          : "website";

  return {
    captureExperience,
    adDestination,
    explicitAdDestination,
  };
}

export function isInstantFormCampaign(campaignPlanOrPayload: unknown): boolean {
  return (
    resolveCampaignDestinationContract(campaignPlanOrPayload).adDestination ===
    "meta_instant_form"
  );
}
