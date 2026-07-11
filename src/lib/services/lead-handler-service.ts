import { ApiError } from "@/lib/api/route";
import { createHash } from "node:crypto";
import { generateAiJson } from "@/lib/ai/client";
import { logError, logWarn } from "@/lib/logging";
import {
  buildCampaignPlanCriticalFieldPatch,
  readCampaignPlanDocument,
  withLeadLoopVerified,
} from "@/lib/services/campaign-plan-document";
import {
  bookAppointment,
  createBookingAdminClient,
  formatAppointmentConfirmationMessage,
  formatSuggestedSlotMessage,
  generateSuggestedSlots,
  parseTimeFromMessage,
} from "@/lib/services/booking-service";
import {
  createSystemJob,
  queueLeadSideEffectsJob,
} from "@/lib/services/system-job-service";
import { getAppContext } from "@/lib/services/app-context";
import { normalizePhone, sendSMS } from "@/lib/services/sms-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Database, Json } from "@/lib/supabase/types";
import { assertLeadRetryParentScope } from "@/lib/leads/retry-scope";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadMessageRow = Database["public"]["Tables"]["lead_messages"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

type LeadConversationMessage = Pick<LeadMessageRow, "id" | "direction" | "message" | "created_at">;

type GeneratedLeadResponse = {
  reply: string;
  budget: string | null;
  timeline: string | null;
  intent: string | null;
  status: "engaged" | "qualified" | "unqualified" | "booked" | "lost" | null;
  notes: string | null;
};

export type LeadWithMessages = {
  lead: LeadRow;
  messages: LeadConversationMessage[];
  appointment: AppointmentRow | null;
};

type CreateLeadInput = {
  campaign_id?: string;
  funnel_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  ad_id?: string | null;
  landing_page_url?: string | null;
  sms_consent?: boolean | null;
  sms_consent_copy?: string | null;
  consent_source?: string | null;
  consent_url?: string | null;
  skip_recent_duplicate_fallback?: boolean;
  skip_lead_loop_verification?: boolean;
  custom_answers?: Record<string, string>;
  metadata?: Record<string, Json>;
};

type QueueFailedLeadCaptureInput = {
  requestId: string;
  campaign_id?: string;
  funnel_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  stage?: string | null;
  failureReason: string;
  smsConsent?: boolean | null;
  smsConsentCopy?: string | null;
  consentUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  adId?: string | null;
  landingPageUrl?: string | null;
  customAnswers?: Record<string, string>;
};

export type PublicLeadCaptureRetryInput = {
  campaignId: string;
  expectedOrganizationId: string;
  expectedUserId: string;
  expectedCampaignId: string;
  funnelId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  notes: string | null;
  source?: string | null;
  requestId?: string | null;
  reason?: string | null;
  smsConsent?: boolean | null;
  smsConsentCopy?: string | null;
  consentUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  adId?: string | null;
  landingPageUrl?: string | null;
  customAnswers?: Record<string, string>;
};

type LeadInsertContext = {
  organizationId: string;
  userId: string;
  campaignId: string | null;
};

type LeadBookingMetadata = {
  status?: "suggested" | "booked";
  offered_slots?: string[];
  appointment_id?: string;
  scheduled_at?: string;
};

type LeadMetadata = Record<string, Json | undefined> & {
  booking?: LeadBookingMetadata;
};

const SMS_CONSENT_COPY =
  "By checking this box and submitting, I agree to receive automated and manual SMS messages about this request from DealFlow OS and its customer. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";

function normalizeLeadRetryIdentity(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function buildLeadRetryJobIdempotencyKey(input: {
  requestId: string;
  campaignId: string;
  funnelId: string;
  email?: string | null;
  phone?: string | null;
}) {
  return createHash("sha256")
    .update(
      [
        "lead_capture_retry",
        input.requestId.trim(),
        input.campaignId.trim(),
        input.funnelId.trim(),
        normalizeLeadRetryIdentity(input.email),
        normalizePhone(input.phone ?? ""),
      ].join("|"),
    )
    .digest("hex");
}

function splitLeadName(name?: string | null) {
  const value = (name ?? "").trim();

  if (!value) {
    return {
      firstName: "Lead",
      lastName: "Contact",
    };
  }

  const [firstName, ...rest] = value.split(/\s+/);

  return {
    firstName: firstName || "Lead",
    lastName: rest.join(" ") || "Contact",
  };
}

function normalizeLeadStatus(status?: string | null): LeadRow["status"] {
  if (
    status === "engaged" ||
    status === "qualified" ||
    status === "unqualified" ||
    status === "booked" ||
    status === "lost"
  ) {
    return status;
  }

  return "new";
}

function buildLeadDedupeHash(params: {
  organizationId: string;
  campaignId: string | null;
  email: string | null;
  phone: string | null;
}) {
  const normalizedEmail = (params.email ?? "").trim().toLowerCase();
  const normalizedPhone = (params.phone ?? "").trim();

  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  return createHash("sha256")
    .update(
      [
        params.organizationId,
        params.campaignId ?? "no-campaign",
        normalizedEmail,
        normalizedPhone,
      ].join("|"),
    )
    .digest("hex");
}

function getLeadMetadata(lead: LeadRow): LeadMetadata {
  if (!lead.metadata || typeof lead.metadata !== "object" || Array.isArray(lead.metadata)) {
    return {};
  }

  return lead.metadata as LeadMetadata;
}

function withBookingMetadata(lead: LeadRow, booking: LeadBookingMetadata): Json {
  return {
    ...getLeadMetadata(lead),
    booking,
  };
}

function showsStrongBookingIntent(message: string) {
  return /\b(yeah|yes|interested|can someone call me|call me|talk to someone|see options|show me options|show me homes|want to move forward|i'd like to see|book|schedule)\b/i
    .test(message);
}

function isSmsOptOutMessage(message: string) {
  return /^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(message.trim());
}

function isSmsOptInMessage(message: string) {
  return /^(start|unstop|subscribe)$/i.test(message.trim());
}

function isSmsHelpMessage(message: string) {
  return /^help$/i.test(message.trim());
}

function buildSmsConsentMetadata(input: {
  source?: string | null;
  consented: boolean;
  phone: string | null;
  copy?: string | null;
  url?: string | null;
}) {
  const capturedAt = new Date().toISOString();

  return {
    source: input.source?.trim() || "lead_capture",
    captured_at: capturedAt,
    sms: {
      consented: input.consented,
      captured_at: capturedAt,
      phone: input.phone,
      consent_copy: input.copy?.trim() || SMS_CONSENT_COPY,
      opt_out_copy: "Reply STOP to opt out or HELP for help.",
      source_url: input.url?.trim() || null,
      privacy_url: "/privacy",
      terms_url: "/terms",
    },
  } as Json;
}

async function markLeadSmsOptedOut(
  supabase: SupabaseClient | AdminClient,
  lead: LeadRow,
) {
  const optedOutAt = new Date().toISOString();
  const { error } = await supabase
    .from("leads")
    .update({
      sms_opted_out_at: optedOutAt,
      status: "lost",
      metadata: {
        ...getLeadMetadata(lead),
        sms_opt_out: {
          status: "opted_out",
          opted_out_at: optedOutAt,
        },
      },
    } as never)
    .eq("id", lead.id);

  if (error) {
    throw error;
  }
}

async function markLeadSmsOptedIn(
  supabase: SupabaseClient | AdminClient,
  lead: LeadRow,
) {
  const optedInAt = new Date().toISOString();
  const { error } = await supabase
    .from("leads")
    .update({
      sms_opted_out_at: null,
      metadata: {
        ...getLeadMetadata(lead),
        sms_opt_in: {
          status: "opted_in",
          opted_in_at: optedInAt,
          source: "inbound_start",
        },
      },
      consent_metadata: buildSmsConsentMetadata({
        source: "inbound_start",
        consented: true,
        phone: lead.phone,
        copy:
          "Reply START to resume SMS messages. Message and data rates may apply. Reply STOP to opt out or HELP for help.",
      }),
    } as never)
    .eq("id", lead.id);

  if (error) {
    throw error;
  }
}

async function requireLeadContext() {
  const [supabase, context] = await Promise.all([
    createRouteHandlerClient(),
    getAppContext(),
  ]);

  if (!supabase || !context) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  return {
    supabase,
    userId: context.user.id,
    organizationId: context.organization.id,
  };
}

async function resolvePublicLeadInsertContext(input: Pick<CreateLeadInput, "campaign_id" | "funnel_id">) {
  const admin = await createPublicLeadLookupClient();

  if (input.campaign_id?.trim()) {
    const { data, error } = await admin
      .from("campaign_plans")
      .select("id, owner_id, user_id, organization_id")
      .eq("id", input.campaign_id.trim())
      .eq("publish_state", "published")
      .maybeSingle();

    if (error) {
      throw new ApiError(500, error.message, "campaign_lookup_failed");
    }

    if (!data) {
      throw new ApiError(404, "Published funnel not found.", "funnel_not_found");
    }

    return resolveOrganizationIdForCampaignRow(admin, data as Pick<
      CampaignPlanRow,
      "id" | "owner_id" | "user_id" | "organization_id"
    > | null);
  }

  const funnelSlug = input.funnel_id?.trim().toLowerCase() ?? null;

  if (!funnelSlug) {
    throw new ApiError(
      400,
      "A campaign_id or funnel_id is required for public lead capture.",
      "validation_error",
    );
  }

  const { data, error } = await admin
    .from("campaign_plans")
    .select("id, owner_id, user_id, organization_id")
    .eq("public_slug", funnelSlug)
    .eq("publish_state", "published")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "funnel_lookup_failed");
  }

  if (!data) {
    throw new ApiError(404, "Published funnel not found.", "funnel_not_found");
  }

  return resolveOrganizationIdForCampaignRow(admin, data as Pick<
    CampaignPlanRow,
    "id" | "owner_id" | "user_id" | "organization_id"
  > | null);
}

async function createPublicLeadLookupClient() {
  const admin = createAdminClient();

  if (admin) {
    return admin;
  }

  logError("CRITICAL: Public lead lookup blocked: service-role client unavailable", {
    code: "service_role_missing",
  });

  throw new ApiError(
    503,
    "Lead capture is temporarily unavailable. Please try again shortly.",
    "service_role_missing",
  );
}

async function resolveOrganizationIdForCampaignRow(
  _admin: AdminClient | SupabaseClient,
  row: Pick<CampaignPlanRow, "id" | "owner_id" | "user_id" | "organization_id"> | null,
) {
  if (!row?.user_id) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  if (!row.organization_id) {
    throw new ApiError(
      409,
      "This legacy campaign does not have an unambiguous workspace owner and cannot accept leads until reconciled.",
      "campaign_workspace_ambiguous",
    );
  }

  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    campaignId: row.id,
  } satisfies LeadInsertContext;
}

