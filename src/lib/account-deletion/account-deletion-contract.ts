export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = "DELETE MY DEALFLOW WORKSPACE";

export const ACCOUNT_DELETION_TASK_KINDS = [
  "suspend_workspace",
  "revoke_auth_sessions",
  "cancel_stripe_subscription",
  "revoke_meta_permissions",
  "disconnect_ghl",
  "disable_support_delivery",
  "freeze_analytics",
  "delete_creative_storage",
  "anonymize_support",
  "anonymize_analytics",
  "delete_operational_data",
  "anonymize_financial_subjects",
  "purge_expired_financial_records",
  "expire_deletion_receipt_details",
  "delete_auth_identity",
  "complete_request",
] as const;

export type AccountDeletionTaskKind = (typeof ACCOUNT_DELETION_TASK_KINDS)[number];

export const ACCOUNT_DELETION_STATES = [
  "identity_confirmed",
  "suspending",
  "offboarding",
  "retention_window",
  "deleting",
  "legal_hold",
  "operator_required",
  "completed",
  "rejected",
] as const;

export type AccountDeletionState = (typeof ACCOUNT_DELETION_STATES)[number];

export type AccountDeletionRetentionPolicy = {
  graceDays: number;
  operationalRetentionDays: number;
  supportRetentionDays: number;
  analyticsRetentionDays: number;
  financialRetentionDays: number;
  receiptRetentionDays: number;
  billingCancellationMode: "immediate" | "period_end";
};

export type AccountDeletionTaskPlan = {
  kind: AccountDeletionTaskKind;
  phase: "immediate" | "retention" | "final";
  availableAt: string;
  legalHoldBlocking: boolean;
  maxAttempts: number;
};

export type AccountDeletionTaskResult = {
  outcome: "completed" | "retry" | "reconcile" | "operator_required";
  code: string;
  nextAttemptAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  return Math.min(Math.max(Number.parseInt(value, 10), minimum), maximum);
}

export function getAccountDeletionRetentionPolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AccountDeletionRetentionPolicy {
  return {
    graceDays: boundedInteger(environment.ACCOUNT_DELETION_GRACE_DAYS, 7, 0, 30),
    operationalRetentionDays: boundedInteger(
      environment.ACCOUNT_DELETION_OPERATIONAL_RETENTION_DAYS,
      30,
      1,
      365,
    ),
    supportRetentionDays: boundedInteger(
      environment.ACCOUNT_DELETION_SUPPORT_RETENTION_DAYS,
      30,
      1,
      365,
    ),
    analyticsRetentionDays: boundedInteger(
      environment.ACCOUNT_DELETION_ANALYTICS_RETENTION_DAYS,
      30,
      1,
      365,
    ),
    financialRetentionDays: boundedInteger(
      environment.ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS,
      2_555,
      365,
      3_650,
    ),
    receiptRetentionDays: boundedInteger(
      environment.ACCOUNT_DELETION_RECEIPT_RETENTION_DAYS,
      2_555,
      365,
      3_650,
    ),
    billingCancellationMode:
      environment.ACCOUNT_DELETION_BILLING_CANCELLATION_MODE === "immediate"
        ? "immediate"
        : "period_end",
  };
}

function addDays(timestamp: Date, days: number) {
  return new Date(timestamp.getTime() + days * DAY_MS).toISOString();
}

