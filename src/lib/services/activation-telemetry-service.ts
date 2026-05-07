import "server-only";

import { ApiError } from "@/lib/api/route";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";

export const ACTIVATION_EVENT_NAMES = [
  "signup_session_initialized",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "campaign_plan_persisted",
  "preview_generated_or_viewed",
  "paywall_viewed",
  "checkout_started",
  "checkout_completed_or_reconciled",
  "dashboard_viewed",
  "meta_connect_started",
  "meta_selection_completed",
  "launch_ready",
] as const;

export type ActivationEventName = (typeof ACTIVATION_EVENT_NAMES)[number];

export type SafeActivationMetadata = Record<
  string,
  string | number | boolean | null | Array<string | number | boolean | null>
>;

type RawActivationEventRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  campaign_id: string | null;
  event_name: ActivationEventName;
  event_key: string;
  source: string;
  metadata: unknown;
  occurred_at: string;
  created_at: string;
};

type RawCampaignPlanRow = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  created_at: string | null;
  public_slug: string | null;
  launch_status: string | null;
};

type RawBillingRow = {
  organization_id: string | null;
  status: string | null;
  plan_tier: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type RawMarketingAccountRow = {
  organization_id: string | null;
  status: string | null;
  account_name: string | null;
  external_account_id: string | null;
  pixel_id: string | null;
  connection_metadata: unknown;
  last_sync_at: string | null;
};

export type ActivationStallIssue = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  status: "open" | "monitoring" | "resolved";
  createdAt: string | null;
  route: string | null;
  rawReference: string;
};

const FORBIDDEN_METADATA_KEY =
  /(?:email|phone|first.?name|last.?name|full.?name|name|address|token|secret|cookie|jwt|authorization|password|credential|api.?key|access.?token|refresh.?token|private.?key|pii)/i;
const MAX_METADATA_KEYS = 24;
const MAX_METADATA_STRING_LENGTH = 180;
const MAX_METADATA_ARRAY_LENGTH = 12;
const EVENT_NAME_SET = new Set<ActivationEventName>(ACTIVATION_EVENT_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMetadataKey(key: string) {
  return key.trim().replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 80);
}

function sanitizeMetadataValue(value: unknown): SafeActivationMetadata[string] | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    return value.slice(0, MAX_METADATA_STRING_LENGTH);
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item))
      .filter((item): item is string | number | boolean | null => item !== undefined && !Array.isArray(item));
    return sanitized.length > 0 ? sanitized : undefined;
  }

  return undefined;
}