async function createPublicLeadInsertClient(expectedUserId: string) {
  const client = await createPublicLeadLookupClient();

  void expectedUserId;
  return client;
}

export async function queueFailedPublicLeadCapture(input: QueueFailedLeadCaptureInput) {
  const campaignId = input.campaign_id?.trim() ?? "";
  const funnelId = input.funnel_id?.trim() ?? "";

  if (!campaignId && !funnelId) {
    logError("Failed lead capture could not be queued: missing campaign id and funnel id", {
      requestId: input.requestId,
      reason: input.failureReason,
      code: "failed_lead_capture_missing_campaign",
    });
    return null;
  }

  try {
    const context = await resolvePublicLeadInsertContext({
      campaign_id: campaignId || undefined,
      funnel_id: funnelId || null,
    });
    const canonicalCampaignId = context.campaignId?.trim() ?? "";

    if (!canonicalCampaignId) {
      throw new ApiError(
        409,
        "The failed lead capture did not resolve to a canonical campaign.",
        "failed_lead_capture_campaign_scope_missing",
      );
    }

    const job = await createSystemJob({
      organizationId: context.organizationId,
      userId: context.userId,
      campaignId: canonicalCampaignId,
      kind: "lead_capture_retry",
      payload: {
        source: input.source?.trim() || "lead_capture_public",
        requestId: input.requestId,
        reason: input.failureReason,
        leadCapture: {
          campaignId: canonicalCampaignId,
          funnelId: funnelId || null,
          name: input.name?.trim() || "Unknown lead",
          email: input.email?.trim() || null,
          phone: input.phone?.trim() ? normalizePhone(input.phone) : null,
          stage: input.stage?.trim() || "generated",
          notes: input.notes?.trim() || null,
          smsConsent: input.smsConsent ?? null,
          smsConsentCopy: input.smsConsentCopy?.trim() || null,
          consentUrl: input.consentUrl?.trim() || null,
          utmSource: input.utmSource?.trim() || null,
          utmMedium: input.utmMedium?.trim() || null,
          utmCampaign: input.utmCampaign?.trim() || null,
          adId: input.adId?.trim() || null,
          landingPageUrl: input.landingPageUrl?.trim() || null,
          customAnswers: input.customAnswers ?? {},
        },
      },
      idempotencyKey: buildLeadRetryJobIdempotencyKey({
        requestId: input.requestId,
        campaignId: canonicalCampaignId,
        funnelId,
        email: input.email,
        phone: input.phone,
      }),
    });

    logWarn("Lead capture queued for retry", {
      requestId: input.requestId,
      campaignId: canonicalCampaignId,
      organizationId: context.organizationId,
      jobId: job.id,
      reason: input.failureReason,
    });

    return job;
  } catch (queueError) {
    logError("CRITICAL: Failed lead capture could not be queued", {
      requestId: input.requestId,
      campaignId,
      reason: input.failureReason,
      message: queueError instanceof Error ? queueError.message : "Unknown queue failure",
      code: "failed_lead_capture_queue_failed",
    });
    return null;
  }
}