export function buildAccountDeletionTaskPlan(
  requestedAt: Date,
  policy: AccountDeletionRetentionPolicy,
): AccountDeletionTaskPlan[] {
  if (!Number.isFinite(requestedAt.getTime())) {
    throw new Error("A valid deletion-request timestamp is required.");
  }

  const immediate = requestedAt.toISOString();
  const operationalDeadline = addDays(
    requestedAt,
    Math.max(policy.graceDays, policy.operationalRetentionDays),
  );
  const supportDeadline = addDays(
    requestedAt,
    Math.max(policy.graceDays, policy.supportRetentionDays),
  );
  const analyticsDeadline = addDays(
    requestedAt,
    Math.max(policy.graceDays, policy.analyticsRetentionDays),
  );
  const financialDeadline = addDays(
    requestedAt,
    Math.max(policy.graceDays, policy.financialRetentionDays),
  );
  const receiptDeadline = addDays(
    requestedAt,
    Math.max(policy.graceDays, policy.receiptRetentionDays),
  );
  const finalDeadline = [
    operationalDeadline,
    supportDeadline,
    analyticsDeadline,
    financialDeadline,
    receiptDeadline,
  ]
    .sort()
    .at(-1)!;

  return [
    { kind: "suspend_workspace", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "revoke_auth_sessions", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "cancel_stripe_subscription", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "revoke_meta_permissions", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "disconnect_ghl", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "disable_support_delivery", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "freeze_analytics", phase: "immediate", availableAt: immediate, legalHoldBlocking: false, maxAttempts: 8 },
    { kind: "delete_creative_storage", phase: "retention", availableAt: operationalDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "anonymize_support", phase: "retention", availableAt: supportDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "anonymize_analytics", phase: "retention", availableAt: analyticsDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "delete_operational_data", phase: "retention", availableAt: operationalDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "anonymize_financial_subjects", phase: "retention", availableAt: operationalDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "purge_expired_financial_records", phase: "final", availableAt: financialDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "expire_deletion_receipt_details", phase: "final", availableAt: receiptDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "delete_auth_identity", phase: "final", availableAt: finalDeadline, legalHoldBlocking: true, maxAttempts: 8 },
    { kind: "complete_request", phase: "final", availableAt: finalDeadline, legalHoldBlocking: true, maxAttempts: 8 },
  ];
}

export function getAccountDeletionRetryResult(params: {
  attemptCount: number;
  maxAttempts: number;
  now?: Date;
  retryable: boolean;
  uncertain: boolean;
  code: string;
}): AccountDeletionTaskResult {
  if (params.uncertain) {
    return {
      outcome: "reconcile",
      code: params.code,
      nextAttemptAt: new Date((params.now ?? new Date()).getTime() + 5 * 60_000).toISOString(),
    };
  }

  if (!params.retryable || params.attemptCount >= params.maxAttempts) {
    return { outcome: "operator_required", code: params.code, nextAttemptAt: null };
  }

  const delayMinutes = Math.min(5 * 2 ** Math.max(params.attemptCount - 1, 0), 12 * 60);
  return {
    outcome: "retry",
    code: params.code,
    nextAttemptAt: new Date((params.now ?? new Date()).getTime() + delayMinutes * 60_000).toISOString(),
  };
}

const SECRET_KEY_PATTERN = /(?:token|secret|password|authorization|cookie|credential|raw|email|phone|name|address)/i;

export function sanitizeAccountDeletionReceiptMetadata(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .slice(0, 30)
      .map(([key, item]) => {
        if (typeof item === "string") return [key, item.slice(0, 300)];
        if (typeof item === "number" || typeof item === "boolean" || item === null) return [key, item];
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return [key, sanitizeAccountDeletionReceiptMetadata(item, depth + 1)];
        }
        return [key, null];
      }),
  );
}

export function getCustomerVisibleAccountDeletionState(input: {
  state: AccountDeletionState;
  legalHoldActive: boolean;
  scheduledDeletionAt: string | null;
  completedAt: string | null;
}) {
  if (input.state === "completed") {
    return {
      label: "Completed",
      detail: "DealFlow records the offboarding and deletion workflow as complete.",
      terminal: true,
    };
  }
  if (input.state === "rejected") {
    return {
      label: "Rejected",
      detail: "The request failed identity or authority checks and was not executed.",
      terminal: true,
    };
  }
  if (input.legalHoldActive || input.state === "legal_hold") {
    return {
      label: "Retention required",
      detail: "Deletion is paused for a documented legal or financial retention obligation. Access remains suspended.",
      terminal: false,
    };
  }
  if (input.state === "operator_required") {
    return {
      label: "Needs specialist review",
      detail: "An automated step could not be proven complete. Access remains suspended while an operator reconciles it.",
      terminal: false,
    };
  }
  if (input.state === "retention_window") {
    return {
      label: "Scheduled for deletion",
      detail: input.scheduledDeletionAt
        ? `Provider access is disconnected and retained data is scheduled for ${input.scheduledDeletionAt}.`
        : "Provider access is disconnected and retained data is scheduled for deletion.",
      terminal: false,
    };
  }
  if (input.state === "deleting") {
    return {
      label: "Deletion in progress",
      detail: "Due data is being deleted or anonymized and every step must produce a durable receipt.",
      terminal: false,
    };
  }
  return {
    label: "Offboarding in progress",
    detail: "Workspace access is being suspended and connected providers are being disconnected.",
    terminal: false,
  };
}
