import type { FullCampaignRecord } from "@/lib/types/campaign-records";

type ThankYouLink = {
  label: string;
  href: string;
};

export type PublicFunnelThankYouViewModel = {
  businessName: string;
  headline: string;
  expectation: string;
  offerContext: string;
  primaryLink: ThankYouLink | null;
  secondaryLink: ThankYouLink;
};

const BOOKING_LABEL = "Book a quick call";
const RETURN_LABEL = "Back to listing request";
const DEFAULT_EXPECTATION =
  "We will review your criteria and follow up with the strongest next steps.";
const FOLLOW_UP_EXPECTATIONS: Record<string, string> = {
  redirect_to_calendar:
    "Book a quick call if you want faster help, or watch for our follow-up with the strongest next steps.",
  send_to_follow_up_sequence:
    "We will review your criteria and follow up with the strongest next steps.",
  show_thank_you_page:
    "We will review your request and follow up shortly with the clearest next step.",
  show_thank_you_page_call_5_15_minutes:
    "We will review your criteria and follow up shortly with the strongest next steps.",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safePublicUrl(value: unknown) {
  const raw = safeText(value);

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractFirstUrl(value: unknown) {
  const raw = safeText(value);
  const match = raw?.match(/https?:\/\/[^\s)"'<]+/i);
  return match ? safePublicUrl(match[0]) : null;
}

function getFollowUpExpectation(value: unknown) {
  const raw = safeText(value);

  if (!raw) {
    return DEFAULT_EXPECTATION;
  }

  const normalizedKey = raw.trim().toLowerCase();
  return FOLLOW_UP_EXPECTATIONS[normalizedKey] ?? raw;
}

export function getPublicFunnelBookingUrl(record: FullCampaignRecord) {
  const value = record as unknown as Record<string, unknown>;
  const plan = asRecord(value.plan);
  const funnel = asRecord(value.funnel);
  const strategy = asRecord(value.strategy);
  const candidates = [
    plan.booking_url,
    plan.bookingUrl,
    plan.calendar_url,
    plan.calendarUrl,
    plan.calendly_url,
    plan.calendlyUrl,
    plan.appointment_url,
    plan.appointmentUrl,
    funnel.booking_url,
    funnel.bookingUrl,
    funnel.calendar_url,
    funnel.calendarUrl,
    strategy.booking_url,
    strategy.bookingUrl,
    extractFirstUrl(funnel.follow_up_action),
  ];

  for (const candidate of candidates) {
    const url = safePublicUrl(candidate);
    if (url) {
      return url;
    }
  }

  return null;
}

export function buildPublicFunnelThankYouViewModel(params: {
  record: FullCampaignRecord;
  slug: string;
}): PublicFunnelThankYouViewModel {
  const { record, slug } = params;
  const bookingUrl = getPublicFunnelBookingUrl(record);
  const businessName =
    safeText(record.plan.business_name) ||
    safeText(record.plan.client_name) ||
    safeText(record.campaign.name) ||
    "the team";
  const offerContext =
    safeText(record.funnel.headline) ||
    safeText(record.plan.offer) ||
    "your request";
  const expectation = getFollowUpExpectation(record.funnel.follow_up_action);

  return {
    businessName,
    headline: "Your request was received.",
    expectation,
    offerContext,
    primaryLink: bookingUrl ? { label: BOOKING_LABEL, href: bookingUrl } : null,
    secondaryLink: {
      label: bookingUrl ? RETURN_LABEL : "Return to page",
      href: `/f/${encodeURIComponent(slug)}`,
    },
  };
}
