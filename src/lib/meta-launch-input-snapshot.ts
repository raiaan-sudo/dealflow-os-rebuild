import "server-only";

import { createHash } from "node:crypto";

export type MetaLaunchInputSnapshot = {
  schema_version: 1;
  organization_id: string;
  campaign_id: string;
  attempt_id: string;
  provider: {
    ad_account_id: string;
    page_id: string;
    pixel_id: string;
  };
  creative: {
    selected_ad_id: string;
    image_url_sha256: string | null;
    primary_text_sha256: string;
    headline_sha256: string;
  };
  destination_url: string;
  destination_host: string;
  delivery: {
    objective: string;
    country_code: string;
    location: string;
    daily_budget_minor: string;
    special_ad_categories: ["HOUSING"];
  };
};

export type MetaLaunchInputBinding = {
  snapshot: MetaLaunchInputSnapshot;
  digest: string;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildMetaLaunchInputBinding(params: {
  organizationId: string;
  campaignId: string;
  attemptId: string;
  adAccountId: string;
  pageId: string;
  pixelId: string;
  selectedAdId: string;
  imageUrl: string | null;
  primaryText: string;
  headline: string;
  destinationUrl: string;
  objective: string;
  countryCode: string;
  location: string;
  dailyBudgetMinor: string;
}): MetaLaunchInputBinding {
  const destination = new URL(params.destinationUrl);
  const snapshot: MetaLaunchInputSnapshot = {
    schema_version: 1,
    organization_id: params.organizationId,
    campaign_id: params.campaignId,
    attempt_id: params.attemptId,
    provider: {
      ad_account_id: params.adAccountId,
      page_id: params.pageId,
      pixel_id: params.pixelId,
    },
    creative: {
      selected_ad_id: params.selectedAdId,
      image_url_sha256: params.imageUrl ? sha256(params.imageUrl) : null,
      primary_text_sha256: sha256(params.primaryText),
      headline_sha256: sha256(params.headline),
    },
    destination_url: params.destinationUrl,
    destination_host: destination.hostname.toLowerCase(),
    delivery: {
      objective: params.objective,
      country_code: params.countryCode,
      location: params.location,
      daily_budget_minor: params.dailyBudgetMinor,
      special_ad_categories: ["HOUSING"],
    },
  };

  return {
    snapshot,
    digest: sha256(canonicalize(snapshot)),
  };
}
