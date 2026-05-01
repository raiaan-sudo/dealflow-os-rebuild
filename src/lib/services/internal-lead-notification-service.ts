import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logOperationalEvent } from "@/lib/logging";
import { formatPhoneForSms, normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/services/sms-service";

type LeadRecord = {
  id: string;
  organization_id?: string | null;
  tenant_id?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  source?: string | null;
  lead_type?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  ad_id?: string | null;
  landing_page_url?: string | null;
};

type AgentProfile = {
  id: string;
  tenant_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  company_name: string | null;
  brokerage_name: string | null;
  sms_notifications_enabled: boolean | null;
  active: boolean | null;
};

type AdminClient = SupabaseClient<any>;

function getAdminClientOrThrow() {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service-role client is not configured.");
  }

  return supabase as AdminClient;
}

function splitLeadName(lead: LeadRecord) {
  const first = lead.first_name?.trim();
  const last = lead.last_name?.trim();

  if (first || last) {
    return {
      firstName: first || "there",
      lastName: last || "",
      fullName: [first, last].filter(Boolean).join(" ") || "New lead",
    };
  }

  const parts = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);
  const fallbackFirst = parts[0] || "there";
  const fallbackLast = parts.slice(1).join(" ");

  return {
    firstName: fallbackFirst,
    lastName: fallbackLast,
    fullName: [fallbackFirst, fallbackLast].filter(Boolean).join(" "),
  };
}

function titleCaseLeadType(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "buyer") {
    return "Buyer";
  }

  if (normalized === "seller") {
    return "Seller";
  }

  return "New";
}

function campaignInterest(lead: LeadRecord) {
  return lead.campaign_name?.trim() || "their inquiry";
}

function buildLeadAlertSms(lead: LeadRecord) {
  const name = splitLeadName(lead);
  const leadType = titleCaseLeadType(lead.lead_type);
  const title = leadType === "New" ? "DealFlow: New Lead 🚀" : `DealFlow: New ${leadType} Lead 🚀`;
  const phone = formatPhoneForSms(lead.phone_e164 || lead.phone_raw || lead.phone || null);
  const email = lead.email?.trim() || "No email provided";

  return `${title}

${name.fullName}
${phone}
${email}

Interested in:
${campaignInterest(lead)}`;
}

function buildLeadReplyTemplateSms(lead: LeadRecord, agent: AgentProfile) {
  const name = splitLeadName(lead);
  const agentFirstName = agent.first_name?.trim() || "the team";
  const companyName =
    agent.company_name?.trim() ||
    agent.brokerage_name?.trim() ||
    "my team";

  return `Copy/paste reply for ${name.firstName}:

Hey ${name.firstName} — this is ${agentFirstName} from ${companyName}.

Saw you were interested in ${campaignInterest(lead)}.

Just put together something for you.

Want me to send it over?`;
}

async function getCampaignContext(params: {
  supabase: AdminClient;
  campaignId: string | null | undefined;
}) {
  if (!params.campaignId) {
    return null;
  }

  const { data, error } = await params.supabase
    .from("campaign_plans")
    .select("id, user_id, organization_id, business_name, client_name, plan")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as {
    id: string;
    user_id?: string | null;
    organization_id?: string | null;
    business_name?: string | null;
    client_name?: string | null;
    plan?: Record<string, unknown> | null;
  } | null) ?? null;
}

async function findEligibleAgent(params: {
  supabase: AdminClient;
  tenantId: string;
  preferredUserId?: string | null;
}) {
  let query = params.supabase
    .from("agent_profiles")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("active", true)
    .eq("sms_notifications_enabled", true)
    .not("phone_e164", "is", null)
    .order("created_at", { ascending: true });

  if (params.preferredUserId) {
    const { data, error } = await query.eq("user_id", params.preferredUserId).limit(1).maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as AgentProfile;
    }
  }

  const { data, error } = await params.supabase
    .from("agent_profiles")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("active", true)
    .eq("sms_notifications_enabled", true)
    .not("phone_e164", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AgentProfile | null) ?? null;
}

export async function upsertAgentProfile(params: {
  tenantId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneRaw: string;
  companyName: string;
}) {
  const supabase = getAdminClientOrThrow();
  const phoneE164 = normalizePhone(params.phoneRaw);

  const { error } = await supabase.from("agent_profiles").upsert(
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      first_name: params.firstName.trim(),
      last_name: params.lastName.trim(),
      email: params.email.trim().toLowerCase(),
      phone_raw: params.phoneRaw.trim(),
      phone_e164: phoneE164,
      company_name: params.companyName.trim(),
      brokerage_name: params.companyName.trim(),
      sms_notifications_enabled: Boolean(phoneE164),
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id" },
  );

  if (error) {
    throw error;
  }

  return { phoneE164 };
}

