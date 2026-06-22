import { ApiError } from "@/lib/api/route";

type MetaEnrollStatus = {
  enroll_status: "OPT_OUT";
};

export type MetaMarketGeoLocations = {
  custom_locations: Array<{
    address_string: string;
    radius: number;
    distance_unit: "mile" | "kilometer";
  }>;
};

export type MetaCreativeOptOutPayload = {
  contextual_multi_ads: MetaEnrollStatus;
};

const COUNTRY_ONLY_MARKET_PATTERN =
  /^(canada|ca|united states|united states of america|usa|u\.s\.a\.|us|u\.s\.)$/i;

function normalizeMarketLocation(location: string) {
  return location
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CANADIAN_MARKET_PATTERN =
  /\b(canada|ontario|toronto|vancouver|calgary|edmonton|montreal|ottawa|bc|british columbia|alberta|quebec|qc|lanaudiere|laurentides|laval|gatineau|sherbrooke|trois-rivieres|longueuil)\b/i;

function getMarketDistanceUnit(location: string): "mile" | "kilometer" {
  return CANADIAN_MARKET_PATTERN.test(normalizeMarketLocation(location))
    ? "kilometer"
    : "mile";
}

function getMarketRadius(location: string, distanceUnit: "mile" | "kilometer") {
  if (/\bcounty\b/i.test(location)) {
    return distanceUnit === "kilometer" ? 40 : 25;
  }

  return distanceUnit === "kilometer" ? 25 : 15;
}

export function getMetaSpecialAdCategoryCountries(location: string): string[] {
  const market = normalizeMarketLocation(location);

  if (CANADIAN_MARKET_PATTERN.test(market)) {
    return ["CA"];
  }

  return ["US"];
}

export function buildMetaMarketGeoLocations(location: string): MetaMarketGeoLocations {
  const market = normalizeMarketLocation(location);

  if (!market) {
    throw new ApiError(
      400,
      "Add a specific campaign market before launching Meta ads.",
      "meta_market_required",
    );
  }

  if (COUNTRY_ONLY_MARKET_PATTERN.test(market)) {
    throw new ApiError(
      400,
      "Use a city, county, or local market instead of a whole country before launching Meta ads.",
      "meta_market_too_broad",
    );
  }

  const distanceUnit = getMarketDistanceUnit(market);

  return {
    custom_locations: [
      {
        address_string: market,
        radius: getMarketRadius(market, distanceUnit),
        distance_unit: distanceUnit,
      },
    ],
  };
}

export function getMetaCreativeOptOutPayload(): MetaCreativeOptOutPayload {
  return {
    contextual_multi_ads: {
      enroll_status: "OPT_OUT",
    },
  };
}

export function applyMetaCreativeOptOut<T extends Record<string, unknown>>(
  payload: T,
): T & MetaCreativeOptOutPayload {
  return {
    ...payload,
    ...getMetaCreativeOptOutPayload(),
  };
}