async function getLeadById(supabase: SupabaseClient, leadId: string) {
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();

  if (error) {
    throw error;
  }

  return (data as LeadRow | null) ?? null;
}

async function getLeadByPhone(
  supabase: SupabaseClient | AdminClient,
  organizationId: string | null,
  phone: string,
) {
  let query = supabase
    .from("leads")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return (data as LeadRow | null) ?? null;
}

async function findRecentDuplicateLead(params: {
  supabase: SupabaseClient | AdminClient;
  organizationId: string;
  campaignId: string | null;
  email: string | null;
  phone: string | null;
  dedupeHash?: string | null;
  skipRecentDuplicateFallback?: boolean;
}) {
  const { supabase, organizationId, campaignId, email, phone } = params;

  if (params.dedupeHash) {
    let dedupeQuery = supabase
      .from("leads")
      .select("*")
      .eq("dedupe_hash", params.dedupeHash)
      .eq("organization_id", organizationId);

    if (campaignId) {
      dedupeQuery = dedupeQuery.eq("campaign_id", campaignId);
    }

    const { data, error } = await dedupeQuery.maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as LeadRow;
    }
  }

  if (params.skipRecentDuplicateFallback) {
    return null;
  }

  if (!campaignId || (!email && !phone)) {
    return null;
  }

  const createdAfter = new Date(Date.now() - 60_000).toISOString();
  const matches: LeadRow[] = [];

  if (email) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .ilike("email", email)
      .gte("created_at", createdAfter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      matches.push(data as LeadRow);
    }
  }

  if (phone) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .eq("phone", phone)
      .gte("created_at", createdAfter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      matches.push(data as LeadRow);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    const left = new Date(a.created_at ?? 0).getTime();
    const right = new Date(b.created_at ?? 0).getTime();
    return right - left;
  });

  return matches[0] ?? null;
}

async function listLeadMessages(supabase: SupabaseClient | AdminClient, leadId: string) {
  const { data, error } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as LeadMessageRow[] | null) ?? [];
}

async function saveLeadMessage(
  supabase: SupabaseClient | AdminClient,
  leadId: string,
  direction: "inbound" | "outbound",
  message: string,
  options: {
    providerMessageId?: string | null;
    deliveryStatus?: "received" | "sent" | "failed" | "recorded";
    errorMessage?: string | null;
  } = {},
) {
  const row = {
    lead_id: leadId,
    direction,
    message,
    provider_message_id: options.providerMessageId ?? null,
    delivery_status:
      options.deliveryStatus ?? (direction === "inbound" ? "received" : "recorded"),
    error_message: options.errorMessage ?? null,
    created_at: new Date().toISOString(),
  } as never;
  const query = options.providerMessageId?.trim()
    ? supabase.from("lead_messages").upsert(row, {
        onConflict: "provider_message_id",
        ignoreDuplicates: true,
      })
    : supabase.from("lead_messages").insert(row);
  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function sendLeadSMS(lead: LeadRow, message: string, reason: string) {
  if (!lead.phone) {
    throw new ApiError(400, "Lead is missing a phone number.", "lead_phone_missing");
  }

  return sendSMS(lead.phone, message, {
    consentMetadata: lead.consent_metadata,
    smsOptedOutAt: lead.sms_opted_out_at,
    reason,
  });
}

const MINIMUM_FOLLOW_UP_MESSAGE = "Just checking — are you still interested?";

async function ensureMinimumConversation(
  supabase: SupabaseClient | AdminClient,
  leadId: string,
) {
  const messages = (await listLeadMessages(supabase, leadId)) ?? [];

  if (
    (messages || []).length < 2 &&
    !messages.some(
      (message) =>
        message.direction === "outbound" && message.message === MINIMUM_FOLLOW_UP_MESSAGE,
    )
  ) {
    return messages;
  }

  return messages;
}

async function getLeadAppointment(
  supabase: SupabaseClient | AdminClient,
  leadId: string,
) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("lead_id", leadId)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AppointmentRow | null) ?? null;
}

function getOpeningMessage(location?: string | null) {
  const place = location?.trim() ? location.trim() : "your area";
  return `Hey, saw you were looking at homes in ${place} — are you currently looking to buy or just browsing?`;
}

function getUnavailableBookingReply() {
  return "I can help with next steps, but live booking availability is not set up yet. Want me to have someone reach out manually?";
}

function fallbackLeadResponse(
  lead: LeadRow,
  inboundMessage: string,
  history: LeadConversationMessage[],
): GeneratedLeadResponse {
  const message = inboundMessage.toLowerCase();
  const historyLength = history.filter((item) => item.direction === "inbound").length;

  let status: GeneratedLeadResponse["status"] = lead.status === "new" ? "engaged" : null;
  let budget: string | null = null;
  let timeline: string | null = null;
  let intent: string | null = null;
  let reply = "Got it. What price range are you trying to stay in, and how soon are you hoping to move?";

  const budgetMatch = inboundMessage.match(/\$?\s?(\d{3,7}(?:[.,]\d{1,3})?[kKmM]?)/);
  if (budgetMatch?.[1]) {
    budget = budgetMatch[1].replace(/\s+/g, "");
  }

  if (/soon|asap|right away|immediately|this month|now/.test(message)) {
    timeline = "immediate";
  } else if (/next few months|few months|3 months|90 days/.test(message)) {
    timeline = "next_90_days";
  }

  if (/buy|buyer|looking to buy|purchase/.test(message)) {
    intent = "buyer";
  } else if (/sell|seller|listing/.test(message)) {
    intent = "seller";
  } else if (/invest|rental|flip/.test(message)) {
    intent = "investor";
  } else if (/browsing|just looking|not serious/.test(message)) {
    intent = "browsing";
  }

  if (/not interested|stop|no thanks|wrong number/.test(message)) {
    status = "lost";
    reply = "Understood. I’ll close this out on our side. If you want to revisit later, just text back here.";
  } else if (historyLength >= 2 && (budget || timeline || intent === "buyer")) {
    status = "qualified";
    reply =
      "That helps. Want me to send you a few options that match what you're looking for, or connect you with someone to walk through next steps?";
  }

  return {
    reply,
    budget,
    timeline,
    intent,
    status,
    notes: null,
  };
}

