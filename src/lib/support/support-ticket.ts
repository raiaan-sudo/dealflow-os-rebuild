import { z } from "zod";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_BY_CATEGORY,
  type SupportCategory,
} from "@/lib/support/support-categories";
export {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_PRIORITY_BY_CATEGORY,
  type SupportCategory,
} from "@/lib/support/support-categories";

export const supportTicketRequestSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  message: z.string().trim().min(10).max(4000),
  campaignId: z.string().uuid().nullable().optional(),
  context: z
    .object({
      currentUrl: z.string().max(1000).nullable().optional(),
      route: z.string().max(500).nullable().optional(),
      pathname: z.string().max(500).nullable().optional(),
      userAgent: z.string().max(500).nullable().optional(),
      dataDplId: z.string().max(120).nullable().optional(),
      timestamp: z.string().max(80).nullable().optional(),
    })
    .optional()
    .default({}),
});

export type SupportTicketRequest = z.infer<typeof supportTicketRequestSchema>;

type SupportTicketUserContext = {
  userId: string;
  userEmail: string | null;
  organizationId: string;
  organizationName: string | null;
};

type SupportTicketCampaignContext = {
  campaignId: string | null;
  campaignName: string | null;
  campaignSlug: string | null;
  campaignStatus: string | null;
  publishState: string | null;
};

type SupportTicketBillingContext = {
  planTier: string | null;
  subscriptionStatus: string | null;
  billingState: string | null;
  launchAllowed: boolean | null;
  launchOverride: boolean | null;
  launchOverrideSource: string | null;
};

export type SupportTicketBuildContext = {
  category: SupportCategory;
  message: string;
  user: SupportTicketUserContext;
  campaign: SupportTicketCampaignContext;
  billing: SupportTicketBillingContext;
  page: {
    currentUrl: string | null;
    route: string | null;
    userAgent: string | null;
    dataDplId: string | null;
    clientTimestamp: string | null;
    serverTimestamp: string;
  };
  deployment: {
    deploymentId: string | null;
    commitSha: string | null;
    environment: string | null;
  };
};

export type FreshdeskTicketPayload = {
  subject: string;
  description: string;
  email: string;
  priority: 1 | 2 | 3 | 4;
  status: 2;
  tags: string[];
  product_id?: number;
  group_id?: number;
};

const REDACTED = "[redacted]";

function redactKeyValueSecrets(input: string) {
  return input.replace(
    /\b(api[_-]?key|authorization|bearer|cookie|set-cookie|freshdesk_api_key|password|passwd|passcode|mfa|otp|secret|session|stripe[_-]?secret|supabase[_-]?service[_-]?role|token|access[_-]?token|refresh[_-]?token)(\s*[:=]\s*)(["']?)[^\s"',;<>]{6,}\3/gi,
    (_match, key: string, separator: string, quote: string) => `${key}${separator}${quote}${REDACTED}${quote}`,
  );
}

function redactSignedOrProviderUrls(input: string) {
  return input
    .replace(
      /https?:\/\/[^\s<>"')]+(?:\?[^\s<>"')]*(?:token|signature|expires|x-amz|x-goog|key|secret|sig)[^\s<>"')]*)/gi,
      "[redacted signed url]",
    )
    .replace(
      /https?:\/\/[^\s<>"')]*(?:higgsfield|replicate|openai|supabase\.co\/storage|storage\.googleapis|cloudfront|creative-assets|generated-video)[^\s<>"')]*/gi,
      "[redacted media/provider url]",
    );
}

export function redactSupportText(value: unknown) {
  const input = String(value ?? "");

  return redactKeyValueSecrets(redactSignedOrProviderUrls(input))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_]{12,}\b/g, REDACTED)
    .replace(/\b[a-z0-9_]*secret_[A-Za-z0-9_]{12,}\b/gi, REDACTED)
    .replace(/\bsb_secret_[A-Za-z0-9_]{12,}\b/gi, REDACTED)
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, REDACTED);
}

function safeLine(label: string, value: unknown) {
  const normalized =
    typeof value === "boolean"
      ? value
        ? "true"
        : "false"
      : typeof value === "number"
        ? String(value)
        : typeof value === "string" && value.trim()
          ? value.trim()
          : "none";

  return `${label}: ${redactSupportText(normalized)}`;
}

function buildDescription(context: SupportTicketBuildContext) {
  const categoryLabel = SUPPORT_CATEGORY_LABELS[context.category];
  const lines = [
    "DealFlow support request",
    "",
    safeLine("Category", categoryLabel),
    safeLine("User email", context.user.userEmail),
    safeLine("User ID", context.user.userId),
    safeLine("Organization ID", context.user.organizationId),
    safeLine("Organization", context.user.organizationName),
    safeLine("Campaign ID", context.campaign.campaignId),
    safeLine("Campaign name", context.campaign.campaignName),
    safeLine("Campaign slug", context.campaign.campaignSlug),
    safeLine("Campaign status", context.campaign.campaignStatus),
    safeLine("Publish state", context.campaign.publishState),
    safeLine("Plan tier", context.billing.planTier),
    safeLine("Billing state", context.billing.billingState),
    safeLine("Subscription status", context.billing.subscriptionStatus),
    safeLine("Launch allowed", context.billing.launchAllowed),
    safeLine("Launch override", context.billing.launchOverride),
    safeLine("Launch override source", context.billing.launchOverrideSource),
    safeLine("Current URL", context.page.currentUrl),
    safeLine("Route/page", context.page.route),
    safeLine("Client data-dpl-id", context.page.dataDplId),
    safeLine("Server deployment ID", context.deployment.deploymentId),
    safeLine("Server commit SHA", context.deployment.commitSha),
    safeLine("Environment", context.deployment.environment),
    safeLine("Browser/user agent", context.page.userAgent),
    safeLine("Client timestamp", context.page.clientTimestamp),
    safeLine("Server timestamp", context.page.serverTimestamp),
    "",
    "Submitted notes:",
    redactSupportText(context.message),
    "",
    "Redaction note: DealFlow redacts tokens, cookies, API keys, signed URLs, provider/media URLs, and other credential-like strings before sending support context.",
  ];

  return lines.join("\n");
}

export function buildFreshdeskTicketPayload(context: SupportTicketBuildContext): FreshdeskTicketPayload {
  const categoryLabel = SUPPORT_CATEGORY_LABELS[context.category];
  const requester = context.user.userEmail || context.user.userId;
  const campaignLabel = context.campaign.campaignId || "none";

  return {
    subject: redactSupportText(`[${categoryLabel}] Campaign ${campaignLabel} - ${requester}`),
    description: buildDescription(context),
    email: context.user.userEmail || "support-requester@agentdealflow.io",
    priority: SUPPORT_PRIORITY_BY_CATEGORY[context.category],
    status: 2,
    tags: [
      "dealflow_app",
      "client_support_v1",
      `category_${context.category}`,
      context.campaign.campaignId ? "campaign_context" : "no_campaign_context",
      context.billing.launchOverride ? "billing_override_context" : "billing_standard_context",
    ],
  };
}