export function sanitizeActivationMetadata(input: unknown): SafeActivationMetadata {
  if (!isRecord(input)) {
    return {};
  }

  const metadata: SafeActivationMetadata = {};

  for (const [rawKey, rawValue] of Object.entries(input).slice(0, MAX_METADATA_KEYS)) {
    const key = normalizeMetadataKey(rawKey);

    if (!key || FORBIDDEN_METADATA_KEY.test(key)) {
      continue;
    }

    const value = sanitizeMetadataValue(rawValue);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function normalizeEventKeyPart(value: unknown) {
  return String(value ?? "none")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "none";
}

function buildEventKey(params: {
  eventName: ActivationEventName;
  campaignId?: string | null;
  idempotencyKey?: string | null;
  metadata: SafeActivationMetadata;
}) {
  if (params.idempotencyKey?.trim()) {
    return normalizeEventKeyPart(params.idempotencyKey);
  }

  const scopedPart =
    params.metadata.stepKey ??
    params.metadata.route ??
    params.metadata.planTier ??
    params.metadata.mode ??
    params.metadata.sourceStage ??
    "default";

  return [
    normalizeEventKeyPart(params.eventName),
    normalizeEventKeyPart(params.campaignId ?? "workspace"),
    normalizeEventKeyPart(scopedPart),
  ].join(":");
}

function toActivationEventName(value: string): ActivationEventName {
  if (EVENT_NAME_SET.has(value as ActivationEventName)) {
    return value as ActivationEventName;
  }

  throw new ApiError(400, "Unsupported activation event.", "activation_event_unsupported");
}

function isMissingActivationTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /relation .*activation_events.* does not exist/i.test(error.message ?? "");
}

export async function recordActivationEvent(params: {
  organizationId: string;
  userId?: string | null;
  campaignId?: string | null;
  eventName: ActivationEventName;
  source?: string;
  metadata?: unknown;
  idempotencyKey?: string | null;
  occurredAt?: string | null;
}) {
  const admin = createAdminClient();

  if (!admin) {
    logWarn("activation_event_skipped_service_role_missing", {
      eventName: params.eventName,
      organizationId: params.organizationId,
      campaignId: params.campaignId ?? null,
    });
    return { recorded: false, skipped: "service_role_missing" as const };
  }

  const metadata = sanitizeActivationMetadata(params.metadata);
  const eventKey = buildEventKey({
    eventName: params.eventName,
    campaignId: params.campaignId,
    idempotencyKey: params.idempotencyKey,
    metadata,
  });

  const { error } = await (admin as any)
    .from("activation_events")
    .upsert(
      {
        organization_id: params.organizationId,
        user_id: params.userId ?? null,
        campaign_id: params.campaignId ?? null,
        event_name: params.eventName,
        event_key: eventKey,
        source: params.source ?? "app",
        metadata,
        occurred_at: params.occurredAt ?? new Date().toISOString(),
      },
      {
        onConflict: "organization_id,event_key",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    if (isMissingActivationTable(error)) {
      return { recorded: false, skipped: "activation_table_missing" as const };
    }

    logWarn("activation_event_record_failed", {
      eventName: params.eventName,
      organizationId: params.organizationId,
      campaignId: params.campaignId ?? null,
      message: error.message,
    });
    return { recorded: false, skipped: "write_failed" as const };
  }

  return { recorded: true, skipped: null };
}

export async function recordActivationEventForCurrentUser(params: {
  eventName: ActivationEventName;
  campaignId?: string | null;
  source?: string;
  metadata?: unknown;
  idempotencyKey?: string | null;
}) {
  const context = await getAppContext();

  if (!context) {
    return { recorded: false, skipped: "unauthenticated" as const };
  }

  return recordActivationEvent({
    organizationId: context.organization.id,
    userId: context.user.id,
    campaignId: params.campaignId ?? null,
    eventName: params.eventName,
    source: params.source,
    metadata: params.metadata,
    idempotencyKey: params.idempotencyKey,
  });
}

function eventNameFromInput(value: string) {
  return toActivationEventName(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function hasMetaSelection(account: RawMarketingAccountRow | null) {
  const metadata = asRecord(account?.connection_metadata) ?? {};
  const discovery = asRecord(metadata.asset_discovery) ?? {};
  return Boolean(
    account?.external_account_id &&
      (account.pixel_id || asString(metadata.pixel_id)) &&
      (asString(metadata.selected_page_id) || asString(metadata.page_id)) &&
      discovery.ready === true,
  );
}

function isBillingActive(row: RawBillingRow | null) {
  if (!row) {
    return false;
  }

  if (row.status === "active" || row.status === "trialing") {
    return true;
  }

  if (row.status === "canceled" && row.cancel_at_period_end && row.current_period_end) {
    return new Date(row.current_period_end).getTime() > Date.now();
  }

  return false;
}

function mostRecentEvent(
  events: RawActivationEventRow[],
  eventName: ActivationEventName,
) {
  return events.find((event) => event.event_name === eventName) ?? null;
}

function buildActivationIssue(params: {
  id: string;
  severity: ActivationStallIssue["severity"];
  title: string;
  detail: string;
  createdAt: string | null;
  campaignId?: string | null;
  rawReference: string;
}): ActivationStallIssue {
  return {
    id: params.id,
    severity: params.severity,
    title: params.title,
    detail: params.detail,
    status: params.severity === "low" ? "monitoring" : "open",
    createdAt: params.createdAt,
    route: params.campaignId
      ? `/admin/launch-monitor?campaignId=${encodeURIComponent(params.campaignId)}`
      : "/admin/command-center",
    rawReference: params.rawReference,
  };
}

export async function loadActivationStallIssues(limit = 80): Promise<ActivationStallIssue[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [eventsResult, campaignsResult, billingResult, accountsResult] = await Promise.all([
    (admin as any)
      .from("activation_events")
      .select("id,organization_id,user_id,campaign_id,event_name,event_key,source,metadata,occurred_at,created_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(1200),
    admin
      .from("campaign_plans")
      .select("id,organization_id,user_id,created_at,public_slug,launch_status")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("billing_subscriptions")
      .select("organization_id,status,plan_tier,current_period_end,cancel_at_period_end"),
    admin
      .from("marketing_accounts")
      .select("organization_id,status,account_name,external_account_id,pixel_id,last_sync_at,connection_metadata")
      .eq("platform", "meta_ads"),
  ]);

  if (eventsResult.error) {
    if (isMissingActivationTable(eventsResult.error)) {
      return [];
    }

    logWarn("activation_stall_events_fetch_failed", { message: eventsResult.error.message });
    return [];
  }

  if (campaignsResult.error) {
    logWarn("activation_stall_campaigns_fetch_failed", { message: campaignsResult.error.message });
    return [];
  }

  if (billingResult.error) {
    logWarn("activation_stall_billing_fetch_failed", { message: billingResult.error.message });
  }

  if (accountsResult.error) {
    logWarn("activation_stall_accounts_fetch_failed", { message: accountsResult.error.message });
  }

  const events = (eventsResult.data ?? []) as RawActivationEventRow[];
  const campaigns = (campaignsResult.data ?? []) as RawCampaignPlanRow[];
  const billingByOrg = new Map(
    ((billingResult.data ?? []) as RawBillingRow[])
      .filter((row) => row.organization_id)
      .map((row) => [row.organization_id as string, row]),
  );
  const accountByOrg = new Map(
    ((accountsResult.data ?? []) as RawMarketingAccountRow[])
      .filter((row) => row.organization_id)
      .map((row) => [row.organization_id as string, row]),
  );
  const eventsByCampaign = new Map<string, RawActivationEventRow[]>();
  const eventsByOrg = new Map<string, RawActivationEventRow[]>();

  for (const event of events) {
    if (event.campaign_id) {
      const scoped = eventsByCampaign.get(event.campaign_id) ?? [];
      scoped.push(event);
      eventsByCampaign.set(event.campaign_id, scoped);
    }

    const orgEvents = eventsByOrg.get(event.organization_id) ?? [];
    orgEvents.push(event);
    eventsByOrg.set(event.organization_id, orgEvents);
  }

  const issues: ActivationStallIssue[] = [];

  for (const campaign of campaigns) {
    const campaignEvents = eventsByCampaign.get(campaign.id) ?? [];
    const orgEvents = campaign.organization_id ? eventsByOrg.get(campaign.organization_id) ?? [] : [];
    const allEvents = [...campaignEvents, ...orgEvents];
    const createdAt = campaign.created_at;
    const createdAgeHours = createdAt
      ? (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000)
      : 0;
    const orgBilling = campaign.organization_id ? billingByOrg.get(campaign.organization_id) ?? null : null;
    const orgAccount = campaign.organization_id ? accountByOrg.get(campaign.organization_id) ?? null : null;

    if (
      createdAgeHours >= 1 &&
      allEvents.some((event) => event.event_name === "onboarding_started") &&
      !allEvents.some((event) => event.event_name === "onboarding_completed")
    ) {
      issues.push(buildActivationIssue({
        id: `activation:incomplete_onboarding:${campaign.id}`,
        severity: createdAgeHours >= 24 ? "high" : "medium",
        title: "Activation stall: incomplete onboarding",
        detail: "A user started onboarding but has not completed the durable onboarding event. Customer success should check whether setup is blocked.",
        createdAt: mostRecentEvent(allEvents, "onboarding_started")?.occurred_at ?? createdAt,
        campaignId: campaign.id,
        rawReference: campaign.id,
      }));
    }

    if (
      isBillingActive(orgBilling) &&
      !allEvents.some((event) => event.event_name === "dashboard_viewed")
    ) {
      issues.push(buildActivationIssue({
        id: `activation:paid_no_dashboard_preview:${campaign.id}`,
        severity: "high",
        title: "Activation stall: paid but no dashboard preview",
        detail: "Billing is active, but the workspace has not recorded a dashboard preview view. Confirm the post-checkout handoff and follow up.",
        createdAt: orgBilling?.current_period_end ?? createdAt,
        campaignId: campaign.id,
        rawReference: campaign.organization_id ?? campaign.id,
      }));
    }

    if (
      allEvents.some((event) => event.event_name === "campaign_plan_persisted") &&
      !allEvents.some((event) => event.event_name === "meta_connect_started" || event.event_name === "meta_selection_completed")
    ) {
      issues.push(buildActivationIssue({
        id: `activation:campaign_no_meta:${campaign.id}`,
        severity: createdAgeHours >= 24 ? "high" : "medium",
        title: "Activation stall: campaign generated but no Meta connect",
        detail: "The campaign has been generated, but no Meta connection step has been recorded. This is the key gap before launch readiness.",
        createdAt: mostRecentEvent(allEvents, "campaign_plan_persisted")?.occurred_at ?? createdAt,
        campaignId: campaign.id,
        rawReference: campaign.id,
      }));
    }

    if (
      (allEvents.some((event) => event.event_name === "meta_selection_completed") || hasMetaSelection(orgAccount)) &&
      !allEvents.some((event) => event.event_name === "launch_ready")
    ) {
      issues.push(buildActivationIssue({
        id: `activation:meta_no_launch_ready:${campaign.id}`,
        severity: "medium",
        title: "Activation stall: Meta connected but not launch-ready",
        detail: "Meta selections are present, but no launch-ready event has been recorded. Review billing, preflight, and selected creative state.",
        createdAt: mostRecentEvent(allEvents, "meta_selection_completed")?.occurred_at ?? orgAccount?.last_sync_at ?? createdAt,
        campaignId: campaign.id,
        rawReference: campaign.id,
      }));
    }
  }

  return issues
    .sort((first, second) => {
      const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
      const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
      return secondTime - firstTime;
    })
    .slice(0, limit);
}

export function parseActivationEventName(value: string) {
  return eventNameFromInput(value);
}
