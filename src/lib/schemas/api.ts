import { z } from "zod";

export const routeIdSchema = z.uuid("A valid resource id is required.");

export const leadStatusSchema = z
  .enum(["new", "engaged", "qualified", "unqualified", "booked", "lost"])
  .optional();

export const appointmentStatusSchema = z
  .enum(["scheduled", "booked", "completed", "canceled", "cancelled", "no_show"])
  .optional();

export const dealStatusSchema = z
  .enum(["active", "closed_won", "closed_lost", "paused"])
  .optional();

export const leadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: leadStatusSchema,
  q: z.string().trim().optional(),
});

export const jobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: z.string().trim().optional(),
});

export const appointmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: appointmentStatusSchema,
});

export const dealsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: dealStatusSchema,
  stage: z.string().trim().optional(),
});

export const copilotQuestionSchema = z.object({
  question: z.string().trim().min(3).max(500),
  applyChanges: z.boolean().optional().default(false),
});

export const autonomyModeSchema = z.object({
  mode: z.enum(["manual", "assisted", "autonomous"]),
});

export const campaignRuntimeSchema = z.object({
  action: z.enum([
    "set_experience_status",
    "refresh",
    "apply_optimization",
    "set_guardrails",
    "pause_campaign",
    "resume_campaign",
    "archive_campaign",
  ]),
  campaign: z
    .object({
      id: z.string().min(2),
      name: z.string().min(2),
      status: z.enum(["draft", "ready", "published", "paused"]),
      objective: z.string().min(2),
      destinationUrl: z.string().min(1),
      budget: z.string().min(2),
      adSets: z.array(
        z.object({
          id: z.string().min(2),
          name: z.string().min(2),
          status: z.enum(["draft", "ready", "published", "paused"]),
          audience: z.string().min(2),
          targeting: z.object({
            audience: z.string().min(2),
            propertyType: z.string().min(2),
            offer: z.string().min(2),
            location: z.string().min(2),
          }),
          location: z.string().min(2),
          budget: z.string().min(2),
          ads: z.array(
            z.object({
              id: z.string().min(2),
              name: z.string().min(2),
              status: z.enum(["draft", "ready", "published", "paused"]),
              copy: z.string().min(2),
              headline: z.string().min(2),
              creative: z.string().min(2),
              creativeAsset: z.object({
                name: z.string().min(2),
                status: z.enum(["draft", "ready", "published", "paused"]),
                imageUrl: z.string().min(1),
                overlayText: z.string().min(2),
                headline: z.string().min(2),
                body: z.string().min(2),
                aspectRatio: z.enum(["1:1", "4:5"]),
              }),
              cta: z.string().min(2),
              destinationUrl: z.string().min(1),
            }),
          ),
        }),
      ),
    })
    .optional(),
  actionTitle: z.string().trim().min(3).max(200).optional(),
  budgetDailyInput: z.number().min(1).max(10000).optional(),
  launchMode: z.enum(["test", "live"]).optional(),
  safetyState: z.enum(["ready", "blocked"]).optional(),
  message: z.string().trim().min(3).max(300).optional(),
  experienceStatus: z
    .enum(["draft", "built", "paywall", "preview", "connected", "launch_ready", "launching", "live"])
    .optional(),
});

export const advancedFunnelSectionStyleSchema = z
  .object({
    spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
    width: z.enum(["full", "content", "narrow"]).optional(),
    align: z.enum(["left", "center"]).optional(),
    theme: z.enum(["light", "dark", "accent"]).optional(),
  })
  .partial();

export const advancedFunnelSectionMediaSchema = z
  .object({
    kind: z.enum(["video", "image"]).optional(),
    assetId: z.string().trim().uuid("Media asset id must be a valid resource id.").optional(),
    url: z.string().trim().url("Media URL must be a valid URL.").optional(),
    thumbnailAssetId: z.string().trim().uuid("Thumbnail asset id must be a valid resource id.").optional(),
    thumbnailUrl: z.string().trim().url("Thumbnail URL must be a valid URL.").optional(),
    label: z.string().trim().max(120).optional(),
    caption: z.string().trim().max(300).optional(),
  })
  .partial()
  .nullable();

export const advancedFunnelSectionSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  type: z.enum([
    "hero",
    "trust_bar",
    "benefits",
    "proof_metrics",
    "social_proof",
    "market_snapshot",
    "objections",
    "process",
    "faq",
    "vsl",
    "image",
    "form",
    "closing_cta",
  ]),
  variant: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(200),
  content: z.array(z.string().trim().min(1).max(1200)).max(20),
  visible: z.boolean().optional(),
  style: advancedFunnelSectionStyleSchema.optional(),
  media: advancedFunnelSectionMediaSchema.optional(),
});

export const advancedFunnelSchema = z.object({
  funnel_type: z.enum([
    "landing_page_form",
    "landing_page_survey",
    "landing_page_book_call",
  ]),
  headline: z.string().trim().min(1).max(240),
  subheadline: z.string().trim().min(1).max(500),
  cta: z.string().trim().min(1).max(120),
  sections: z.array(advancedFunnelSectionSchema).min(1).max(30),
  form_fields: z.array(z.string().trim().min(1).max(120)).max(20),
  follow_up_action: z.string().trim().min(1).max(240),
  optimization_notes: z.array(z.string().trim().min(1).max(400)).max(20),
});

export const publishCampaignSchema = z.object({
  state: z.enum(["draft", "staged", "published"]),
  slug: z.string().trim().min(1).max(160).optional(),
});