export async function generateResponse(
  lead: LeadRow,
  conversationHistory: LeadConversationMessage[],
): Promise<GeneratedLeadResponse> {
  const latestInbound = [...conversationHistory]
    .reverse()
    .find((item) => item.direction === "inbound")?.message;

  if (!latestInbound) {
    return fallbackLeadResponse(lead, "", conversationHistory);
  }

  const ai = await generateAiJson([
    {
      role: "system",
      content:
        "You are an SMS-only real estate lead qualification assistant. Respond in valid JSON only with keys: reply, budget, timeline, intent, status, notes. Keep reply to 1-2 short sentences. Sound human and natural. Main goal: qualify budget, timeline, and intent, then move toward booking when interest is strong. Suggest times naturally, never overwhelm with more than 3 options, and confirm before booking. Never write long paragraphs. Allowed status values: engaged, qualified, unqualified, booked, lost, null.",
    },
    {
      role: "user",
      content: JSON.stringify({
        lead: {
          name: lead.name,
          status: lead.status,
          budget: lead.budget,
          timeline: lead.timeline,
          intent: lead.intent,
          notes: lead.notes,
        },
        latest_message: latestInbound,
        conversation_history: conversationHistory.map((item) => ({
          direction: item.direction,
          message: item.message,
        })),
      }),
    },
  ]);

  if (!ai.ok || !ai.content) {
    logWarn("Lead handler AI fallback", {
      reason: ai.error,
      leadId: lead.id,
    });
    return fallbackLeadResponse(lead, latestInbound, conversationHistory);
  }

  try {
    const parsed = JSON.parse(ai.content) as Partial<GeneratedLeadResponse>;
    const reply = typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : fallbackLeadResponse(lead, latestInbound, conversationHistory).reply;

    return {
      reply,
      budget: typeof parsed.budget === "string" && parsed.budget.trim() ? parsed.budget.trim() : null,
      timeline:
        typeof parsed.timeline === "string" && parsed.timeline.trim() ? parsed.timeline.trim() : null,
      intent: typeof parsed.intent === "string" && parsed.intent.trim() ? parsed.intent.trim() : null,
      status:
        parsed.status === "engaged" ||
        parsed.status === "qualified" ||
        parsed.status === "unqualified" ||
        parsed.status === "booked" ||
        parsed.status === "lost"
          ? parsed.status
          : null,
      notes: typeof parsed.notes === "string" && parsed.notes.trim() ? parsed.notes.trim() : null,
    };
  } catch {
    return fallbackLeadResponse(lead, latestInbound, conversationHistory);
  }
}

export async function handleNewLead(
  lead: LeadRow,
  client?: SupabaseClient | AdminClient,
) {
  const supabase = client ?? (await createRouteHandlerClient());

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  let location = "your area";

  if (lead.campaign_id) {
    const { data: campaignRaw } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", lead.campaign_id)
      .maybeSingle();
    const campaign = campaignRaw as Pick<CampaignPlanRow, "plan"> | null;
    const savedPlan = readCampaignPlanDocument(campaign?.plan);
    const strategy =
      savedPlan?.strategy && typeof savedPlan.strategy === "object" && !Array.isArray(savedPlan.strategy)
        ? (savedPlan.strategy as Record<string, unknown>)
        : null;
    const planSummary =
      savedPlan?.plan && typeof savedPlan.plan === "object" && !Array.isArray(savedPlan.plan)
        ? (savedPlan.plan as Record<string, unknown>)
        : null;
    const resolvedLocation =
      (typeof strategy?.location === "string" && strategy.location.trim()) ||
      (typeof planSummary?.market === "string" && planSummary.market.trim()) ||
      null;

    if (resolvedLocation) {
      location = resolvedLocation;
    }
  }

  const message = getOpeningMessage(location);

  if (!lead.phone) {
    throw new ApiError(400, "Lead is missing a phone number.", "lead_phone_missing");
  }

  let sentMessageId: string | null = null;
  let deliveryStatus: "sent" | "failed" = "sent";
  let deliveryError: string | null = null;

  try {
    const result = await sendLeadSMS(lead, message, "lead_opening");
    sentMessageId = result.sid;
  } catch (error) {
    deliveryStatus = "failed";
    deliveryError = error instanceof Error ? error.message : "Unknown error";
    logError("Lead opening SMS failed", {
      leadId: lead.id,
      message: deliveryError,
      code: error instanceof ApiError ? error.code : "lead_opening_sms_failed",
    });
  }

  await saveLeadMessage(supabase, lead.id, "outbound", message, {
    providerMessageId: sentMessageId,
    deliveryStatus,
    errorMessage: deliveryError,
  });
  await ensureMinimumConversation(supabase, lead.id);
}

