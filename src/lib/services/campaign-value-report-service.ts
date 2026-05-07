import "server-only";

import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  buildCampaignProgressReport,
  type CampaignValueReport,
} from "@/lib/services/campaign-value-report-builder";
import type { CampaignAnalysisResult } from "@/lib/services/ai-optimizer";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { DashboardMetrics } from "@/lib/services/dashboard-service";
import type { FirstWeekSuccessState } from "@/lib/services/first-week-success-service";
import type { MetaConnectionState, MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";

type ReportRow = {
  organization_id: string | null;
  campaign_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  report_key: string | null;
  status: string | null;
};

type CampaignRow = {
  id: string;
  organization_id: string | null;
  created_at: string | null;
  launch_status: string | null;
  plan: unknown;
};

export type CampaignValueReportIssue = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  status: "open" | "monitoring" | "resolved";
  createdAt: string | null;
  route: string | null;
  rawReference: string;
};

export type { CampaignValueReport };

function isMissingReportTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /relation .*campaign_value_reports.* does not exist/i.test(error.message ?? "");
}

export async function buildAndPersistCampaignValueReport(params: {
  organizationId: string;
  userId: string | null;
  plan: CampaignPlan;
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  launchRecord?: CampaignLaunchRecord | null;
  metrics: DashboardMetrics;
  recentLeads?: Array<{ status: string | null; source: string | null; created_at: string }>;
  creativePerformanceSummary?: CreativePerformanceSummary | null;
  optimizerResult: CampaignAnalysisResult;
  nextActions: string[];
  selectedAdSummary?: { id: string; headline: string; primaryText: string } | null;
  leadLoopVerified?: boolean;
  firstWeekSuccess?: FirstWeekSuccessState | null;
}) {
  const report = buildCampaignProgressReport(params);
  const admin = createAdminClient();

  if (!admin) {
    return { report, persisted: false, skipped: "service_role_missing" as const };
  }

  const { error } = await (admin as any)
    .from("campaign_value_reports")
    .upsert(
      {
        organization_id: params.organizationId,
        user_id: params.userId,
        campaign_id: params.plan.id,
        report_type: report.reportType,
        report_key: report.reportKey,
        period_start: report.periodStart,
        period_end: report.periodEnd,
        status: report.status === "needs_attention" ? "review_needed" : "generated",
        summary: report as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,campaign_id,report_key",
      },
    );

  if (error) {
    if (isMissingReportTable(error)) {
      return { report, persisted: false, skipped: "report_table_missing" as const };
    }

    logWarn("campaign_value_report_persist_failed", {
      organizationId: params.organizationId,
      campaignId: params.plan.id,
      reportKey: report.reportKey,
      message: error.message,
    });
    return { report, persisted: false, skipped: "write_failed" as const };
  }

  return { report, persisted: true, skipped: null };
}

function campaignHasValueFoundation(campaign: CampaignRow) {
  const plan = campaign.plan && typeof campaign.plan === "object" && !Array.isArray(campaign.plan)
    ? campaign.plan as Record<string, unknown>
    : {};

  return Boolean(plan.onboarding_idempotency_key || plan.funnel || plan.campaign_payload || campaign.launch_status);
}

function buildIssue(params: {
  id: string;
  severity: CampaignValueReportIssue["severity"];
  title: string;
  detail: string;
  createdAt: string | null;
  campaignId: string;
}) {
  return {
    id: params.id,
    severity: params.severity,
    title: params.title,
    detail: params.detail,
    status: params.severity === "low" ? "monitoring" : "open",
    createdAt: params.createdAt,
    route: `/admin/launch-monitor?campaignId=${encodeURIComponent(params.campaignId)}`,
    rawReference: params.campaignId,
  } satisfies CampaignValueReportIssue;
}

export async function loadCampaignValueReportIssues(limit = 80): Promise<CampaignValueReportIssue[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  const [campaignsResult, reportsResult] = await Promise.all([
    admin
      .from("campaign_plans")
      .select("id,organization_id,created_at,launch_status,plan")
      .order("created_at", { ascending: false })
      .limit(300),
    (admin as any)
      .from("campaign_value_reports")
      .select("organization_id,campaign_id,created_at,updated_at,report_key,status")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  if (campaignsResult.error) {
    logWarn("campaign_value_report_issue_campaigns_fetch_failed", {
      message: campaignsResult.error.message,
    });
    return [];
  }

  if (reportsResult.error) {
    if (isMissingReportTable(reportsResult.error)) {
      return [];
    }

    logWarn("campaign_value_report_issue_reports_fetch_failed", {
      message: reportsResult.error.message,
    });
    return [];
  }

  const reportsByCampaign = new Map<string, ReportRow[]>();

  for (const report of (reportsResult.data ?? []) as ReportRow[]) {
    if (!report.campaign_id) {
      continue;
    }

    const rows = reportsByCampaign.get(report.campaign_id) ?? [];
    rows.push(report);
    reportsByCampaign.set(report.campaign_id, rows);
  }

  const staleBeforeMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const issues: CampaignValueReportIssue[] = [];

  for (const campaign of (campaignsResult.data ?? []) as CampaignRow[]) {
    if (!campaign.organization_id || !campaignHasValueFoundation(campaign)) {
      continue;
    }

    const reports = reportsByCampaign.get(campaign.id) ?? [];
    const latestReport = reports
      .slice()
      .sort((first, second) => {
        const firstTime = new Date(first.updated_at ?? first.created_at ?? 0).getTime();
        const secondTime = new Date(second.updated_at ?? second.created_at ?? 0).getTime();
        return secondTime - firstTime;
      })[0] ?? null;

    if (!latestReport) {
      issues.push(buildIssue({
        id: `value_report:missing:${campaign.id}`,
        severity: "medium",
        title: "Retention gap: no campaign value report",
        detail: "This campaign has a generated foundation but no saved weekly value report snapshot yet.",
        createdAt: campaign.created_at,
        campaignId: campaign.id,
      }));
      continue;
    }

    const latestTime = new Date(latestReport.updated_at ?? latestReport.created_at ?? 0).getTime();
    if (Number.isFinite(latestTime) && latestTime < staleBeforeMs) {
      issues.push(buildIssue({
        id: `value_report:stale:${campaign.id}`,
        severity: "low",
        title: "Retention gap: stale campaign value report",
        detail: "This campaign has not refreshed its customer-facing value report in more than 8 days.",
        createdAt: latestReport.updated_at ?? latestReport.created_at,
        campaignId: campaign.id,
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
