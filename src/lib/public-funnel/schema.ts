import { z } from "zod";
import {
  CANONICAL_PUBLIC_FORM_ID,
  CURRENT_PUBLIC_FUNNEL_PRESET_VERSION,
} from "@/lib/public-funnel/constants";

const shortText = z.string().trim().min(1).max(240);
const bodyText = z.string().trim().min(1).max(800);

export const canonicalPublicFunnelSchema = z.object({
  presetVersion: z.literal(CURRENT_PUBLIC_FUNNEL_PRESET_VERSION),
  campaignId: shortText,
  organizationId: shortText.nullable(),
  slug: shortText,
  campaignName: shortText,
  businessName: shortText,
  market: shortText,
  offer: shortText,
  hero: z.object({
    eyebrow: shortText,
    headline: bodyText,
    subheadline: bodyText,
    primaryCta: shortText,
  }),
  trust: z.object({
    items: z.array(z.object({ label: shortText })).min(1).max(4),
  }),
  offerCard: z.object({
    headline: shortText,
    description: bodyText,
    bullets: z.array(shortText).min(1).max(4),
  }),
  valueStack: z.object({
    headline: shortText,
    metrics: z.array(z.object({ label: shortText, value: shortText })).min(1).max(4),
    bullets: z.array(shortText).min(1).max(5),
  }),
  qualification: z.object({
    headline: shortText,
    steps: z.array(z.object({ title: shortText, body: bodyText })).min(1).max(3),
  }),
  expectations: z.object({
    headline: shortText,
    bullets: z.array(shortText).min(1).max(4),
  }),
  form: z.object({
    id: z.literal(CANONICAL_PUBLIC_FORM_ID),
    title: shortText,
    cta: shortText,
    fields: z.array(z.enum(["name", "email", "phone"])).min(2).max(3),
  }),
  tracking: z.object({
    metaPixelId: z.string().trim().min(1).max(80).nullable().optional(),
  }),
});

export type CanonicalPublicFunnelSchema = z.infer<typeof canonicalPublicFunnelSchema>;

export function validateCanonicalPublicFunnel(value: unknown) {
  return canonicalPublicFunnelSchema.parse(value);
}

export function safeParseCanonicalPublicFunnel(value: unknown) {
  return canonicalPublicFunnelSchema.safeParse(value);
}