export async function handleIncomingMessage(leadId: string, message: string) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const lead = await getLeadById(supabase, leadId);

  if (!lead) {
    throw new ApiError(404, "Lead not found.", "lead_not_found");
  }

  await saveLeadMessage(supabase, lead.id, "inbound", message);

  if (isSmsOptOutMessage(message)) {
    await markLeadSmsOptedOut(supabase, lead);
    await saveLeadMessage(
      supabase,
      lead.id,
      "outbound",
      "You have been unsubscribed and will not receive more messages.",
      { deliveryStatus: "recorded" },
    );
    return {
      leadId: lead.id,
      response: "You have been unsubscribed and will not receive more messages.",
      status: "lost" as const,
      slots: [] as string[],
    };
  }

  if (isSmsOptInMessage(message)) {
    await markLeadSmsOptedIn(supabase, lead);
    const reply =
      "You are subscribed again. Reply STOP to opt out or HELP for help. Message and data rates may apply.";
    await saveLeadMessage(supabase, lead.id, "outbound", reply, { deliveryStatus: "recorded" });
    return {
      leadId: lead.id,
      response: reply,
      status: normalizeLeadStatus(lead.status),
      slots: [] as string[],
    };
  }

  if (isSmsHelpMessage(message)) {
    const reply =
      "DealFlow OS lead updates: reply STOP to opt out, START to resume, or contact the business directly for help. Message and data rates may apply.";
    await saveLeadMessage(supabase, lead.id, "outbound", reply, { deliveryStatus: "recorded" });
    return {
      leadId: lead.id,
      response: reply,
      status: normalizeLeadStatus(lead.status),
      slots: [] as string[],
    };
  }

  if (lead.sms_opted_out_at) {
    return {
      leadId: lead.id,
      response: "You are unsubscribed. Reply START to resume messages.",
      status: normalizeLeadStatus(lead.status),
      slots: [] as string[],
    };
  }

  const conversation = (await listLeadMessages(supabase, lead.id)) ?? [];
  const metadata = getLeadMetadata(lead);
  const offeredSlots = metadata.booking?.status === "suggested"
    ? metadata.booking.offered_slots ?? []
    : [];

  if ((offeredSlots || []).length > 0) {
    const matchedSlot = parseTimeFromMessage(message, offeredSlots);

    if (matchedSlot) {
      const appointment = await bookAppointment(
        lead.id,
        lead.user_id,
        lead.campaign_id,
        matchedSlot,
        {
          supabase,
          organizationId: lead.organization_id,
          notes: "Booked via SMS auto-booking engine.",
        },
      );

      if (!appointment) {
        return {
          leadId: lead.id,
          response: "We couldn't confirm that booking yet.",
          status: lead?.status ?? "new",
        };
      }

      const reply = formatAppointmentConfirmationMessage(appointment.scheduled_at);

      let providerMessageId: string | null = null;
      let deliveryStatus: "sent" | "failed" = "sent";
      let deliveryError: string | null = null;

      try {
        const smsResult = await sendLeadSMS(lead, reply, "booking_confirmation");
        providerMessageId = smsResult.sid;
      } catch (error) {
        deliveryStatus = "failed";
        deliveryError = error instanceof Error ? error.message : "Unknown error";
        logError("Lead booking confirmation SMS failed", {
          leadId: lead.id,
          message: deliveryError,
        });
      }
      await saveLeadMessage(supabase, lead.id, "outbound", reply, {
        providerMessageId,
        deliveryStatus,
        errorMessage: deliveryError,
      });

      return {
        leadId: lead.id,
        response: reply,
        status: "booked" as const,
        slots: [] as string[],
      };
    }
  }

  const response = await generateResponse(lead, conversation);

  if (!lead.phone) {
    throw new ApiError(400, "Lead is missing a phone number.", "lead_phone_missing");
  }

  const shouldPromptBooking =
    (lead?.status ?? "new") !== "booked" &&
    (showsStrongBookingIntent(message) || response.status === "booked" || response.status === "qualified");

  let outboundReply = response.reply;
  let nextMetadata: Json | undefined = undefined;

  if (shouldPromptBooking) {
    const suggestedSlots = await generateSuggestedSlots(lead.user_id, supabase);

    if ((suggestedSlots || []).length > 0) {
      outboundReply = formatSuggestedSlotMessage(suggestedSlots);
      nextMetadata = withBookingMetadata(lead, {
        status: "suggested",
        offered_slots: suggestedSlots.map((slot) => slot.iso),
      });
    } else {
      outboundReply = getUnavailableBookingReply();
    }
  }

  let providerMessageId: string | null = null;
  let deliveryStatus: "sent" | "failed" = "sent";
  let deliveryError: string | null = null;

  try {
    const smsResult = await sendLeadSMS(lead, outboundReply, "lead_auto_reply");
    providerMessageId = smsResult.sid;
  } catch (error) {
    deliveryStatus = "failed";
    deliveryError = error instanceof Error ? error.message : "Unknown error";
    logError("Lead outbound SMS failed", {
      leadId: lead.id,
      message: deliveryError,
    });
  }
  await saveLeadMessage(supabase, lead.id, "outbound", outboundReply, {
    providerMessageId,
    deliveryStatus,
    errorMessage: deliveryError,
  });

  const nextStatus =
    response.status ??
    ((lead?.status ?? "new") === "new" ? "engaged" : normalizeLeadStatus(lead?.status ?? "new"));

  const { error } = await supabase
    .from("leads")
    .update({
      status: nextStatus,
      budget: response.budget ?? lead?.budget ?? null,
      timeline: response.timeline ?? lead.timeline,
      intent: response.intent ?? lead.intent,
      metadata: nextMetadata ?? lead.metadata,
      notes: response.notes
        ? [lead.notes, response.notes].filter(Boolean).join("\n")
        : lead.notes,
    } as never)
    .eq("id", lead.id);

  if (error) {
    throw error;
  }

  return {
    leadId: lead.id,
    response: outboundReply,
    status: nextStatus,
    slots: nextMetadata && typeof nextMetadata === "object" && "booking" in nextMetadata
      ? ((suggestedSlotsFromMetadata(nextMetadata) || []).slice(0, 3))
      : [],
  };
}

function suggestedSlotsFromMetadata(metadata: Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const booking = (metadata as Record<string, Json | undefined>).booking;
  if (!booking || typeof booking !== "object" || Array.isArray(booking)) {
    return [];
  }

  const offeredSlots = (booking as Record<string, Json | undefined>).offered_slots;
  return Array.isArray(offeredSlots)
    ? offeredSlots.filter((slot): slot is string => typeof slot === "string")
    : [];
}

type InboundSmsReceiptClaim = {
  provider_message_id: string;
  status: "processing" | "retrying" | "completed" | "operator_action_required";
  locked_by: string | null;
  lease_token: string | null;
  lease_generation: number;
  result: unknown;
};

type InboundSmsReceiptIdentity = {
  provider_message_id: string;
  organization_id: string;
  lead_id: string;
};

type IncomingSmsProcessingResult = {
  leadId: string;
  response: string;
  status: LeadRow["status"];
  slots?: string[];
  blocked?: boolean;
  idempotentReplay?: boolean;
};

async function claimInboundSmsReceipt(params: {
  admin: AdminClient;
  messageSid: string;
  organizationId: string;
  leadId: string;
  phone: string;
  message: string;
  workerId: string;
}) {
  const messageDigest = createHash("sha256")
    .update([
      params.organizationId,
      params.leadId,
      normalizePhone(params.phone) ?? params.phone.trim(),
      params.message,
    ].join("\n"))
    .digest("hex");
  const { data, error } = await (params.admin as any).rpc("claim_inbound_sms_receipt", {
    p_provider_message_id: params.messageSid,
    p_organization_id: params.organizationId,
    p_lead_id: params.leadId,
    p_message_digest: messageDigest,
    p_worker_id: params.workerId,
    p_lease_ms: 120_000,
  });

  if (error) {
    throw new ApiError(503, error.message, "inbound_sms_receipt_claim_failed");
  }

  const claim = (Array.isArray(data) ? data[0] : data) as InboundSmsReceiptClaim | null;
  if (!claim?.provider_message_id) {
    throw new ApiError(503, "Inbound SMS receipt was not returned.", "inbound_sms_receipt_missing");
  }

  return claim;
}

