function requireExactString(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} is invalid for the isolated staging Meta provider contract`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Build the complete Meta Instant Form provider contract used by the isolated
 * staging fixture. Keeping this construction separate makes the entire nested
 * object behavior-testable instead of relying on unscoped source markers.
 */
export function buildStagingMetaProviderContract({
  objective,
  countryCode,
  dailyBudgetMinor,
  adDestination,
  pageId,
} = {}) {
  const exactObjective = requireExactString(objective, "objective", /^OUTCOME_[A-Z_]+$/);
  const exactCountryCode = requireExactString(countryCode, "countryCode", /^[A-Z]{2}$/);
  const exactDailyBudgetMinor = requireExactString(dailyBudgetMinor, "dailyBudgetMinor", /^[1-9][0-9]*$/);
  const exactPageId = requireExactString(pageId, "pageId", /^[0-9]+$/);
  if (adDestination !== "meta_instant_form") {
    throw new Error("adDestination must be meta_instant_form for the isolated staging Meta provider contract");
  }

  return deepFreeze({
    campaign: {
      objective: exactObjective,
      special_ad_categories: ["HOUSING"],
      special_ad_category_country: [exactCountryCode],
      is_adset_budget_sharing_enabled: false,
    },
    ad_set: {
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      daily_budget_minor: exactDailyBudgetMinor,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: {
        geo_locations: {
          countries: [exactCountryCode],
        },
      },
      destination_type: "ON_AD",
      promoted_object: {
        page_id: exactPageId,
      },
      tracking_specs: [],
    },
    creative: {
      page_id: exactPageId,
      call_to_action_type: "LEARN_MORE",
      link: "https://fb.me/",
      cta_link: null,
      provider_form_binding: "provisioning_receipt",
    },
  });
}
