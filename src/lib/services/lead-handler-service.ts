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
import { createSystemJob } from "@/lib/services/system-job-service";
import { normalizePhone, sendSMS } from "@/lib/services/sms-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Database, Json } from "@/lib/supabase/types";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadMessageRow = Database["public"]["Tables"]["lead_messages"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type OrganizationMembershipRow =
  Database["public"]["Tables"]["organization_memberships"]["Row"];
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
};

export type PublicLeadCaptureRetryInput = {
  campaignId: string;
  funnelId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  notes: string | null;
  source?: string | null;
  requestId?: string | null;
  reason?: string | null;
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

async function requireLeadContext() {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  const { data: membershipRaw, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const membership = membershipRaw as Pick<OrganizationMembershipRow, "organization_id"> | null;

  if (membershipError || !membership?.organization_id) {
    throw new ApiError(400, "Organization membership is required.", "organization_missing");
  }

  return {
    supabase,
    userId: user.id,
    organizationId: membership.organization_id,
  };
}

async function resolvePublicLeadInsertContext(input: Pick<CreateLeadInput, "campaign_id" | "funnel_id">) {
  const admin = await createPublicLeadLookupClient();

  if (input.campaign_id?.trim()) {
    const { data, error } = await admin
      .from("campaign_plans")
      .select("id, owner_id, user_id")
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
      "id" | "owner_id" | "user_id"
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
    .select("id, owner_id, user_id")
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
    "id" | "owner_id" | "user_id"
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
  admin: AdminClient | SupabaseClient,
  row: Pick<CampaignPlanRow, "id" | "owner_id" | "user_id"> | null,
) {
  if (!row?.user_id && !row?.owner_id) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  if (row.owner_id) {
    return {
      organizationId: row.owner_id,
      userId: row.user_id ?? row.owner_id,
      campaignId: row.id,
    } satisfies LeadInsertContext;
  }

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", row.user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const organizationId =
    membership && typeof membership === "object" && "organization_id" in membership
      ? (membership as Record<string, unknown>).organization_id
      : null;

  if (membershipError || typeof organizationId !== "string" || !row.user_id) {
    throw new ApiError(404, "Campaign organization could not be resolved.", "campaign_context_missing");
  }

  return {
    organizationId,
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

    const job = await createSystemJob({
      organizationId: context.organizationId,
      userId: context.userId,
      campaignId: context.campaignId,
      kind: "lead_capture_retry",
      payload: {
        source: input.source?.trim() || "lead_capture_public",
        requestId: input.requestId,
        reason: input.failureReason,
        leadCapture: {
          campaignId,
          funnelId: funnelId || null,
          name: input.name?.trim() || "Unknown lead",
          email: input.email?.trim() || null,
          phone: input.phone?.trim() ? normalizePhone(input.phone) : null,
          stage: input.stage?.trim() || "generated",
          notes: input.notes?.trim() || null,
        },
      },
      idempotencyKey: buildLeadRetryJobIdempotencyKey({
        requestId: input.requestId,
        campaignId,
        funnelId,
        email: input.email,
        phone: input.phone,
      }),
    });

    logWarn("Lead capture queued for retry", {
      requestId: input.requestId,
      campaignId,
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
}) {
  const { supabase, organizationId, campaignId, email, phone } = params;

  if (params.dedupeHash) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("dedupe_hash", params.dedupeHash)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as LeadRow;
    }
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
  const { error } = await supabase.from("lead_messages").insert({
    lead_id: leadId,
    direction,
    message,
    provider_message_id: options.providerMessageId ?? null,
    delivery_status:
      options.deliveryStatus ?? (direction === "inbound" ? "received" : "recorded"),
    error_message: options.errorMessage ?? null,
    created_at: new Date().toISOString(),
  } as never);

  if (error) {
    throw error;
  }
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

  try {
    const result = await sendSMS(lead.phone, message);
    sentMessageId = result.sid;
  } catch (error) {
    logError("Lead opening SMS failed", {
      leadId: lead.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }

  await saveLeadMessage(supabase, lead.id, "outbound", message, {
    providerMessageId: sentMessageId,
    deliveryStatus: "sent",
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
    return {
      leadId: lead.id,
      response: "You have been unsubscribed and will not receive more messages.",
      status: "lost" as const,
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
        const smsResult = await sendSMS(lead.phone ?? "", reply);
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
    const smsResult = await sendSMS(lead.phone, outboundReply);
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

export async function handleIncomingMessageByPhone(phone: string, message: string) {
  const adminClient = createBookingAdminClient();

  const lead = await getLeadByPhone(adminClient, null, phone);

  if (!lead) {
    throw new ApiError(404, "Lead not found for incoming SMS.", "lead_not_found");
  }

  await saveLeadMessage(adminClient, lead.id, "inbound", message);

  if (isSmsOptOutMessage(message)) {
    await markLeadSmsOptedOut(adminClient, lead);
    return {
      leadId: lead.id,
      response: "You have been unsubscribed and will not receive more messages.",
      status: "lost" as const,
      slots: [] as string[],
    };
  }

  const conversation = (await listLeadMessages(adminClient, lead.id)) ?? [];
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
          supabase: adminClient,
          organizationId: lead.organization_id,
          notes: "Booked via Twilio SMS auto-booking engine.",
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
        const smsResult = await sendSMS(lead.phone ?? "", reply);
        providerMessageId = smsResult.sid;
      } catch (error) {
        deliveryStatus = "failed";
        deliveryError = error instanceof Error ? error.message : "Unknown error";
        logError("Lead booking confirmation SMS failed", {
          leadId: lead.id,
          message: deliveryError,
        });
      }
      await saveLeadMessage(adminClient, lead.id, "outbound", reply, {
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
    const suggestedSlots = await generateSuggestedSlots(lead.user_id, adminClient);

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
    const smsResult = await sendSMS(lead.phone, outboundReply);
    providerMessageId = smsResult.sid;
  } catch (error) {
    deliveryStatus = "failed";
    deliveryError = error instanceof Error ? error.message : "Unknown error";
    logError("Lead outbound SMS failed", {
      leadId: lead.id,
      message: deliveryError,
    });
  }
  await saveLeadMessage(adminClient, lead.id, "outbound", outboundReply, {
    providerMessageId,
    deliveryStatus,
    errorMessage: deliveryError,
  });

  const nextStatus =
    response.status ??
    ((lead?.status ?? "new") === "new" ? "engaged" : normalizeLeadStatus(lead?.status ?? "new"));

  const { error } = await adminClient
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
) {
  const { supabase, userId, organizationId, campaignId } = context;

  const { firstName, lastName } = splitLeadName(input.name);
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
  const dedupeHash = buildLeadDedupeHash({
    organizationId,
    campaignId,
    email,
    phone,
  });

  if (!phone && !email) {
    throw new ApiError(400, "An email or phone number is required.", "validation_error");
  }

  const duplicateLead = await findRecentDuplicateLead({
    supabase,
    organizationId,
    campaignId,
    email,
    phone,
    dedupeHash,
  });

  if (duplicateLead) {
    return duplicateLead;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      campaign_id: campaignId,
      name: input.name?.trim() || null,
      source: input.source?.trim() || "sms_campaign",
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      dedupe_hash: dedupeHash,
      status: "new",
      notes: input.notes?.trim() || null,
      consent_metadata: {
        source: input.source?.trim() || "lead_capture",
        captured_at: new Date().toISOString(),
        consent_copy:
          "By submitting, I agree to be contacted about this request. Message and data rates may apply. Reply STOP to opt out.",
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
      const { data: recovered } = await supabase
        .from("leads")
        .select("*")
        .eq("dedupe_hash", dedupeHash)
        .maybeSingle();

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

  if (lead.campaign_id) {
    const { data: campaignPlanData, error: campaignPlanError } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", lead.campaign_id)
      .maybeSingle();

    if (campaignPlanError) {
      logWarn("Lead loop verification campaign lookup failed", {
        campaignId: lead.campaign_id,
        message: campaignPlanError.message,
      });
    } else {
      const campaignPlanRow = (campaignPlanData as { plan?: unknown } | null) ?? null;
      const currentPlan = readCampaignPlanDocument(campaignPlanRow?.plan);
      const nextPlan = withLeadLoopVerified(currentPlan);

      const { error: leadLoopUpdateError } = await supabase
        .from("campaign_plans")
        .update(buildCampaignPlanCriticalFieldPatch(nextPlan) as never)
        .eq("id", lead.campaign_id);

      if (leadLoopUpdateError) {
        logWarn("Lead loop verification flag update failed", {
          campaignId: lead.campaign_id,
          message: leadLoopUpdateError.message,
        });
      }
    }
  }

  if (lead.phone) {
    try {
      await handleNewLead(lead, supabase);
    } catch (error) {
      logError("Lead conversation bootstrap failed", {
        leadId: lead.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return lead;
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

export async function replayFailedPublicLeadCapture(input: PublicLeadCaptureRetryInput) {
  const retryNotes = [
    input.notes?.trim() || null,
    input.reason?.trim() ? `Recovered queued lead capture: ${input.reason.trim()}` : null,
    input.requestId?.trim() ? `Original request: ${input.requestId.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lead = await createPublicLeadAndStartConversation({
    campaign_id: input.campaignId?.trim() || undefined,
    funnel_id: input.funnelId?.trim() || null,
    name: input.name?.trim() || "Unknown lead",
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source: input.source?.trim() || "lead_capture_retry",
    notes: retryNotes || null,
  });

  return {
    leadId: lead.id,
    campaignId: lead.campaign_id,
    organizationId: lead.organization_id,
    dedupeHash: lead.dedupe_hash,
    status: lead.status,
    source: lead.source,
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