async function resolveInboundSmsLead(params: {
  admin: AdminClient;
  messageSid: string;
  organizationId: string;
  phone: string;
}) {
  const { data: existingReceiptData, error: receiptError } = await params.admin
    .from("inbound_sms_receipts")
    .select("provider_message_id, organization_id, lead_id")
    .eq("provider_message_id", params.messageSid)
    .maybeSingle();

  if (receiptError) {
    throw new ApiError(503, receiptError.message, "inbound_sms_receipt_lookup_failed");
  }

  const existingReceipt = existingReceiptData as InboundSmsReceiptIdentity | null;
  if (existingReceipt) {
    if (existingReceipt.organization_id !== params.organizationId) {
      throw new ApiError(
        409,
        "Inbound SMS receipt tenant identity does not match this destination.",
        "inbound_sms_receipt_operator_action_required",
      );
    }

    const { data: immutableLeadData, error: leadError } = await params.admin
      .from("leads")
      .select("*")
      .eq("id", existingReceipt.lead_id)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (leadError) {
      throw new ApiError(503, leadError.message, "inbound_sms_lead_lookup_failed");
    }

    if (!immutableLeadData) {
      throw new ApiError(
        409,
        "Inbound SMS receipt lead identity no longer resolves inside its tenant.",
        "inbound_sms_receipt_operator_action_required",
      );
    }

    return immutableLeadData as LeadRow;
  }

  return getLeadByPhone(params.admin, params.organizationId, params.phone);
}

function readCompletedInboundSmsResult(
  claim: InboundSmsReceiptClaim,
  expectedLeadId: string,
): IncomingSmsProcessingResult | null {
  if (!claim.result || typeof claim.result !== "object" || Array.isArray(claim.result)) {
    return null;
  }

  const result = claim.result as Record<string, unknown>;
  if (
    result.leadId !== expectedLeadId ||
    typeof result.response !== "string" ||
    typeof result.status !== "string"
  ) {
    return null;
  }

  return {
    leadId: expectedLeadId,
    response: result.response,
    status: normalizeLeadStatus(result.status),
    slots: Array.isArray(result.slots)
      ? result.slots.filter((slot): slot is string => typeof slot === "string").slice(0, 3)
      : [],
    blocked: result.blocked === true,
    idempotentReplay: true,
  };
}

async function settleInboundSmsReceipt(params: {
  admin: AdminClient;
  claim: InboundSmsReceiptClaim;
  workerId: string;
  status: "completed" | "retrying" | "operator_action_required";
  result?: IncomingSmsProcessingResult | null;
  errorCode?: string | null;
}) {
  if (!params.claim.lease_token || !params.claim.lease_generation) {
    return false;
  }

  const { data, error } = await (params.admin as any).rpc("settle_inbound_sms_receipt", {
    p_provider_message_id: params.claim.provider_message_id,
    p_worker_id: params.workerId,
    p_lease_token: params.claim.lease_token,
    p_lease_generation: params.claim.lease_generation,
    p_status: params.status,
    p_result: params.result ?? null,
    p_error_code: params.errorCode ?? null,
  });

  return !error && data === true;
}

async function completeInboundSmsComplianceReceipt(params: {
  admin: AdminClient;
  claim: InboundSmsReceiptClaim;
  workerId: string;
  leadId: string;
  action: "opt_out" | "opt_in" | "help";
}) {
  if (!params.claim.lease_token || !params.claim.lease_generation) {
    throw new ApiError(
      503,
      "Inbound SMS compliance lease is incomplete.",
      "inbound_sms_compliance_fence_missing",
    );
  }

  const { data, error } = await (params.admin as any).rpc(
    "complete_inbound_sms_compliance_receipt",
    {
      p_provider_message_id: params.claim.provider_message_id,
      p_worker_id: params.workerId,
      p_lease_token: params.claim.lease_token,
      p_lease_generation: params.claim.lease_generation,
      p_action: params.action,
    },
  );

  if (error) {
    throw new ApiError(503, error.message, "inbound_sms_compliance_apply_failed");
  }

  const completedClaim = (Array.isArray(data) ? data[0] : data) as InboundSmsReceiptClaim | null;
  if (!completedClaim || completedClaim.status !== "completed") {
    throw new ApiError(
      503,
      "Inbound SMS compliance completion lease was lost.",
      "inbound_sms_compliance_fence_lost",
    );
  }

  const completed = readCompletedInboundSmsResult(completedClaim, params.leadId);
  if (!completed) {
    throw new ApiError(
      503,
      "Inbound SMS compliance result is incomplete.",
      "inbound_sms_compliance_result_invalid",
    );
  }

  return completed;
}

