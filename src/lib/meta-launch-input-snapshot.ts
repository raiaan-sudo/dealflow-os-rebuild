import "server-only";

import { createHash } from "node:crypto";

export type MetaLaunchInputSnapshot = {
  schema_version: 1;
  organization_id: string;
  campaign_id: string;
  attempt_id: string;
  provider: {
    ad_account_id: string;
    account_currency: string;
    page_id: string;
    pixel_id: string;
  };
  creative: {
    selected_ad_id: string;
    image_content_sha256: string;
    primary_text_sha256: string;
    headline_sha256: string;
  };
  destination_url: string;
  destination_host: string;
  destination: {
    capture_experience: "dealflow_website" | "meta_instant_form";
    ad_destination: "website" | "meta_instant_form";
    provider_form_id: string | null;
    form_definition_digest: string | null;
  };
  delivery: {
    objective: string;
    country_code: string;
    location: string;
    daily_budget_minor: string;
    special_ad_categories: ["HOUSING"];
  };
  provider_contract: {
    campaign: {
      objective: string;
      special_ad_categories: ["HOUSING"];
      special_ad_category_country: [string];
      is_adset_budget_sharing_enabled: false;
    };
    ad_set: {
      billing_event: "IMPRESSIONS";
      optimization_goal: string;
      daily_budget_minor: string;
      bid_strategy: "LOWEST_COST_WITHOUT_CAP";
      targeting: {
        geo_locations: {
          countries: [string];
        };
      };
      destination_type: "ON_AD" | null;
      promoted_object:
        | { page_id: string }
        | { pixel_id: string; custom_event_type: "LEAD" };
      tracking_specs: Array<{
        action_type: ["offsite_conversion"];
        fb_pixel: [string];
      }>;
    };
    creative: {
      page_id: string;
      call_to_action_type: "LEARN_MORE";
      link: string;
      cta_link: string | null;
      provider_form_binding: "provisioning_receipt" | null;
    };
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
  accountCurrency: string;
  pageId: string;
  pixelId: string;
  selectedAdId: string;
  imageContentSha256: string;
  primaryText: string;
  headline: string;
  destinationUrl: string;
  objective: string;
  countryCode: string;
  location: string;
  dailyBudgetMinor: string;
  captureExperience?: "dealflow_website" | "meta_instant_form";
  adDestination?: "website" | "meta_instant_form";
  providerFormId?: string | null;
  formDefinitionDigest?: string | null;
}): MetaLaunchInputBinding {
  const accountCurrency = params.accountCurrency.trim().toUpperCase();
  if (accountCurrency !== "USD" && accountCurrency !== "CAD") {
    throw new Error("Meta account currency must be USD or CAD for an immutable launch binding.");
  }
  if (!params.imageContentSha256 || !/^[0-9a-f]{64}$/.test(params.imageContentSha256)) {
    throw new Error("A verified creative content checksum is required for an immutable launch binding.");
  }
  const destination = new URL(params.destinationUrl);
  const objective = params.objective.trim().toUpperCase();
  const countryCode = params.countryCode.trim().toUpperCase();
  const adDestination = params.adDestination ?? "website";
  const optimizationGoal = adDestination === "meta_instant_form"
    ? "LEAD_GENERATION"
    : objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" : "OFFSITE_CONVERSIONS";
  const snapshot: MetaLaunchInputSnapshot = {
    schema_version: 1,
    organization_id: params.organizationId,
    campaign_id: params.campaignId,
    attempt_id: params.attemptId,
    provider: {
      ad_account_id: params.adAccountId,
      account_currency: accountCurrency,
      page_id: params.pageId,
      pixel_id: params.pixelId,
    },
    creative: {
      selected_ad_id: params.selectedAdId,
      image_content_sha256: params.imageContentSha256,
      primary_text_sha256: sha256(params.primaryText),
      headline_sha256: sha256(params.headline),
    },
    destination_url: params.destinationUrl,
    destination_host: destination.hostname.toLowerCase(),
    destination: {
      capture_experience: params.captureExperience ?? "dealflow_website",
      ad_destination: adDestination,
      provider_form_id: params.providerFormId ?? null,
      form_definition_digest: params.formDefinitionDigest ?? null,
    },
    delivery: {
      objective,
      country_code: countryCode,
      location: params.location,
      daily_budget_minor: params.dailyBudgetMinor,
      special_ad_categories: ["HOUSING"],
    },
    provider_contract: {
      campaign: {
        objective,
        special_ad_categories: ["HOUSING"],
        special_ad_category_country: [countryCode],
        is_adset_budget_sharing_enabled: false,
      },
      ad_set: {
        billing_event: "IMPRESSIONS",
        optimization_goal: optimizationGoal,
        daily_budget_minor: params.dailyBudgetMinor,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: {
          geo_locations: {
            countries: [countryCode],
          },
        },
        destination_type: adDestination === "meta_instant_form" ? "ON_AD" : null,
        promoted_object: adDestination === "meta_instant_form"
          ? { page_id: params.pageId }
          : { pixel_id: params.pixelId, custom_event_type: "LEAD" },
        tracking_specs: adDestination === "meta_instant_form"
          ? []
          : [{ action_type: ["offsite_conversion"], fb_pixel: [params.pixelId] }],
      },
      creative: {
        page_id: params.pageId,
        call_to_action_type: "LEARN_MORE",
        link: adDestination === "meta_instant_form" ? "https://fb.me/" : params.destinationUrl,
        cta_link: adDestination === "meta_instant_form" ? null : params.destinationUrl,
        provider_form_binding: adDestination === "meta_instant_form" ? "provisioning_receipt" : null,
      },
    },
  };

  return {
    snapshot,
    digest: sha256(canonicalize(snapshot)),
  };
}
