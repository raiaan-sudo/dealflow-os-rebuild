import { ApiError } from "@/lib/api/route";

const PROMOTION_CODE_PATTERN = /^promo_[A-Za-z0-9]{6,240}$/;
const PARTNER_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export type StripeCheckoutPromotionSurface = "direct" | "access_key";

function readAllowedPromotionCodes() {
  const values = (process.env.STRIPE_ALLOWED_PROMOTION_CODE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => !PROMOTION_CODE_PATTERN.test(value))) {
    throw new ApiError(503, "Stripe promotion allowlist is invalid.", "stripe_promotion_policy_invalid");
  }
  return new Set(values);
}

function readPartnerPromotionCode(partnerSlug: string | null | undefined) {
  if (!partnerSlug) return null;
  if (!PARTNER_SLUG_PATTERN.test(partnerSlug)) {
    throw new ApiError(503, "Partner promotion policy identity is invalid.", "stripe_promotion_policy_invalid");
  }

  const source = process.env.STRIPE_PARTNER_PROMOTION_CODE_MAP_JSON?.trim();
  if (!source) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ApiError(503, "Stripe partner promotion policy is invalid.", "stripe_promotion_policy_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(503, "Stripe partner promotion policy is invalid.", "stripe_promotion_policy_invalid");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (
    entries.some(
      ([slug, value]) => !PARTNER_SLUG_PATTERN.test(slug) || typeof value !== "string" || !PROMOTION_CODE_PATTERN.test(value),
    )
  ) {
    throw new ApiError(503, "Stripe partner promotion policy is invalid.", "stripe_promotion_policy_invalid");
  }
  const selected = (parsed as Record<string, string>)[partnerSlug] ?? null;
  return selected;
}

export function getStripeCheckoutPromotionPolicy(input: {
  surface: StripeCheckoutPromotionSurface;
  partnerSlug?: string | null;
}) {
  const allowed = readAllowedPromotionCodes();
  const selected = input.partnerSlug
    ? readPartnerPromotionCode(input.partnerSlug)
    : input.surface === "direct"
      ? process.env.STRIPE_DIRECT_PROMOTION_CODE_ID?.trim() || null
      : process.env.STRIPE_ACCESS_KEY_PROMOTION_CODE_ID?.trim() || null;

  if (!selected) {
    return {
      allow_promotion_codes: false as const,
    };
  }
  if (!PROMOTION_CODE_PATTERN.test(selected) || !allowed.has(selected)) {
    throw new ApiError(
      503,
      "Stripe promotion code is not in the approved server allowlist.",
      "stripe_promotion_not_allowlisted",
    );
  }

  return {
    allow_promotion_codes: false as const,
    discounts: [{ promotion_code: selected }],
  };
}