export async function handleIncomingMessageByPhone(
  phone: string,
  message: string,
  options: {
    messageSid?: string | null;
    organizationId?: string | null;
  } = {},
) {
  const adminClient = createBookingAdminClient();

  if (!options.organizationId) {
    throw new ApiError(
      503,
      "Inbound SMS tenant mapping is not configured.",
      "sms_tenant_mapping_missing",
    );
  }

  const messageSid = options.messageSid?.trim() ?? "";
  if (!messageSid || messageSid.length > 128) {
    throw new ApiError(400, "MessageSid is required.", "inbound_sms_message_sid_missing");
  }

  const lead = await resolveInboundSmsLead({
    admin: adminClient,
    messageSid,
    organizationId: options.organizationId,
    phone,
  });

  if (!lead) {
    throw new ApiError(404, "Lead not found for incoming SMS.", "lead_not_found");
  }

  const workerId = `inbound-sms:${crypto.randomUUID()}`;
  const claim = await claimInboundSmsReceipt({
    admin: adminClient,
    messageSid,
    organizationId: options.organizationId,
    leadId: lead.id,
    phone,
    message,
    workerId,
  });

  if (claim.status === "completed") {
    const completed = readCompletedInboundSmsResult(claim, lead.id);
    if (!completed) {
      throw new ApiError(
        503,
        "Completed inbound SMS receipt is incomplete.",
        "inbound_sms_receipt_result_invalid",
      );
    }
    return completed;
  }

  if (claim.status === "operator_action_required") {
    throw new ApiError(
      409,
      "Inbound SMS receipt requires operator reconciliation.",
      "inbound_sms_receipt_operator_action_required",
    );
  }

  if (claim.status !== "processing" || claim.locked_by !== workerId || !claim.lease_token) {
    throw new ApiError(
      503,
      "Inbound SMS is already being processed and should be retried.",
      "inbound_sms_receipt_busy",
    );
  }

  const complianceAction = isSmsOptOutMessage(message)
    ? "opt_out"
    : isSmsOptInMessage(message)
      ? "opt_in"
      : isSmsHelpMessage(message)
        ? "help"
        : null;

  if (complianceAction) {
    return completeInboundSmsComplianceReceipt({
      admin: adminClient,
      claim,
      workerId,
      leadId: lead.id,
      action: complianceAction,
    });
  }

  // Automated lead conversations are intentionally unavailable. Persist only
  // the fenced receipt result: no AI, booking, lead mutation, provider call,
  // or synthetic outbound message row is allowed from this webhook path.
  const blockedResult: IncomingSmsProcessingResult = {
    leadId: lead.id,
    response: "",
    status: normalizeLeadStatus(lead.status),
    slots: [],
    blocked: true,
  };
  const settled = await settleInboundSmsReceipt({
    admin: adminClient,
    claim,
    workerId,
    status: "completed",
    result: blockedResult,
  });

  if (!settled) {
    throw new ApiError(
      503,
      "Inbound SMS blocked receipt completion lease was lost.",
      "inbound_sms_receipt_completion_fence_lost",
    );
  }

  return blockedResult;
}

export async function createLeadAndStartConversation(input: CreateLeadInput) {
  const { supabase, userId, organizationId } = await requireLeadContext();
  return createLeadAndStartConversationForContext(input, {
    supabase,
    userId,
    organizationId,
    campaignId: input.campaign_id?.trim() || null,
  });
}

async function createLeadAndStartConversationForContext(
  input: CreateLeadInput,
  context: {
    supabase: SupabaseClient | AdminClient;
    userId: string;
    organizationId: string;
    campaignId: string | null;
  },
  options?: {
    allowUnconsentedPhoneStorage?: boolean;
  },
) {
  const { supabase, userId, organizationId, campaignId } = context;

  const { firstName, lastName } = splitLeadName(input.name);
  const phoneRaw = input.phone?.trim() || null;
  const email = input.email?.trim() || null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const smsConsent = input.sms_consent === true;
  const dedupeHash = buildLeadDedupeHash({
    organizationId,
    campaignId,
    email,
    phone,
  });

  if (!phone && !email) {
    throw new ApiError(400, "An email or phone number is required.", "validation_error");
  }

  if (phone && !smsConsent && options?.allowUnconsentedPhoneStorage !== true) {
    throw new ApiError(
      400,
      "Explicit SMS consent is required when a phone number is submitted.",
      "sms_consent_required",
    );
  }

  const duplicateLead = await findRecentDuplicateLead({
    supabase,
    organizationId,
    campaignId,
    email,
    phone,
    dedupeHash,
    skipRecentDuplicateFallback: input.skip_recent_duplicate_fallback === true,
  });

  if (duplicateLead) {
    return duplicateLead;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      tenant_id: organizationId,
      user_id: userId,
      campaign_id: campaignId,
      name: input.name?.trim() || null,
      source: input.source?.trim() || "sms_campaign",
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      phone_raw: phoneRaw,
      phone_e164: phone,
      utm_source: input.utm_source?.trim() || null,
      utm_medium: input.utm_medium?.trim() || null,
      utm_campaign: input.utm_campaign?.trim() || null,
      ad_id: input.ad_id?.trim() || null,
      landing_page_url: input.landing_page_url?.trim() || null,
      dedupe_hash: dedupeHash,
      status: "new",
      notes: input.notes?.trim() || null,
      consent_metadata: buildSmsConsentMetadata({
        source: input.consent_source?.trim() || input.source?.trim() || "lead_capture",
        consented: smsConsent,
        phone,
        copy: input.sms_consent_copy,
        url: input.consent_url,
      }),
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.custom_answers && Object.keys(input.custom_answers).length > 0
          ? {
              custom_lead_answers: Object.entries(input.custom_answers).map(
                ([question, answer]) => ({ question, answer }),
              ),
            }
          : {}),
      } as Json,
      created_at: new Date().toISOString(),
    } as never)
    .select("*")
    .single();

  if (error) {
    if (
      dedupeHash &&
      (error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? ""))
    ) {
      let recoveryQuery = supabase
        .from("leads")
        .select("*")
        .eq("dedupe_hash", dedupeHash)
        .eq("organization_id", organizationId);

      if (campaignId) {
        recoveryQuery = recoveryQuery.eq("campaign_id", campaignId);
      }

      const { data: recovered } = await recoveryQuery.maybeSingle();

      if (recovered) {
        return recovered as LeadRow;
      }
    }

    logError("Lead insert failed", {
      message: error.message,
      code: error.code ?? null,
    });
    throw error;
  }

  if (!data) {
    throw new ApiError(500, "Lead could not be created.", "lead_create_failed");
  }

  const lead = data as LeadRow;

  if (lead.campaign_id && input.skip_lead_loop_verification !== true) {
    void markCampaignLeadLoopVerified({
      supabase,
      campaignId: lead.campaign_id,
    }).catch((error) => {
      logWarn("Lead loop verification update failed", {
        campaignId: lead.campaign_id,
        message: error instanceof Error ? error.message : "Unknown lead loop verification failure",
      });
    });
  }

  if (lead.phone) {
    logWarn("Lead conversation bootstrap skipped", {
      leadId: lead.id,
      reason: "lead_sms_automation_disabled_internal_notifications_only",
    });
  }

  return lead;
}

async function markCampaignLeadLoopVerified(params: {
  supabase: SupabaseClient | AdminClient;
  campaignId: string;
}) {
  const { data: campaignPlanData, error: campaignPlanError } = await params.supabase
    .from("campaign_plans")
    .select("plan, public_slug")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (campaignPlanError) {
    logWarn("Lead loop verification campaign lookup failed", {
      campaignId: params.campaignId,
      message: campaignPlanError.message,
    });
    return;
  }

  const campaignPlanRow =
    (campaignPlanData as Pick<CampaignPlanRow, "plan" | "public_slug"> | null) ?? null;
  const currentPlan = readCampaignPlanDocument(campaignPlanRow?.plan);
  const nextPlan = withLeadLoopVerified({
    ...currentPlan,
    public_slug: currentPlan.public_slug ?? campaignPlanRow?.public_slug ?? null,
  });

  const { error: leadLoopUpdateError } = await params.supabase
    .from("campaign_plans")
    .update(buildCampaignPlanCriticalFieldPatch(nextPlan) as never)
    .eq("id", params.campaignId);

  if (leadLoopUpdateError) {
    logWarn("Lead loop verification flag update failed", {
      campaignId: params.campaignId,
      message: leadLoopUpdateError.message,
    });
  }
}

