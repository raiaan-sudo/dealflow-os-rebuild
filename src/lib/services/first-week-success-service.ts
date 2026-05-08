import type { MetaConnectionState, MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";
import {
  buildCampaignPlanCriticalFieldPatch,
  readCampaignPlanDocument,
  withFirstWeekSuccess,
} from "@/lib/services/campaign-plan-document";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type RecentLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "first_name" | "last_name" | "email" | "phone" | "status" | "created_at"
>;

export type FirstWeekSuccessMilestoneKey =
  | "campaign_generated"
  | "meta_connected"
  | "preflight_passed"
  | "campaign_launched"
  | "funnel_live"
  | "traffic_check_pending"
  | "lead_loop_verified"
  | "first_lead_received";

export type FirstWeekSuccessMilestone = {
  key: FirstWeekSuccessMilestoneKey;
  label: string;
  status: "complete" | "pending";
  detail: string;
  verifiedAt: string | null;
};

export type FirstWeekLifecycleEvent = {
  key: "day_0_launch" | "day_1_active_check" | "day_3_performance_check" | "day_7_summary";
  label: string;
  status: "pending" | "complete";
  detail: string;
  targetAt: string | null;
  completedAt: string | null;
};

export type FirstWeekSuccessState = {
  currentStatus: string;
  nextMilestone: string;
  lastVerifiedAction: string;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  explanation: string;
  monitoring: string[];
  nextAction: string;
  milestones: FirstWeekSuccessMilestone[];
  lifecycleEvents: FirstWeekLifecycleEvent[];
  firstLead: {
    id: string;
    name: string;
    contact: string;
    receivedAt: string;
    recommendedFollowUp: string;
  } | null;
  leadLoopVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

function hoursFromLaunch(launchedAt: string | null) {
  if (!launchedAt) {
    return null;
  }

  const diffMs = Date.now() - new Date(launchedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 0;
  }

  return diffMs / 3_600_000;
}

function addHours(value: string | null, hours: number) {
  if (!value) {
    return null;
  }

  const base = new Date(value);
  if (Number.isNaN(base.getTime())) {
    return null;
  }

  return new Date(base.getTime() + hours * 3_600_000).toISOString();
}

function normalizeTimestamp(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getContactLabel(lead: RecentLead) {
  if (lead.email) {
    return lead.email;
  }

  if (lead.phone) {
    return lead.phone;
  }

  return "Contact info captured";
}

function getLeadName(lead: RecentLead) {
  const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  return fullName || "New lead";
}

export function buildFirstWeekSuccessState(params: {
  plan: CampaignPlan;
  metaConnection: MetaConnectionState;
  syncSnapshot: MetaCampaignSyncSnapshot | null;
  launchRecord: CampaignLaunchRecord | null;
  recentLeads: RecentLead[];
  leadLoopVerified: boolean;
  publicFunnelPublished?: boolean;
  publicFunnelPublishedAt?: string | null;
}): FirstWeekSuccessState {
  const now = new Date().toISOString();
  const syncTimestamp = normalizeTimestamp(
    params.syncSnapshot?.syncedAt ?? params.syncSnapshot?.lastSyncedAt ?? null,
  );
  const launchTimestamp =
    params.plan.runtime.launchedAt ??
    params.launchRecord?.createdAt ??
    params.plan.runtime.statusUpdatedAt ??
    null;
  const launchedHoursAgo = hoursFromLaunch(launchTimestamp);
  const hasMetaConnection = params.metaConnection.hasAccessToken;
  const hasSelections = Boolean(
    params.metaConnection.accountId &&
      params.metaConnection.pageId &&
      params.metaConnection.tracking.pixelId,
  );
  const hasPreflight =
    params.plan.runtime.status === "launch_ready" ||
    params.plan.runtime.status === "launching" ||
    params.plan.runtime.status === "live" ||
    params.plan.runtime.status === "active" ||
    params.plan.runtime.status === "learning" ||
    params.plan.runtime.status === "optimizing" ||
    params.plan.runtime.metaPushStatus === "published";
  const hasLaunch =
    params.plan.runtime.metaPushStatus === "published" ||
    params.plan.runtime.status === "live" ||
    params.plan.runtime.status === "active" ||
    params.plan.runtime.status === "learning" ||
    params.plan.runtime.status === "optimizing" ||
    Boolean(params.plan.runtime.campaignId);
  const hasFunnelLive = params.publicFunnelPublished === true;
  const hasTrafficSignals = Boolean(
    params.syncSnapshot?.deliveryMetrics &&
      (
        Number(params.syncSnapshot.deliveryMetrics.impressions ?? 0) > 0 ||
        Number(params.syncSnapshot.deliveryMetrics.clicks ?? 0) > 0 ||
        Number(params.syncSnapshot.deliveryMetrics.spend ?? 0) > 0
      ),
  );
  const firstLead = params.recentLeads[0] ?? null;
  const hasLead = Boolean(firstLead);

  const milestones: FirstWeekSuccessMilestone[] = [
    {
      key: "campaign_generated",
      label: "Campaign generated",
      status: "complete",
      detail: "Your campaign plan, funnel, and creative package were generated and saved.",
      verifiedAt: params.plan.createdAt,
    },
    {
      key: "meta_connected",
      label: "Meta connected",
      status: hasMetaConnection ? "complete" : "pending",
      detail: hasMetaConnection
        ? "Meta is connected and available for this campaign."
        : "Connect Meta so launch and delivery checks can begin.",
      verifiedAt: hasMetaConnection ? params.metaConnection.lastSyncAt ?? params.metaConnection.connectedAt ?? null : null,
    },
    {
      key: "preflight_passed",
      label: "Preflight passed",
      status: hasPreflight && hasSelections ? "complete" : "pending",
      detail: hasPreflight && hasSelections
        ? "Budget, selected assets, and launch requirements were verified before launch."
        : "Complete Meta asset selection and preflight before launch.",
      verifiedAt: hasPreflight ? params.plan.runtime.statusUpdatedAt ?? null : null,
    },
    {
      key: "campaign_launched",
      label: "Campaign launched",
      status: hasLaunch ? "complete" : "pending",
      detail: hasLaunch
        ? "The campaign was sent to Meta and local launch state was saved."
        : "The campaign has not been launched yet.",
      verifiedAt: hasLaunch ? launchTimestamp : null,
    },
    {
      key: "funnel_live",
      label: "Funnel live",
      status: hasFunnelLive ? "complete" : "pending",
      detail: hasFunnelLive
        ? "The public funnel is published and ready for traffic."
        : "Publish the public funnel before sending traffic to this campaign.",
      verifiedAt: hasFunnelLive ? params.publicFunnelPublishedAt ?? params.plan.createdAt : null,
    },
    {
      key: "traffic_check_pending",
      label: "Traffic check",
      status: hasTrafficSignals ? "complete" : "pending",
      detail: hasTrafficSignals
        ? "Traffic or spend signals have started arriving from Meta."
        : "The system is waiting for the first traffic or spend signals.",
      verifiedAt: hasTrafficSignals ? syncTimestamp : null,
    },
    {
      key: "lead_loop_verified",
      label: "Lead loop verified",
      status: params.leadLoopVerified ? "complete" : "pending",
      detail: params.leadLoopVerified
        ? "A real lead reached the system and was linked back to this campaign."
        : "Waiting for the first verified lead to prove the full loop.",
      verifiedAt: params.leadLoopVerified && firstLead ? firstLead.created_at : null,
    },
    {
      key: "first_lead_received",
      label: "First lead received",
      status: hasLead ? "complete" : "pending",
      detail: hasLead
        ? `${getLeadName(firstLead)} came in and is ready for follow-up.`
        : "No lead has arrived yet.",
      verifiedAt: hasLead ? firstLead.created_at : null,
    },
  ];

  const lifecycleEvents: FirstWeekLifecycleEvent[] = [
    {
      key: "day_0_launch",
      label: "Day 0 launch check",
      status: hasLaunch ? "complete" : "pending",
      detail: hasLaunch
        ? "Launch completed and the campaign entered post-launch monitoring."
        : "The campaign still needs to be launched.",
      targetAt: launchTimestamp,
      completedAt: hasLaunch ? launchTimestamp : null,
    },
    {
      key: "day_1_active_check",
      label: "Day 1 active check",
      status: hasTrafficSignals || (launchedHoursAgo !== null && launchedHoursAgo >= 24) ? "complete" : "pending",
      detail: hasTrafficSignals
        ? "Traffic signals arrived, so the funnel and campaign are actively being checked."
        : "We will confirm delivery signals during the first 24 hours after launch.",
      targetAt: addHours(launchTimestamp, 24),
      completedAt: hasTrafficSignals ? syncTimestamp : null,
    },
    {
      key: "day_3_performance_check",
      label: "Day 3 early performance check",
      status:
        (launchedHoursAgo !== null && launchedHoursAgo >= 72 && Boolean(syncTimestamp)) || hasLead
          ? "complete"
          : "pending",
      detail: hasLead
        ? "A lead already arrived, so the first-week performance check has useful signal."
        : "We will look for early spend, clicks, and landing-page response by day 3.",
      targetAt: addHours(launchTimestamp, 72),
      completedAt: hasLead ? firstLead?.created_at ?? null : launchedHoursAgo !== null && launchedHoursAgo >= 72 ? syncTimestamp : null,
    },
    {
      key: "day_7_summary",
      label: "Day 7 summary",
      status: launchedHoursAgo !== null && launchedHoursAgo >= 168 ? "complete" : "pending",
      detail:
        launchedHoursAgo !== null && launchedHoursAgo >= 168
          ? "The first-week summary window is open."
          : "The dashboard will summarize the first week once seven days have passed from launch.",
      targetAt: addHours(launchTimestamp, 168),
      completedAt: launchedHoursAgo !== null && launchedHoursAgo >= 168 ? now : null,
    },
  ];

  let currentStatus = "Campaign preview ready";
  let nextMilestone = "Connect Meta and launch";
  let lastVerifiedAction = "Campaign generated";
  let lastVerifiedAt: string | null = params.plan.createdAt;
  let explanation = "Your campaign preview is ready. The next step is to connect Meta and send traffic to the live funnel.";
  let monitoring = [
    "Meta connection and selected assets",
    "Launch status and campaign object creation",
    "Public funnel availability",
  ];
  let nextAction = "Connect Meta and launch the campaign.";

  if (hasMetaConnection && !hasLaunch) {
    currentStatus = "Ready to launch";
    nextMilestone = "Preflight and launch";
    lastVerifiedAction = "Meta connected";
    lastVerifiedAt = params.metaConnection.lastSyncAt ?? params.metaConnection.connectedAt ?? null;
    explanation = "Meta is connected. Once you launch, the system will watch for traffic and lead-loop proof.";
    nextAction = hasSelections
      ? "Run launch now."
      : "Select your ad account, Page, and pixel before launch.";
    monitoring = [
      "Selected ad account, Page, and pixel",
      "Launch preflight status",
      "Public funnel readiness",
    ];
  }

  if (hasLaunch && !hasTrafficSignals && !hasLead) {
    currentStatus = "Campaign launched, waiting for traffic";
    nextMilestone = "First traffic or spend signal";
    lastVerifiedAction = "Campaign launched";
    lastVerifiedAt = launchTimestamp;
    explanation = "The campaign is live, but early traffic can take time. The system is waiting for the first delivery signal before performance reporting becomes meaningful.";
    nextAction = "Let the campaign gather delivery data, then recheck Meta sync.";
    monitoring = [
      "Meta delivery and spend signals",
      "Public funnel availability",
      "Lead capture and first verified submission",
    ];
  }

  if (hasTrafficSignals && !hasLead) {
    currentStatus = "Traffic is arriving";
    nextMilestone = "First verified lead";
    lastVerifiedAction = "Traffic detected";
    lastVerifiedAt = syncTimestamp;
    explanation = "The campaign is delivering traffic. No lead has been verified yet, so the system is watching the funnel and lead capture path closely.";
    nextAction = params.leadLoopVerified
      ? "Keep monitoring delivery and watch for the first lead."
      : "Open the public funnel, test the form, and confirm lead capture is working.";
    monitoring = [
      "Impressions, clicks, and spend",
      "Lead form completion and API saves",
      "Lead-loop verification",
    ];
  }

  if (hasLead) {
    currentStatus = "First lead received";
    nextMilestone = launchedHoursAgo !== null && launchedHoursAgo >= 168 ? "First-week summary" : "Early performance review";
    lastVerifiedAction = "Lead received";
    lastVerifiedAt = firstLead?.created_at ?? null;
    explanation = "A lead has been captured from this campaign. The system has proof that the funnel and lead handling path are working.";
    nextAction = "Follow up with the lead quickly and review the early performance signals.";
    monitoring = [
      "Lead quality and follow-up speed",
      "Spend and click efficiency",
      "Additional lead volume over the first week",
    ];
  }

  return {
    currentStatus,
    nextMilestone,
    lastVerifiedAction,
    lastVerifiedAt,
    lastSyncAt: syncTimestamp,
    explanation,
    monitoring,
    nextAction,
    milestones,
    lifecycleEvents,
    firstLead: firstLead
      ? {
          id: firstLead.id,
          name: getLeadName(firstLead),
          contact: getContactLabel(firstLead),
          receivedAt: firstLead.created_at,
          recommendedFollowUp: "Call or text within 5 minutes, confirm intent, and offer the next appointment step.",
        }
      : null,
    leadLoopVerified: params.leadLoopVerified,
    createdAt: now,
    updatedAt: now,
  };
}

export async function persistFirstWeekSuccessState(params: {
  campaignId: string;
  state: FirstWeekSuccessState;
}) {
  const supabase = await createClient();

  if (!supabase) {
    return;
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", params.campaignId)
    .maybeSingle();

  const planRow = data as { plan?: unknown } | null;
  const rawPlan = readCampaignPlanDocument(planRow?.plan);
  const currentState =
    rawPlan.first_week_success &&
    typeof rawPlan.first_week_success === "object" &&
    !Array.isArray(rawPlan.first_week_success)
      ? JSON.stringify(rawPlan.first_week_success)
      : null;
  const nextState = JSON.stringify(params.state);

  if (currentState === nextState) {
    return;
  }

  const nextPlan = withFirstWeekSuccess(
    rawPlan,
    params.state as unknown as Record<string, unknown>,
  );

  await supabase
    .from("campaign_plans")
    .update(buildCampaignPlanCriticalFieldPatch(nextPlan) as never)
    .eq("id", params.campaignId);
}