async function createAssignment(params: {
  supabase: AdminClient;
  tenantId: string;
  leadId: string;
  agentId: string | null;
  status: "assigned" | "failed";
}) {
  const { data, error } = await params.supabase
    .from("lead_assignments")
    .upsert(
      {
        tenant_id: params.tenantId,
        lead_id: params.leadId,
        agent_id: params.agentId,
        status: params.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as { id: string; agent_id: string | null };
}

async function updateLeadNotificationFields(params: {
  supabase: AdminClient;
  lead: LeadRecord;
  tenantId: string;
  campaignName: string | null;
}) {
  const name = splitLeadName(params.lead);
  const phoneRaw = params.lead.phone_raw ?? params.lead.phone ?? null;
  const phoneE164 = params.lead.phone_e164 ?? normalizePhone(phoneRaw);

  const { error } = await params.supabase
    .from("leads")
    .update({
      tenant_id: params.tenantId,
      first_name: name.firstName === "there" ? null : name.firstName,
      last_name: name.lastName || null,
      phone_raw: phoneRaw,
      phone_e164: phoneE164,
      campaign_name: params.campaignName,
      lead_type: params.lead.lead_type ?? null,
      utm_source: params.lead.utm_source ?? null,
      utm_medium: params.lead.utm_medium ?? null,
      utm_campaign: params.lead.utm_campaign ?? null,
      ad_id: params.lead.ad_id ?? null,
      landing_page_url: params.lead.landing_page_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.lead.id);

  if (error) {
    throw error;
  }
}

async function createFailedNotificationLog(params: {
  supabase: AdminClient;
  tenantId: string;
  leadId: string;
  purpose: "new_lead_alert" | "lead_reply_template";
  errorMessage: string;
}) {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await params.supabase
    .from("lead_notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("lead_id", params.leadId)
    .eq("purpose", params.purpose)
    .is("agent_id", null)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.id) {
    const { error } = await params.supabase
      .from("lead_notifications")
      .update({
        status: "failed",
        error_message: params.errorMessage,
        failed_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await params.supabase
    .from("lead_notifications")
    .insert({
      tenant_id: params.tenantId,
      lead_id: params.leadId,
      agent_id: null,
      channel: "sms",
      provider: "twilio",
      purpose: params.purpose,
      status: "failed",
      error_message: params.errorMessage,
      failed_at: now,
      updated_at: now,
    });

  if (error) {
    throw error;
  }
}

async function sendNotificationIfMissing(params: {
  tenantId: string;
  leadId: string;
  agent: AgentProfile;
  purpose: "new_lead_alert" | "lead_reply_template";
  body: string;
  mockOnly?: boolean;
}) {
  const result = await sendSms({
    to: params.agent.phone_e164,
    body: params.body,
    purpose: params.purpose,
    leadId: params.leadId,
    agentId: params.agent.id,
    tenantId: params.tenantId,
    mockOnly: params.mockOnly,
  });

  return result;
}

export async function notifyAssignedAgentOfNewLead(lead: LeadRecord) {
  const tenantId = lead.organization_id ?? lead.tenant_id ?? null;

  if (!tenantId || !lead.id) {
    logOperationalEvent("lead_notification.skipped", {
      reason: "missing_tenant_or_lead",
      leadId: lead.id ?? null,
    });
    return { notified: false, reason: "missing_tenant_or_lead" };
  }

  const supabase = getAdminClientOrThrow();
  const campaign = await getCampaignContext({
    supabase,
    campaignId: lead.campaign_id,
  });
  const campaignName =
    lead.campaign_name?.trim() ||
    campaign?.business_name?.trim() ||
    campaign?.client_name?.trim() ||
    null;
  const enrichedLead = {
    ...lead,
    tenant_id: tenantId,
    campaign_name: campaignName,
  };
  await updateLeadNotificationFields({
    supabase,
    lead,
    tenantId,
    campaignName,
  });
  const agent = await findEligibleAgent({
    supabase,
    tenantId,
    preferredUserId: campaign?.user_id ?? null,
  });

  if (!agent) {
    await createAssignment({
      supabase,
      tenantId,
      leadId: lead.id,
      agentId: null,
      status: "failed",
    });
    await createFailedNotificationLog({
      supabase,
      tenantId,
      leadId: lead.id,
      purpose: "new_lead_alert",
      errorMessage: "No eligible active agent with SMS notifications and phone_e164 was found.",
    });
    await createFailedNotificationLog({
      supabase,
      tenantId,
      leadId: lead.id,
      purpose: "lead_reply_template",
      errorMessage: "No eligible active agent with SMS notifications and phone_e164 was found.",
    });
    logOperationalEvent("lead_notification.no_eligible_agent", {
      tenantId,
      leadId: lead.id,
    });
    return { notified: false, reason: "no_eligible_agent" };
  }

  await createAssignment({
    supabase,
    tenantId,
    leadId: lead.id,
    agentId: agent.id,
    status: "assigned",
  });

  const mockOnly = lead.source === "lead_capture_load_test";
  const alert = await sendNotificationIfMissing({
    tenantId,
    leadId: lead.id,
    agent,
    purpose: "new_lead_alert",
    body: buildLeadAlertSms(enrichedLead),
    mockOnly,
  });
  const reply = await sendNotificationIfMissing({
    tenantId,
    leadId: lead.id,
    agent,
    purpose: "lead_reply_template",
    body: buildLeadReplyTemplateSms(enrichedLead, agent),
    mockOnly,
  });

  return {
    notified: alert.status === "sent" || reply.status === "sent",
    agentId: agent.id,
    alertStatus: alert.status,
    replyStatus: reply.status,
  };
}

export async function safeNotifyAssignedAgentOfNewLead(lead: LeadRecord) {
  try {
    return await notifyAssignedAgentOfNewLead(lead);
  } catch (error) {
    logError("internal_lead_notification_failed", {
      leadId: lead.id,
      tenantId: lead.organization_id ?? lead.tenant_id ?? null,
      message: error instanceof Error ? error.message : "Unknown notification failure",
    });
    return { notified: false, reason: "notification_exception" };
  }
}