export async function createPublicLeadAndStartConversation(input: CreateLeadInput) {
  const context = await resolvePublicLeadInsertContext(input);
  const supabase = await createPublicLeadInsertClient(context.userId);

  return createLeadAndStartConversationForContext(input, {
    supabase,
    userId: context.userId,
    organizationId: context.organizationId,
    campaignId: context.campaignId,
  });
}

export async function createVerifiedProviderLeadAndStartConversation(
  input: Omit<CreateLeadInput, "campaign_id" | "funnel_id">,
  context: {
    provider: "meta_leadgen";
    organizationId: string;
    userId: string;
    campaignId: string;
  },
) {
  const admin = await createPublicLeadLookupClient();
  const { data: campaign, error } = await admin
    .from("campaign_plans")
    .select("id,organization_id,user_id")
    .eq("id", context.campaignId)
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(503, error.message, "provider_lead_campaign_lookup_failed");
  }
  if (!campaign) {
    throw new ApiError(
      403,
      "Verified provider lead scope does not match the campaign tenant.",
      "provider_lead_campaign_scope_mismatch",
    );
  }

  return createLeadAndStartConversationForContext(
    {
      ...input,
      campaign_id: context.campaignId,
      consent_source: input.consent_source?.trim() || `${context.provider}_no_sms_consent`,
    },
    {
      supabase: admin,
      userId: context.userId,
      organizationId: context.organizationId,
      campaignId: context.campaignId,
    },
    {
      allowUnconsentedPhoneStorage: true,
    },
  );
}

export async function replayFailedPublicLeadCapture(input: PublicLeadCaptureRetryInput) {
  const payloadCampaignId = input.campaignId?.trim() ?? "";
  const resolvedContext = await resolvePublicLeadInsertContext({
    // A retry is fenced to the immutable campaign id captured at queue time.
    // Never resolve the mutable public funnel slug during replay.
    campaign_id: payloadCampaignId || undefined,
    funnel_id: null,
  });
  const replayScope = assertLeadRetryParentScope({
    expected: {
      organizationId: input.expectedOrganizationId,
      userId: input.expectedUserId,
      campaignId: input.expectedCampaignId,
    },
    resolved: {
      organizationId: resolvedContext.organizationId,
      userId: resolvedContext.userId,
      campaignId: resolvedContext.campaignId,
    },
  });
  const supabase = await createPublicLeadInsertClient(replayScope.userId);
  const retryNotes = [
    input.notes?.trim() || null,
    input.reason?.trim() ? `Recovered queued lead capture: ${input.reason.trim()}` : null,
    input.requestId?.trim() ? `Original request: ${input.requestId.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lead = await createLeadAndStartConversationForContext({
    campaign_id: replayScope.campaignId,
    funnel_id: null,
    name: input.name?.trim() || "Unknown lead",
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source: input.source?.trim() || "lead_capture_retry",
    notes: retryNotes || null,
    sms_consent: input.smsConsent === true,
    sms_consent_copy: input.smsConsentCopy ?? SMS_CONSENT_COPY,
    consent_source: "lead_capture_retry",
    consent_url: input.consentUrl ?? input.landingPageUrl ?? null,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    ad_id: input.adId ?? null,
    landing_page_url: input.landingPageUrl ?? input.consentUrl ?? null,
    custom_answers: input.customAnswers ?? {},
  }, {
    supabase,
    userId: replayScope.userId,
    organizationId: replayScope.organizationId,
    campaignId: replayScope.campaignId,
  });

  // A dedupe replay can return an existing row. Fence that row again before
  // queuing any durable effects so an inconsistent historical row cannot move
  // work across the parent job's tenant boundary.
  assertLeadRetryParentScope({
    expected: replayScope,
    resolved: {
      organizationId: lead.organization_id,
      userId: lead.user_id,
      campaignId: lead.campaign_id,
    },
  });

  if (!lead.organization_id || !lead.user_id || !lead.campaign_id) {
    throw new ApiError(
      409,
      "Recovered lead is missing the tenant or campaign scope required for durable effects.",
      "lead_recovery_scope_missing",
    );
  }

  const recoveryRequestId = input.requestId?.trim() || `lead-recovery:${lead.id}`;
  const sideEffectJob = await queueLeadSideEffectsJob({
    organizationId: lead.organization_id,
    userId: lead.user_id,
    campaignId: lead.campaign_id,
    payload: {
      requestId: recoveryRequestId,
      lead: {
        ...lead,
        phone_raw: input.phone?.trim() || lead.phone || null,
        phone_e164: lead.phone || null,
        lead_type: null,
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        ad_id: input.adId ?? null,
        landing_page_url: input.landingPageUrl ?? input.consentUrl ?? null,
      },
      metaConversion: {
        organizationId: lead.organization_id,
        leadId: lead.id,
        campaignId: lead.campaign_id,
        eventSourceUrl: input.landingPageUrl ?? input.consentUrl ?? null,
        eventTime: lead.created_at,
        name: lead.name,
        email: input.email,
        phone: input.phone,
        clientIp: null,
        clientUserAgent: null,
        fbp: null,
        fbc: null,
      },
    },
  });

  return {
    leadId: lead.id,
    campaignId: lead.campaign_id,
    organizationId: lead.organization_id,
    dedupeHash: lead.dedupe_hash,
    status: lead.status,
    source: lead.source,
    sideEffectJobId: sideEffectJob.id,
  };
}

export async function findLeadByPhoneForOrganization(phone: string, organizationId: string) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  return getLeadByPhone(supabase, organizationId, phone);
}

export async function getLeadConversation(leadId: string): Promise<LeadWithMessages | null> {
  const { supabase } = await requireLeadContext();
  const client: SupabaseClient = supabase;
  let lead = await getLeadById(client, leadId);

  if (!lead) {
    return null;
  }

  const messages = await ensureMinimumConversation(client, lead.id);
  const appointment = await getLeadAppointment(client, lead.id);

  return {
    lead,
    messages,
    appointment,
  };
}

export async function getLeadInbox() {
  const { supabase, organizationId } = await requireLeadContext();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data as LeadRow[] | null) ?? [];
}
