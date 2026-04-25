function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

export function normalizeInput(text: string) {
  if (!text) {
    return "";
  }

  return safeText(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/firsttime/gi, "first time")
    .replace(/homebuyers/gi, "home buyers")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatAudience(text: string) {
  return normalizeInput(text)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeOffer(text: string) {
  return normalizeInput(text)
    .replace(/(\d+)\s*days/gi, "$1 days")
    .replace(/\bwe\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMarket(text: string) {
  return normalizeInput(text)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeCampaignText(params: {
  field: "location" | "audience" | "offer" | "price_point";
  value: string;
}) {
  if (params.field === "audience") {
    return formatAudience(params.value);
  }

  if (params.field === "offer") {
    return normalizeOffer(params.value);
  }

  if (params.field === "location") {
    return normalizeMarket(params.value);
  }

  return normalizeInput(params.value);
}
