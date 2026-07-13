export const ACCOUNT_DELETION_SUPPORT_EMAIL = "support@agentdealflow.io";

export function isAccountDeletionExecutionEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.ACCOUNT_DELETION_EXECUTION_ENABLED === "true";
}

export function getSuspendedAccountDeletionPath() {
  return "/data-deletion?reason=account_suspended";
}
