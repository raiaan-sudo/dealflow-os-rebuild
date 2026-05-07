import "server-only";

import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateCampaignEntitlements } from "@/lib/services/campaign-entitlements";
import type { LaunchMonitorRow, OperatorIssueRow } from "@/lib/services/internal-launch-monitor";

type ChecklistStatus = "done" | "due" | "upcoming" | "blocked";

type BillingRow = {
  organization_id: string | null;
  plan_tier: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type ChecklistRow = {
  organization_id: string | null;
  campaign_id: string | null;
  onboarding_reviewed_at: string | null;
  creative_qa_completed_at: string | null;
  preview_reviewed_at: string | null;
  billing_verified_at: string | null;
  meta_connected_verified_at: string | null;
  assets_selected_verified_at: string | null;
  launch_readiness_verified_at: string | null;
  lead_loop_verified_at: string | null;
  day_7_check_in_completed_at: string | null;
  day_14_value_proof_completed_at: string | null;
  day_25_renewal_risk_review_completed_at: string | null;
  risk_level: "normal" | "watch" | "at_risk" | "blocked" | null;
  owner_note: string | null;
  updated_at: string | null;
};

type ActivationRow = {
  campaign_id: string | null;
  event_name: string | null;
  occurred_at: string | null;
};

export type CustomerSuccessChecklistItem = {
  key:
    | "onboarding_review"
    | "creative_qa"
    | "preview_reviewed"
    | "billing_active"
    | "meta_connected"
    | "assets_selected"
    | "launch_readiness"
    | "lead_loop_verified"
    | "day_7_check_in"
    | "day_14_value_proof"
    | "day_25_renewal_risk_review";
  label: string;
  status: ChecklistStatus;
  detail: string;
  dueAt: string | null;
};

export type CustomerSuccessChecklist = {
  campaignId: string;
  organizationLabel: string;
  userLabel: string;
  createdAt: string | null;
  riskLevel: "normal" | "watch" | "at_risk" | "blocked";
  completedCount: number;
  totalCount: number;
  dueCount: number;
  overdueCount: number;
  nextDueLabel: string;
  nextDueAt: string | null;
  ownerNote: string | null;
  route: string;
  items: CustomerSuccessChecklistItem[];
};

function isMissingChecklistTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /relation .*customer_success_checklists.* does not exist/i.test(error.message ?? "");
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function addDays(value: string | null, days: number) {
  const timestamp = parseTime(value);

  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function isDue(value: string | null, now: Date) {
  const timestamp = parseTime(value);
  return timestamp !== null && timestamp <= now.getTime();
}

function makeItem(params: {
  key: CustomerSuccessChecklistItem["key"];
  label: string;
  done: boolean;
  dueAt?: string | null;
  blocked?: boolean;
  detail: string;
  now: Date;
}): CustomerSuccessChecklistItem {
  let status: ChecklistStatus = "upcoming";

  if (params.done) {
    status = "done";
  } else if (params.blocked) {
    status = "blocked";
  } else if (!params.dueAt || isDue(params.dueAt, params.now)) {
    status = "due";
  }

  return {
    key: params.key,
    label: params.label,
    status,
    detail: params.detail,
    dueAt: params.dueAt ?? null,
  };
}

async function loadManualChecklistRows(campaignIds: string[]) {
  const admin = createAdminClient();
  const rowsByCampaign = new Map<string, ChecklistRow>();

  if (!admin || campaignIds.length === 0) {
    return rowsByCampaign;
  }

  const { data, error } = await (admin as any)
    .from("customer_success_checklists")
    .select("organization_id,campaign_id,onboarding_reviewed_at,creative_qa_completed_at,preview_reviewed_at,billing_verified_at,meta_connected_verified_at,assets_selected_verified_at,launch_readiness_verified_at,lead_loop_verified_at,day_7_check_in_completed_at,day_14_value_proof_completed_at,day_25_renewal_risk_review_completed_at,risk_level,owner_note,updated_at")
    .in("campaign_id", campaignIds);

  if (error) {
    if (!isMissingChecklistTable(error)) {
      logWarn("customer_success_checklist_lookup_failed", {
        message: error.message,
      });
    }
    return rowsByCampaign;
  }

  for (const row of (data ?? []) as ChecklistRow[]) {
    if (row.campaign_id) {
      rowsByCampaign.set(row.campaign_id, row);
    }
  }

  return rowsByCampaign;
}

async function loadBillingRows(organizationIds: string[]) {
  const admin = createAdminClient();
  const rowsByOrganization = new Map<string, BillingRow>();

  if (!admin || organizationIds.length === 0) {
    return rowsByOrganization;
  }

  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("organization_id,plan_tier,status,current_period_end,cancel_at_period_end")
    .in("organization_id", organizationIds);

  if (error) {
    logWarn("customer_success_billing_lookup_failed", {
      message: error.message,
    });
    return rowsByOrganization;
  }

  for (const row of (data ?? []) as BillingRow[]) {
    if (row.organization_id) {
      rowsByOrganization.set(row.organization_id, row);
    }
  }

  return rowsByOrganization;
}

async function loadActivationRows(campaignIds: string[]) {
  const admin = createAdminClient();
  const eventsByCampaign = new Map<string, Set<string>>();

  if (!admin || campaignIds.length === 0) {
    return eventsByCampaign;
  }

  const { data, error } = await admin
    .from("activation_events")
    .select("campaign_id,event_name,occurred_at")
    .in("campaign_id", campaignIds)
    .in("event_name", ["preview_generated_or_viewed", "dashboard_viewed", "launch_ready"]);

  if (error) {
    return eventsByCampaign;
  }

  for (const row of (data ?? []) as ActivationRow[]) {
    if (!row.campaign_id || !row.event_name) {
      continue;
    }

    const events = eventsByCampaign.get(row.campaign_id) ?? new Set<string>();
    events.add(row.event_name);
    eventsByCampaign.set(row.campaign_id, events);
  }

  return eventsByCampaign;
}

function deriveRisk(items: CustomerSuccessChecklistItem[], manualRisk: ChecklistRow["risk_level"] | null | undefined) {
  if (manualRisk && manualRisk !== "normal") {
    return manualRisk;
  }

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const dueCount = items.filter((item) => item.status === "due").length;

  if (blockedCount > 0) {
    return "blocked";
  }

  if (dueCount >= 3) {
    return "at_risk";
  }

  if (dueCount > 0) {
    return "watch";
  }

  return "normal";
}

function buildChecklist(params: {
  row: LaunchMonitorRow;
  manual: ChecklistRow | null;
  billing: BillingRow | null;
  activationEvents: Set<string>;
  now: Date;
}): CustomerSuccessChecklist {
  const { row, manual, billing, activationEvents, now } = params;
  const day7 = addDays(row.createdAt, 7);
  const day14 = addDays(row.createdAt, 14);
  const day25 = addDays(row.createdAt, 25);
  const entitlements = evaluateCampaignEntitlements({
    row: billing
      ? {
          plan_tier: billing.plan_tier,
          status: billing.status ?? "inactive",
          current_period_end: billing.current_period_end,
          cancel_at_period_end: billing.cancel_at_period_end ?? false,
        }
      : null,
  });
  const onboardingComplete = row.onboardingStatus === "completed";
  const creativeReady = row.creativeStatus !== "missing";
  const previewReviewed =
    Boolean(manual?.preview_reviewed_at) ||
    activationEvents.has("preview_generated_or_viewed") ||
    activationEvents.has("dashboard_viewed");
  const billingActive = entitlements.billingState === "active" || entitlements.billingState === "grace_period";
  const metaConnected =
    row.metaConnectionStatus.includes("connected") ||
    row.preflightStatus.includes("selection") ||
    row.preflightStatus.includes("passed");
  const assetsSelected = row.creativeStatus.includes("selected");
  const launchReady =
    activationEvents.has("launch_ready") ||
    (billingActive && metaConnected && assetsSelected && row.preflightStatus.includes("selection"));
  const leadLoopVerified = Boolean(manual?.lead_loop_verified_at) || row.leadLoopVerified;

  const items: CustomerSuccessChecklistItem[] = [
    makeItem({
      key: "onboarding_review",
      label: "Onboarding review",
      done: Boolean(manual?.onboarding_reviewed_at) || onboardingComplete,
      blocked: !onboardingComplete,
      detail: onboardingComplete ? "Onboarding is complete and ready for operator review." : "Onboarding has not completed yet.",
      now,
    }),
    makeItem({
      key: "creative_qa",
      label: "Creative QA",
      done: Boolean(manual?.creative_qa_completed_at) || (creativeReady && row.consistencyMissingFields.length === 0),
      blocked: !creativeReady,
      detail: creativeReady ? `Creative status: ${row.creativeStatus}.` : "Creative assets are not ready yet.",
      now,
    }),
    makeItem({
      key: "preview_reviewed",
      label: "Preview reviewed",
      done: previewReviewed,
      blocked: !creativeReady,
      detail: previewReviewed ? "Preview view/review evidence exists." : "Confirm the customer reached the preview moment.",
      now,
    }),
    makeItem({
      key: "billing_active",
      label: "Billing active",
      done: Boolean(manual?.billing_verified_at) || billingActive,
      blocked: entitlements.billingState === "suspended" || entitlements.billingState === "read_only",
      detail: `Billing state: ${entitlements.billingState}.`,
      now,
    }),
    makeItem({
      key: "meta_connected",
      label: "Meta connected",
      done: Boolean(manual?.meta_connected_verified_at) || metaConnected,
      blocked: false,
      detail: `Meta status: ${row.metaConnectionStatus}; preflight: ${row.preflightStatus}.`,
      now,
    }),
    makeItem({
      key: "assets_selected",
      label: "Assets selected",
      done: Boolean(manual?.assets_selected_verified_at) || assetsSelected,
      blocked: !creativeReady,
      detail: `Creative selection: ${row.creativeStatus}.`,
      now,
    }),
    makeItem({
      key: "launch_readiness",
      label: "Launch readiness",
      done: Boolean(manual?.launch_readiness_verified_at) || launchReady,
      blocked: !billingActive || !metaConnected || !assetsSelected,
      detail: launchReady ? "Launch readiness signal exists." : "Needs billing, Meta selection, and selected creative readiness.",
      now,
    }),
    makeItem({
      key: "lead_loop_verified",
      label: "Lead loop verified",
      done: leadLoopVerified,
      blocked: !launchReady,
      detail: leadLoopVerified ? "Lead loop is verified." : "Verify lead capture and internal alert loop before scale.",
      now,
    }),
    makeItem({
      key: "day_7_check_in",
      label: "Day 7 check-in due",
      done: Boolean(manual?.day_7_check_in_completed_at),
      dueAt: day7,
      blocked: false,
      detail: "Customer-success check-in should confirm setup clarity, campaign status, and next action.",
      now,
    }),
    makeItem({
      key: "day_14_value_proof",
      label: "Day 14 value proof due",
      done: Boolean(manual?.day_14_value_proof_completed_at),
      dueAt: day14,
      blocked: false,
      detail: "Show assets built, funnel/lead status, campaign status, and next recommendations.",
      now,
    }),
    makeItem({
      key: "day_25_renewal_risk_review",
      label: "Day 25 renewal-risk review due",
      done: Boolean(manual?.day_25_renewal_risk_review_completed_at),
      dueAt: day25,
      blocked: false,
      detail: "Review payment health, cancellation signals, support issues, and retention risk before renewal.",
      now,
    }),
  ];

  const completedCount = items.filter((item) => item.status === "done").length;
  const dueCount = items.filter((item) => item.status === "due" || item.status === "blocked").length;
  const overdueCount = items.filter((item) => item.dueAt && item.status !== "done" && isDue(item.dueAt, now)).length;
  const nextDue = items
    .filter((item) => item.status !== "done")
    .sort((first, second) => (parseTime(first.dueAt) ?? 0) - (parseTime(second.dueAt) ?? 0))[0] ?? null;

  return {
    campaignId: row.campaignId,
    organizationLabel: row.organizationLabel,
    userLabel: row.userLabel,
    createdAt: row.createdAt,
    riskLevel: deriveRisk(items, manual?.risk_level),
    completedCount,
    totalCount: items.length,
    dueCount,
    overdueCount,
    nextDueLabel: nextDue?.label ?? "Checklist complete",
    nextDueAt: nextDue?.dueAt ?? null,
    ownerNote: manual?.owner_note ?? null,
    route: `/admin/launch-monitor?campaignId=${encodeURIComponent(row.campaignId)}`,
    items,
  };
}

export async function loadCustomerSuccessChecklistRows(
  campaigns: LaunchMonitorRow[],
  limit = 24,
): Promise<CustomerSuccessChecklist[]> {
  const campaignIds = campaigns.map((row) => row.campaignId);
  const organizationIds = Array.from(new Set(campaigns.map((row) => row.organizationId).filter((value): value is string => Boolean(value))));
  const [manualRows, billingRows, activationRows] = await Promise.all([
    loadManualChecklistRows(campaignIds),
    loadBillingRows(organizationIds),
    loadActivationRows(campaignIds),
  ]);

  return campaigns
    .map((row) =>
      buildChecklist({
        row,
        manual: manualRows.get(row.campaignId) ?? null,
        billing: row.organizationId ? billingRows.get(row.organizationId) ?? null : null,
        activationEvents: activationRows.get(row.campaignId) ?? new Set<string>(),
        now: new Date(),
      }),
    )
    .sort((first, second) => {
      if (first.riskLevel !== second.riskLevel) {
        const order = { blocked: 0, at_risk: 1, watch: 2, normal: 3 };
        return order[first.riskLevel] - order[second.riskLevel];
      }

      return second.dueCount - first.dueCount;
    })
    .slice(0, limit);
}

export async function loadCustomerSuccessIssues(
  campaigns: LaunchMonitorRow[],
  limit = 40,
): Promise<Omit<OperatorIssueRow, "source">[]> {
  const checklists = await loadCustomerSuccessChecklistRows(campaigns, limit);

  return checklists
    .filter((checklist) => checklist.riskLevel !== "normal" || checklist.overdueCount > 0)
    .map((checklist) => ({
      id: `customer_success:${checklist.campaignId}`,
      severity:
        checklist.riskLevel === "blocked" || checklist.riskLevel === "at_risk"
          ? ("high" as const)
          : ("medium" as const),
      title: `Customer-success follow-up: ${checklist.organizationLabel}`,
      detail: `${checklist.completedCount}/${checklist.totalCount} checklist items complete. ${checklist.dueCount} items need attention. Next: ${checklist.nextDueLabel}.`,
      status: "monitoring" as const,
      createdAt: checklist.createdAt,
      route: checklist.route,
      rawReference: checklist.campaignId,
    }))
    .slice(0, limit);
}
