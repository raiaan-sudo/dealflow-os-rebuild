import { ApiError } from "@/lib/api/route";

export type LeadRetryScope = {
  organizationId: string | null | undefined;
  userId: string | null | undefined;
  campaignId: string | null | undefined;
};

function normalizeRequiredScope(value: string | null | undefined) {
  return value?.trim() ?? "";
}

/**
 * Fences a queued lead replay to the tenant identity captured by its parent job.
 * This must run before any lead or effect write.
 */
export function assertLeadRetryParentScope(params: {
  expected: LeadRetryScope;
  resolved: LeadRetryScope;
}) {
  const expected = {
    organizationId: normalizeRequiredScope(params.expected.organizationId),
    userId: normalizeRequiredScope(params.expected.userId),
    campaignId: normalizeRequiredScope(params.expected.campaignId),
  };
  const resolved = {
    organizationId: normalizeRequiredScope(params.resolved.organizationId),
    userId: normalizeRequiredScope(params.resolved.userId),
    campaignId: normalizeRequiredScope(params.resolved.campaignId),
  };

  if (!expected.organizationId || !expected.userId || !expected.campaignId) {
    throw new ApiError(
      409,
      "The parent lead-retry job is missing its required tenant or campaign scope.",
      "lead_recovery_parent_scope_missing",
    );
  }

  if (
    !resolved.organizationId ||
    !resolved.userId ||
    !resolved.campaignId ||
    resolved.organizationId !== expected.organizationId ||
    resolved.userId !== expected.userId ||
    resolved.campaignId !== expected.campaignId
  ) {
    throw new ApiError(
      409,
      "The queued lead-retry scope no longer matches its parent job.",
      "lead_recovery_parent_scope_mismatch",
    );
  }

  return {
    organizationId: resolved.organizationId,
    userId: resolved.userId,
    campaignId: resolved.campaignId,
  };
}
