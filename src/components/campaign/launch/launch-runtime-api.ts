"use client";

import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import type {
  MetaCampaignSyncSnapshot,
  MetaConnectionState,
} from "@/lib/integrations/meta/types";
import type { CampaignActionSuggestion } from "@/lib/services/campaign-action-service";
import type { CampaignDraftAction } from "@/lib/services/campaign-draft-action-service";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { ExecutableCampaign } from "@/lib/services/campaign-execution-service";
import type { CampaignRuntime } from "@/lib/services/campaign-plan-service";

export type DeployResult = {
  success: true;
  mode: "demo" | "live";
  campaignId: string;
};

export async function postRuntimeUpdate(body: {
  action:
    | "launch"
    | "complete_launch"
    | "refresh"
    | "set_experience_status"
    | "set_guardrails"
    | "pause_campaign"
    | "resume_campaign"
    | "archive_campaign";
  campaign?: ExecutableCampaign;
  experienceStatus?: "connected" | "launch_ready" | "launching" | "live";
  budgetDailyInput?: number;
  launchMode?: "test" | "live";
  safetyState?: "ready" | "blocked";
  message?: string;
}) {
  const response = await fetchWithRetry("/api/campaign/runtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 8000,
    retries: 1,
  });

  if (!response.ok) {
    throw new Error("Campaign state could not be updated.");
  }

  return (await response.json()) as { runtime: CampaignRuntime | null };
}

export async function fetchRuntime() {
  const response = await fetchWithRetry("/api/campaign/runtime", {
    cache: "no-store",
    timeoutMs: 8000,
    retries: 1,
  });

  if (!response.ok) {
    throw new Error("Campaign runtime could not be loaded.");
  }

  return (await response.json()) as { runtime: CampaignRuntime | null };
}

export async function fetchMetaConnectionStatus() {
  const response = await fetchWithRetry("/api/integrations/meta/status", {
    cache: "no-store",
    timeoutMs: 8000,
    retries: 1,
  });

  const result = (await response.json().catch(() => null)) as
    | { connection?: MetaConnectionState; error?: string; action?: string }
    | null;

  if (!response.ok || !result?.connection) {
    throw new Error(
      [result?.error, result?.action].filter(Boolean).join(" ") ||
        "Meta connection status could not be loaded.",
    );
  }

  return result.connection;
}

export async function syncCampaignStatus() {
  const response = await fetchWithRetry("/api/integrations/meta/sync", {
    method: "POST",
    timeoutMs: 12000,
    retries: 1,
  });

  const result = (await response.json().catch(() => null)) as
    | { snapshot?: MetaCampaignSyncSnapshot | null; error?: string; action?: string }
    | null;

  if (!response.ok || !result?.snapshot) {
    throw new Error(
      [result?.error, result?.action].filter(Boolean).join(" ") ||
        "Campaign status sync failed.",
    );
  }

  return result.snapshot;
}

export async function fetchCampaignActions() {
  const response = await fetchWithRetry("/api/campaign/actions", {
    cache: "no-store",
    timeoutMs: 8000,
    retries: 1,
  });

  const result = (await response.json().catch(() => null)) as
    | { actions?: CampaignActionSuggestion[]; error?: string }
    | null;

  if (!response.ok || !result?.actions) {
    throw new Error(result?.error ?? "Campaign actions could not be loaded.");
  }

  return result.actions;
}

export async function fetchCreativePerformance() {
  const response = await fetchWithRetry("/api/campaign/creative-performance", {
    cache: "no-store",
    timeoutMs: 8000,
    retries: 1,
  });
  const result = (await response.json().catch(() => null)) as
    | { summary?: CreativePerformanceSummary | null; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(result?.error ?? "Creative performance could not be loaded.");
  }

  return result?.summary ?? null;
}

export async function updateCampaignAction(id: string, action: "approve" | "dismiss") {
  const response = await fetchWithRetry("/api/campaign/actions", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, status: action === "approve" ? "approved" : "dismissed" }),
    timeoutMs: 8000,
    retries: 1,
  });

  const result = (await response.json().catch(() => null)) as
    | { action?: CampaignActionSuggestion; error?: string }
    | null;

  if (!response.ok || !result?.action) {
    throw new Error(result?.error ?? "Campaign action could not be updated.");
  }

  return result.action;
}

export async function fetchCampaignDrafts() {
  const response = await fetchWithRetry("/api/campaign/drafts", {
    cache: "no-store",
    timeoutMs: 8000,
    retries: 1,
  });
  const result = (await response.json().catch(() => null)) as
    | { drafts?: CampaignDraftAction[]; error?: string }
    | null;

  if (!response.ok || !result?.drafts) {
    throw new Error(result?.error ?? "Campaign draft actions could not be loaded.");
  }

  return result.drafts;
}

export async function updateCampaignDraft(id: string, action: "approve" | "dismiss") {
  const response = await fetchWithRetry("/api/campaign/drafts", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, status: action === "approve" ? "approved" : "dismissed" }),
    timeoutMs: 8000,
    retries: 1,
  });
  const result = (await response.json().catch(() => null)) as
    | { draft?: CampaignDraftAction; error?: string }
    | null;

  if (!response.ok || !result?.draft) {
    throw new Error(result?.error ?? "Campaign draft action could not be updated.");
  }

  return result.draft;
}
