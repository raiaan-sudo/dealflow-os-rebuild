import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import {
  getPublicFunnelLanguage,
  getPublicFunnelPageCopy,
  getPublicFunnelThankYouExpectation,
  getPublicFunnelThankYouHeadline,
  type PublicFunnelLanguage,
} from "@/lib/public-funnel-language";

type ThankYouLink = {
  label: string;
  href: string;
};

export type PublicFunnelThankYouViewModel = {
  language: PublicFunnelLanguage;
  businessName: string;
  headline: string;
  expectation: string;
  offerContext: string;
  receivedDetailsPrefix: string;
  nextStepLabel: string;
  watchForUsLabel: string;
  watchForUsBody: string;
  privacyLabel: string;
  privacyBody: string;
  primaryLink: ThankYouLink | null;
  secondaryLink: ThankYouLink;
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
  const language = getPublicFunnelLanguage(record);
  const copy = getPublicFunnelPageCopy(language);
  const businessName =
    safeText(record.plan.business_name) ||
    safeText(record.plan.client_name) ||
    safeText(record.campaign.name) ||
    copy.defaultBusinessName;
  const offerContext =
    safeText(record.funnel.headline) ||
    safeText(record.plan.offer) ||
    copy.defaultOfferContext;
  const expectation = getPublicFunnelThankYouExpectation(
    language,
    record.funnel.follow_up_action,
  );

  return {
    language,
    businessName,
    headline: getPublicFunnelThankYouHeadline(language),
    expectation,
    offerContext,
    receivedDetailsPrefix: copy.receivedDetailsPrefix,
    nextStepLabel: copy.nextStepLabel,
    watchForUsLabel: copy.watchForUsLabel,
    watchForUsBody: copy.watchForUsBody,
    privacyLabel: copy.privacyLabel,
    privacyBody: copy.privacyBody,
    primaryLink: bookingUrl ? { label: copy.bookCallLabel, href: bookingUrl } : null,
    secondaryLink: {
      label: bookingUrl ? copy.returnToRequestLabel : copy.returnToPageLabel,
      href: `/f/${encodeURIComponent(slug)}`,
    },
  };
}
