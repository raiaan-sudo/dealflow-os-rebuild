import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { safeNotifyAssignedAgentOfNewLead } from "@/lib/services/internal-lead-notification-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_LEAD_ID = "b4a75bd5-4208-42f2-99d4-7fd63ddd7c69";
const SAFE_CAMPAIGN_ID = "957014e8-870f-40e1-9f71-ea7256b09482";
const SAFE_ORGANIZATION_ID = "42e2ccc8-8515-48c3-b105-df531f82031d";
const SAFE_AGENT_ID = "aa197de9-deb6-4d8d-acbb-ee88602e5db4";
const SAFE_PHONE_E164 = "+15146635045";

const COUNTED_TABLES = [
  "leads",
  "system_jobs",
  "lead_crm_sync_events",
  "ghl_provisioning_jobs",
  "ghl_provisioning_events",
  "workspace_ghl_users",
  "creative_assets",
] as const;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type UntypedAdminClient = {
  from: (table: string) => any;
};

function db(admin: AdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function assertProofEnabled() {
  if (process.env.MARTINE_LEAD_SMS_RETRY_ENABLED !== "true") {
    throw new ApiError(404, "Martine lead SMS retry proof route is disabled.", "martine_lead_sms_retry_disabled");
  }

  if (process.env.INTERNAL_LEAD_SMS_ENABLED !== "true") {
    throw new ApiError(409, "Internal lead SMS notifications are still disabled.", "internal_lead_sms_disabled");
  }
}

async function readJsonLeadId(request: Request) {
  const payload = (await request.json().catch(() => null)) as { leadId?: unknown } | null;
  const leadId = typeof payload?.leadId === "string" ? payload.leadId.trim() : "";

  if (leadId !== SAFE_LEAD_ID) {
    throw new ApiError(400, "This proof route only retries the approved Martine lead.", "lead_not_approved_for_retry");
  }

  return leadId;
}

function getAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase service-role client is not configured.", "service_role_missing");
  }

  return admin;
}

async function countTables(admin: AdminClient) {
  const entries = await Promise.all(
    COUNTED_TABLES.map(async (table) => {
      const { count, error } = await db(admin).from(table).select("id", { count: "exact", head: true });

      if (error) {
        throw new ApiError(500, error.message, `${table}_count_failed`);
      }

      return [table, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<(typeof COUNTED_TABLES)[number], number>;
}

function diffCounts(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(
    COUNTED_TABLES.map((table) => [table, (after[table] ?? 0) - (before[table] ?? 0)]),
  );
}

function maskProviderMessageId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function readLead(admin: AdminClient, leadId: string) {
  const { data, error } = await db(admin)
    .from("leads")
    .select("id, organization_id, tenant_id, campaign_id, campaign_name, name, first_name, last_name, email, phone, phone_raw, phone_e164, source, lead_type, utm_source, utm_medium, utm_campaign, ad_id, landing_page_url")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "lead_lookup_failed");
  }

  if (!data) {
    throw new ApiError(404, "Approved lead was not found.", "lead_not_found");
  }

  if (data.organization_id !== SAFE_ORGANIZATION_ID || data.campaign_id !== SAFE_CAMPAIGN_ID) {
    throw new ApiError(409, "Approved lead no longer belongs to the expected Martine campaign.", "lead_context_mismatch");
  }

  return data;
}

async function readAgent(admin: AdminClient) {
  const { data, error } = await db(admin)
    .from("agent_profiles")
    .select("id, tenant_id, user_id, phone_e164, sms_notifications_enabled, active")
    .eq("id", SAFE_AGENT_ID)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "agent_lookup_failed");
  }

  if (!data) {
    throw new ApiError(404, "Martine lead alert agent profile was not found.", "agent_not_found");
  }

  if (
    data.tenant_id !== SAFE_ORGANIZATION_ID ||
    data.phone_e164 !== SAFE_PHONE_E164 ||
    data.sms_notifications_enabled !== true ||
    data.active !== true
  ) {
    throw new ApiError(409, "Martine lead alert agent profile is not configured for this proof.", "agent_context_mismatch");
  }

  return data;
}

async function readNotifications(admin: AdminClient, leadId: string) {
  const { data, error } = await db(admin)
    .from("lead_notifications")
    .select("id, lead_id, agent_id, purpose, status, provider_message_id, sent_at, delivered_at, failed_at, error_message")
    .eq("lead_id", leadId)
    .order("purpose", { ascending: true });

  if (error) {
    throw new ApiError(500, error.message, "lead_notification_lookup_failed");
  }

  return (Array.isArray(data) ? data : []).map((row) => ({
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    agentId: row.agent_id,
    providerMessageId: maskProviderMessageId(row.provider_message_id),
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    errorMessage: row.error_message,
  }));
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertProofEnabled();
    const leadId = await readJsonLeadId(request);
    const admin = getAdminClient();

    const [lead, agent, beforeCounts, beforeNotifications] = await Promise.all([
      readLead(admin, leadId),
      readAgent(admin),
      countTables(admin),
      readNotifications(admin, leadId),
    ]);

    const notificationResult = await safeNotifyAssignedAgentOfNewLead(lead);

    const [afterCounts, afterNotifications] = await Promise.all([
      countTables(admin),
      readNotifications(admin, leadId),
    ]);

    return apiSuccess({
      success: true,
      proof: "martine_real_lead_sms_retry",
      leadId,
      campaignId: SAFE_CAMPAIGN_ID,
      organizationId: SAFE_ORGANIZATION_ID,
      agent: {
        id: agent.id,
        phoneLast4: String(agent.phone_e164).slice(-4),
        smsNotificationsEnabled: agent.sms_notifications_enabled === true,
        active: agent.active === true,
      },
      notificationResult,
      notifications: {
        before: beforeNotifications,
        after: afterNotifications,
      },
      tableCountDeltas: diffCounts(beforeCounts, afterCounts),
      safety: {
        internalBearerRequired: true,
        envGate: "MARTINE_LEAD_SMS_RETRY_ENABLED",
        approvedLeadOnly: SAFE_LEAD_ID,
        realNotificationServiceUsed: true,
        createdLead: false,
        createdSystemJob: false,
        liveGhlCall: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        providerGeneration: false,
        provisioning: false,
        workflowEnrollment: false,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Martine lead SMS retry proof");
  }
}
