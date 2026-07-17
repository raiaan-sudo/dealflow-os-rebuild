import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  ACCOUNT_DELETION_TASK_KINDS,
  getCustomerVisibleAccountDeletionState,
  sanitizeAccountDeletionReceiptMetadata,
  type AccountDeletionState,
  type AccountDeletionTaskKind,
} from "@/lib/account-deletion/account-deletion-contract";
import {
  ACCOUNT_DELETION_SUPPORT_EMAIL,
  isAccountDeletionExecutionEnabled,
} from "@/lib/account-deletion/account-deletion-access";
import { getMetaEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import { getStripeClient } from "@/lib/integrations/stripe/service";
import {
  createEnvironmentGhlCredentialResolver,
  createProductionEnvironmentGhlCredentialResolver,
  evaluateGhlProductionGate,
  evaluateGhlSandboxGate,
  GhlHttpClient,
  ghlProductionGateFromEnvironment,
  ghlSandboxGateFromEnvironment,
} from "@/lib/integrations/gohighlevel";
import {
  executeGhlAccountDeletionProviderOffboarding,
  GhlAccountDeletionProviderError,
  type GhlAccountDeletionAuthority,
} from "@/lib/account-deletion/ghl-account-deletion";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  authorizePrivacySubjectAction,
  privacyDigest,
  readPrivacySystemAuthority,
} from "@/lib/services/privacy-authority-service";
import {
  anchorAccountDeletionTombstone,
  AntiResurrectionPolicyError,
} from "@/lib/account-deletion/anti-resurrection-contract";

type UntypedClient = {
  from: (relation: string) => any;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

type AccountDeletionRequestRow = {
  id: string;
  organization_id: string | null;
  requested_by_user_id: string | null;
  confirmation_code: string;
  state: AccountDeletionState;
  requested_at: string;
  scheduled_deletion_at: string | null;
  legal_hold_active: boolean;
  completed_at: string | null;
  updated_at: string;
};

type ClaimedAccountDeletionTask = {
  id: string;
  request_id: string;
  organization_id: string;
  requested_by_user_id: string;
  task_kind: AccountDeletionTaskKind;
  attempt_count: number;
  max_attempts: number;
  claim_token: string;
  claim_generation: number;
  reconciliation_required: boolean;
};

type TaskExecutionReceipt = {
  outcome: "completed" | "retry" | "reconcile" | "operator_required";
  code: string;
  providerReceiptId?: string | null;
  metadata?: Record<string, unknown>;
  nextAttemptAt?: string | null;
};

class AccountDeletionUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionUncertainError";
  }
}

export type AccountDeletionIdentityInput = { method: "aal2" };

export type CreateAccountDeletionRequestInput = {
  email: string;
  confirmationPhrase: string;
  idempotencyKey: string;
  identity: AccountDeletionIdentityInput;
};

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(503, "Account deletion returned invalid lifecycle evidence.", code);
  }
  return value;
}

function accountDeletionWritesEnabled() {
  return isAccountDeletionExecutionEnabled();
}

function accountDeletionProviderWritesEnabled() {
  return process.env.ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED === "true";
}

function subjectFingerprint(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function verifyDeletionIdentity(params: {
  userId: string;
  email: string;
  identity: AccountDeletionIdentityInput;
}) {
  if (params.identity.method !== "aal2") {
    throw new ApiError(403, "A recently verified two-factor session is required.", "deletion_recent_aal2_required");
  }
  const client = await createRouteHandlerClient();
  if (!client) {
    throw new ApiError(503, "Identity confirmation is unavailable.", "deletion_identity_unavailable");
  }
  const [{ data: assurance, error: assuranceError }, { data: claimsData, error: claimsError }] =
    await Promise.all([client.auth.mfa.getAuthenticatorAssuranceLevel(), client.auth.getClaims()]);
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const issuedAt = typeof claims?.iat === "number" ? claims.iat : Number(claims?.iat);
  const recentlyIssued = Number.isFinite(issuedAt) && Date.now() / 1_000 - issuedAt <= 10 * 60;
  if (assuranceError || claimsError || assurance?.currentLevel !== "aal2" || !recentlyIssued) {
    throw new ApiError(
      403,
      "A recently verified two-factor session is required.",
      "deletion_recent_aal2_required",
    );
  }
  return "aal2" as const;
}

export async function isAccountDeletionRequestAvailable() {
  if (!accountDeletionWritesEnabled()) return false;
  const context = await getAppContext();
  if (!context || context.organization.owner_user_id !== context.user.id) return false;
  return Boolean(await authorizePrivacySubjectAction({
    organizationId: context.organization.id,
    userId: context.user.id,
    action: "delete",
  }));
}

function mapRequest(value: unknown): AccountDeletionRequestRow {
  const record = row(firstRow(value));
  const state = requiredString(record.state, "deletion_state_invalid") as AccountDeletionState;
  return {
    id: requiredString(record.id, "deletion_request_invalid"),
    organization_id: typeof record.organization_id === "string" ? record.organization_id : null,
    requested_by_user_id:
      typeof record.requested_by_user_id === "string" ? record.requested_by_user_id : null,
    confirmation_code: requiredString(record.confirmation_code, "deletion_confirmation_invalid"),
    state,
    requested_at: requiredString(record.requested_at, "deletion_timestamp_invalid"),
    scheduled_deletion_at:
      typeof record.scheduled_deletion_at === "string" ? record.scheduled_deletion_at : null,
    legal_hold_active: record.legal_hold_active === true,
    completed_at: typeof record.completed_at === "string" ? record.completed_at : null,
    updated_at: requiredString(record.updated_at, "deletion_timestamp_invalid"),
  };
}

function publicRequestStatus(request: AccountDeletionRequestRow) {
  return {
    confirmationCode: request.confirmation_code,
    state: request.state,
    requestedAt: request.requested_at,
    scheduledDeletionAt: request.scheduled_deletion_at,
    completedAt: request.completed_at,
    updatedAt: request.updated_at,
    legalHoldActive: request.legal_hold_active,
    display: getCustomerVisibleAccountDeletionState({
      state: request.state,
      legalHoldActive: request.legal_hold_active,
      scheduledDeletionAt: request.scheduled_deletion_at,
      completedAt: request.completed_at,
    }),
  };
}

export async function createAccountDeletionRequest(input: CreateAccountDeletionRequestInput) {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (context.organization.owner_user_id !== context.user.id) {
    throw new ApiError(
      403,
      "Only the workspace owner can delete the workspace.",
      "deletion_owner_authority_required",
    );
  }
  if (!accountDeletionWritesEnabled()) {
    throw new ApiError(
      503,
      `Automated account deletion is temporarily unavailable. Contact ${ACCOUNT_DELETION_SUPPORT_EMAIL}.`,
      "account_deletion_execution_unavailable",
    );
  }

  const privacyAuthority = await authorizePrivacySubjectAction({
    organizationId: context.organization.id,
    userId: context.user.id,
    action: "delete",
  });
  if (!privacyAuthority) {
    throw new ApiError(
      503,
      `Verified privacy authority and a recent two-factor session are required. Contact ${ACCOUNT_DELETION_SUPPORT_EMAIL}.`,
      "account_deletion_privacy_authority_unavailable",
    );
  }

  const expectedEmail = context.user.email?.trim().toLowerCase() ?? "";
  const suppliedEmail = input.email.trim().toLowerCase();
  if (!expectedEmail || suppliedEmail !== expectedEmail) {
    throw new ApiError(403, "Identity confirmation failed.", "deletion_email_mismatch");
  }
  if (input.confirmationPhrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE) {
    throw new ApiError(400, "The deletion confirmation phrase is not exact.", "deletion_phrase_mismatch");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{15,127}$/.test(input.idempotencyKey)) {
    throw new ApiError(400, "A valid deletion request key is required.", "deletion_idempotency_invalid");
  }

  const identityMethod = await verifyDeletionIdentity({
    userId: context.user.id,
    email: expectedEmail,
    identity: input.identity,
  });
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Account deletion is unavailable.", "deletion_store_unavailable");
  const { data, error } = await (admin as unknown as UntypedClient).rpc(
    "create_privacy_delete_request_v1",
    {
      p_organization_id: context.organization.id,
      p_actor_user_id: context.user.id,
      p_idempotency_key: input.idempotencyKey,
      p_identity_email_hash: subjectFingerprint(expectedEmail),
      p_request_payload_digest: privacyDigest(JSON.stringify({
        requestType: "delete",
        identityMethod,
        confirmationPhrase: input.confirmationPhrase,
      })),
      p_evidence_digest: privacyDigest(JSON.stringify({
        organizationId: context.organization.id,
        userId: context.user.id,
        idempotencyKey: input.idempotencyKey,
        identityMethod,
      })),
      ...privacyAuthority.rpc,
    },
  );
  if (error) {
    throw new ApiError(503, error.message ?? "Account deletion could not be scheduled.", "deletion_request_failed");
  }
  const wrapper = row(firstRow(data));
  const deletionRequestId = requiredString(
    wrapper.account_deletion_request_id,
    "deletion_request_invalid",
  );
  const { data: storedRequest, error: storedRequestError } = await (admin as unknown as UntypedClient)
    .from("account_deletion_requests")
    .select("id,organization_id,requested_by_user_id,confirmation_code,state,requested_at,scheduled_deletion_at,legal_hold_active,completed_at,updated_at")
    .eq("id", deletionRequestId)
    .maybeSingle();
  if (storedRequestError || !storedRequest) {
    throw new ApiError(503, "Account deletion scope could not be verified.", "deletion_scope_invalid");
  }
  const request = mapRequest(storedRequest);
  if (
    request.organization_id !== context.organization.id ||
    request.requested_by_user_id !== context.user.id
  ) {
    throw new ApiError(503, "Account deletion scope could not be verified.", "deletion_scope_invalid");
  }

  let immediateAuthSuspensionConfirmed = false;
  if (accountDeletionWritesEnabled()) {
    const { error: suspensionError } = await admin.auth.admin.updateUserById(context.user.id, {
      ban_duration: "876000h",
    });
    immediateAuthSuspensionConfirmed = !suspensionError;
  }

  return {
    ...publicRequestStatus(request),
    providerActionsPerformed: false,
    sessionRevocationQueued: true,
    immediateAuthSuspensionConfirmed,
  };
}

export async function getCurrentAccountDeletionStatus() {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  const client = await createRouteHandlerClient();
  if (!client) throw new ApiError(503, "Account deletion is unavailable.", "deletion_store_unavailable");
  const { data, error } = await (client as unknown as UntypedClient)
    .from("account_deletion_requests")
    .select(
      "id,organization_id,requested_by_user_id,confirmation_code,state,requested_at,scheduled_deletion_at,legal_hold_active,completed_at,updated_at",
    )
    .eq("organization_id", context.organization.id)
    .eq("requested_by_user_id", context.user.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(503, "Account deletion status is unavailable.", "deletion_status_failed");
  return data ? publicRequestStatus(mapRequest(data)) : null;
}

export async function getPublicAccountDeletionStatus(confirmationCode: string) {
  const normalized = confirmationCode.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(normalized)) return null;
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Account deletion status is unavailable.", "deletion_status_failed");
  const { data, error } = await (admin as unknown as UntypedClient)
    .from("account_deletion_requests")
    .select(
      "id,organization_id,requested_by_user_id,confirmation_code,state,requested_at,scheduled_deletion_at,legal_hold_active,completed_at,updated_at",
    )
    .eq("confirmation_code", normalized)
    .maybeSingle();
  if (error) throw new ApiError(503, "Account deletion status is unavailable.", "deletion_status_failed");
  return data ? publicRequestStatus(mapRequest(data)) : null;
}

function mapClaim(value: unknown): ClaimedAccountDeletionTask | null {
  const record = row(value);
  if (!record.id) return null;
  const kind = requiredString(record.task_kind, "deletion_task_kind_invalid") as AccountDeletionTaskKind;
  if (!ACCOUNT_DELETION_TASK_KINDS.includes(kind)) {
    throw new ApiError(503, "Account deletion task kind is invalid.", "deletion_task_kind_invalid");
  }
  return {
    id: requiredString(record.id, "deletion_task_invalid"),
    request_id: requiredString(record.request_id, "deletion_task_invalid"),
    organization_id: requiredString(record.organization_id, "deletion_task_invalid"),
    requested_by_user_id: requiredString(record.requested_by_user_id, "deletion_task_invalid"),
    task_kind: kind,
    attempt_count: Number(record.attempt_count ?? 0),
    max_attempts: Number(record.max_attempts ?? 8),
    claim_token: requiredString(record.claim_token, "deletion_claim_invalid"),
    claim_generation: Number(record.claim_generation ?? 0),
    reconciliation_required: record.reconciliation_required === true,
  };
}

async function executeInternalDeletionAction(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const { data, error } = await admin.rpc("execute_account_deletion_internal_action_v1", {
    p_task_id: task.id,
    p_claim_token: task.claim_token,
    p_claim_generation: task.claim_generation,
  });
  if (error) throw new Error(error.message ?? "Internal deletion action failed.");
  const result = row(firstRow(data));
  const outcome = result.result_outcome === "operator_required" ? "operator_required" : "completed";
  return {
    outcome,
    code: requiredString(result.result_code, "deletion_internal_receipt_invalid"),
    metadata: sanitizeAccountDeletionReceiptMetadata(result.receipt_metadata),
  };
}

async function executeFinalDeletionTask(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const backupRetentionDays = Math.min(
    Math.max(Number(process.env.ACCOUNT_DELETION_BACKUP_RETENTION_DAYS ?? 30), 1),
    3_650,
  );
  const tombstoneRetentionDays = Math.min(
    Math.max(Number(process.env.ACCOUNT_DELETION_TOMBSTONE_RETENTION_DAYS ?? 3_650), backupRetentionDays + 1),
    36_500,
  );
  const prepared = await admin.rpc("prepare_account_deletion_completion_v2", {
    p_request_id: task.request_id,
    p_claim_token: task.claim_token,
    p_claim_generation: task.claim_generation,
    p_backup_retention_days: backupRetentionDays,
    p_tombstone_retention_days: tombstoneRetentionDays,
  });
  if (prepared.error) {
    return {
      outcome: "operator_required",
      code: prepared.error.message?.includes("dynamic_inventory")
        ? "account_deletion_dynamic_inventory_unresolved"
        : "account_deletion_completion_manifest_unavailable",
    };
  }
  const preparation = row(firstRow(prepared.data));
  const manifestDigest = requiredString(preparation.manifest_digest, "deletion_manifest_invalid");
  const subjectDigest = requiredString(preparation.subject_digest, "deletion_manifest_invalid");
  const tombstoneResult = await admin
    .from("account_deletion_tombstones")
    .select("state,backup_expiry_at,tombstone_expiry_at,external_anchor_receipt_digest")
    .eq("request_id", task.request_id)
    .maybeSingle();
  if (tombstoneResult.error || !tombstoneResult.data) {
    return { outcome: "operator_required", code: "account_deletion_tombstone_unavailable" };
  }
  const tombstone = row(tombstoneResult.data);
  let externalReceiptDigest = typeof tombstone.external_anchor_receipt_digest === "string"
    ? tombstone.external_anchor_receipt_digest
    : null;
  if (tombstone.state !== "anchored" || !externalReceiptDigest) {
    try {
      const anchored = await anchorAccountDeletionTombstone({
        requestId: task.request_id,
        subjectDigest,
        manifestDigest,
        backupExpiryAt: requiredString(tombstone.backup_expiry_at, "deletion_tombstone_invalid"),
        tombstoneExpiryAt: requiredString(tombstone.tombstone_expiry_at, "deletion_tombstone_invalid"),
      });
      externalReceiptDigest = anchored.receiptDigest;
      const attestation = await admin.rpc("attest_account_deletion_tombstone_anchor_v1", {
        p_request_id: task.request_id,
        p_claim_token: task.claim_token,
        p_claim_generation: task.claim_generation,
        p_manifest_digest: manifestDigest,
        p_external_anchor_receipt_digest: externalReceiptDigest,
      });
      if (attestation.error) {
        throw new AccountDeletionUncertainError("Deletion tombstone receipt could not be persisted.");
      }
    } catch (error) {
      if (error instanceof AntiResurrectionPolicyError) {
        if (error.uncertain) throw new AccountDeletionUncertainError(error.code);
        return { outcome: "operator_required", code: error.code };
      }
      throw error;
    }
  }
  const internal = await executeInternalDeletionAction(admin, task);
  return {
    ...internal,
    metadata: {
      ...(internal.metadata ?? {}),
      dynamicManifestDigest: manifestDigest,
      externalTombstoneReceiptDigest: externalReceiptDigest,
    },
  };
}

async function executeAuthTask(
  admin: ReturnType<typeof createAdminClient> extends infer T ? NonNullable<T> : never,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  if (task.task_kind === "revoke_auth_sessions") {
    const { error } = await admin.auth.admin.updateUserById(task.requested_by_user_id, {
      ban_duration: "876000h",
    });
    if (error) throw error;
    return { outcome: "completed", code: "auth_identity_suspended" };
  }
  const { error } = await admin.auth.admin.deleteUser(task.requested_by_user_id, true);
  if (error) throw error;
  return { outcome: "completed", code: "auth_identity_soft_deleted" };
}

async function executeStripeTask(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const requestResult = await admin
    .from("account_deletion_requests")
    .select("retention_policy")
    .eq("id", task.request_id)
    .eq("organization_id", task.organization_id)
    .maybeSingle();
  if (requestResult.error) {
    throw new Error(requestResult.error.message ?? "Deletion policy lookup failed.");
  }
  const snapshottedPolicy = row(requestResult.data).retention_policy;
  const billingCancellationMode = row(snapshottedPolicy).billingCancellationMode;
  if (billingCancellationMode !== "immediate" && billingCancellationMode !== "period_end") {
    return { outcome: "operator_required", code: "stripe_deletion_policy_snapshot_invalid" };
  }
  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("stripe_subscription_id,status")
    .eq("organization_id", task.organization_id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Billing offboarding lookup failed.");
  const billing = row(data);
  const subscriptionId = typeof billing.stripe_subscription_id === "string"
    ? billing.stripe_subscription_id
    : null;
  if (!subscriptionId) {
    return { outcome: "completed", code: "stripe_subscription_already_inactive" };
  }
  const stripe = getStripeClient();
  if (!stripe) {
    return { outcome: "operator_required", code: "stripe_offboarding_credentials_unavailable" };
  }
  let authoritative;
  try {
    authoritative = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (stripeError) {
    const error = stripeError as { type?: string; code?: string; statusCode?: number };
    if (!error.statusCode || error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500) {
      throw new AccountDeletionUncertainError("Stripe subscription state requires authoritative reconciliation.");
    }
    if (error.statusCode === 404 || error.code === "resource_missing") {
      return { outcome: "completed", code: "stripe_subscription_already_absent" };
    }
    throw stripeError;
  }
  if (authoritative.status === "canceled" || authoritative.cancel_at_period_end) {
    return {
      outcome: "completed",
      code: authoritative.status === "canceled"
        ? "stripe_subscription_already_cancelled"
        : "stripe_subscription_nonrenewal_already_scheduled",
      providerReceiptId: subjectFingerprint(authoritative.id),
      metadata: { reconciledBeforeMutation: true, status: authoritative.status },
    };
  }
  if (!accountDeletionProviderWritesEnabled()) {
    return { outcome: "operator_required", code: "deletion_provider_writes_disabled" };
  }
  let subscription;
  try {
    subscription = billingCancellationMode === "immediate"
      ? await stripe.subscriptions.cancel(
          subscriptionId,
          { invoice_now: false, prorate: false },
          { idempotencyKey: `account-deletion:${task.id}` },
        )
      : await stripe.subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey: `account-deletion:${task.id}` },
        );
  } catch (stripeError) {
    const error = stripeError as { type?: string; code?: string; statusCode?: number };
    if (!error.statusCode || error.statusCode === 408 || error.statusCode === 409 || error.statusCode === 429 || error.statusCode >= 500) {
      throw new AccountDeletionUncertainError("Stripe cancellation outcome requires authoritative reconciliation.");
    }
    throw stripeError;
  }
  return {
    outcome: "completed",
    code: billingCancellationMode === "immediate"
      ? "stripe_subscription_cancelled"
      : "stripe_subscription_nonrenewal_scheduled",
    providerReceiptId: subjectFingerprint(subscription.id),
    metadata: { cancellationMode: billingCancellationMode, status: subscription.status },
  };
}

async function executeMetaTask(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const { data, error } = await admin
    .from("marketing_accounts")
    .select("id,access_token_encrypted")
    .eq("organization_id", task.organization_id)
    .eq("platform", "meta")
    .not("access_token_encrypted", "is", null);
  if (error) throw new Error(error.message ?? "Meta offboarding lookup failed.");
  const accounts = Array.isArray(data) ? data.map(row) : [];
  if (accounts.length === 0) return { outcome: "completed", code: "meta_already_disconnected" };
  if (!accountDeletionProviderWritesEnabled()) {
    return { outcome: "operator_required", code: "deletion_provider_writes_disabled" };
  }
  const metaEnv = getMetaEnv();
  if (!metaEnv) return { outcome: "operator_required", code: "meta_offboarding_credentials_unavailable" };

  let revokedCount = 0;
  for (const account of accounts) {
    const encrypted = typeof account.access_token_encrypted === "string" ? account.access_token_encrypted : "";
    const token = decryptSecret(encrypted, metaEnv.encryptionKey);
    const permissionsController = new AbortController();
    const permissionsTimeout = setTimeout(() => permissionsController.abort(), 12_000);
    try {
      const permissions = await fetch("https://graph.facebook.com/v23.0/me/permissions", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: permissionsController.signal,
      });
      if (permissions.status === 400 || permissions.status === 401) continue;
      if (!permissions.ok) {
        if (permissions.status === 408 || permissions.status === 429 || permissions.status >= 500) {
          throw new AccountDeletionUncertainError("Meta permission state is temporarily unavailable.");
        }
        throw new Error(`Meta permission reconciliation returned HTTP ${permissions.status}.`);
      }
      const permissionsBody = (await permissions.json().catch(() => null)) as { data?: unknown[] } | null;
      if (Array.isArray(permissionsBody?.data) && permissionsBody.data.length === 0) continue;
    } catch (permissionError) {
      if (permissionError instanceof AccountDeletionUncertainError) throw permissionError;
      if (permissionError instanceof Error && permissionError.name === "AbortError") {
        throw new AccountDeletionUncertainError("Meta permission reconciliation timed out.");
      }
      throw permissionError;
    } finally {
      clearTimeout(permissionsTimeout);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("https://graph.facebook.com/v23.0/me/permissions", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 400 || response.status === 401) continue;
      if (!response.ok) {
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          throw new AccountDeletionUncertainError("Meta permission revocation outcome is ambiguous.");
        }
        throw new Error(`Meta permission revocation returned HTTP ${response.status}.`);
      }
      revokedCount += 1;
    } catch (revokeError) {
      if (revokeError instanceof AccountDeletionUncertainError) throw revokeError;
      if (revokeError instanceof Error && revokeError.name === "AbortError") {
        throw new AccountDeletionUncertainError("Meta permission revocation timed out.");
      }
      throw revokeError;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    outcome: "completed",
    code: revokedCount === 0 ? "meta_permissions_already_absent" : "meta_permissions_revoked",
    metadata: { accountCount: accounts.length, revokedCount, reconciledBeforeMutation: true },
  };
}

async function loadGhlAccountDeletionAuthority(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<GhlAccountDeletionAuthority | null> {
  const mappingsResult = await admin
    .from("ghl_location_mappings")
    .select(
      "id,organization_id,partner_id,installation_id,environment,provider_location_id,provisioning_owner,status",
    )
    .eq("organization_id", task.organization_id)
    .eq("status", "active")
    .limit(2);
  if (mappingsResult.error) throw new Error(mappingsResult.error.message ?? "GHL deletion mapping lookup failed.");
  const mappings = Array.isArray(mappingsResult.data) ? mappingsResult.data.map(row) : [];
  if (mappings.length === 0) return null;
  if (mappings.length !== 1) {
    throw new GhlAccountDeletionProviderError("ghl_deletion_mapping_ambiguous", false);
  }
  const mapping = mappings[0];
  const mappingId = requiredString(mapping.id, "ghl_deletion_mapping_invalid");
  const installationId = requiredString(mapping.installation_id, "ghl_deletion_mapping_invalid");
  const environment = requiredString(mapping.environment, "ghl_deletion_mapping_invalid");
  const providerLocationId = requiredString(
    mapping.provider_location_id,
    "ghl_deletion_mapping_invalid",
  );
  const installationResult = await admin
    .from("ghl_installations")
    .select("id,environment,owner_kind,partner_id,encrypted_credential_ref,status")
    .eq("id", installationId)
    .eq("environment", environment)
    .eq("status", "active")
    .limit(2);
  if (installationResult.error) {
    throw new Error(installationResult.error.message ?? "GHL deletion installation lookup failed.");
  }
  const installations = Array.isArray(installationResult.data)
    ? installationResult.data.map(row)
    : [];
  const installation = installations.length === 1 ? installations[0] : {};

  const runsResult = await admin
    .from("ghl_provisioning_runs")
    .select("id,organization_id,installation_id,location_mapping_id,state,created_at")
    .eq("organization_id", task.organization_id)
    .eq("location_mapping_id", mappingId)
    .eq("installation_id", installationId)
    .eq("state", "ready")
    .order("created_at", { ascending: false })
    .limit(2);
  if (runsResult.error) throw new Error(runsResult.error.message ?? "GHL deletion provisioning evidence lookup failed.");
  const runs = Array.isArray(runsResult.data) ? runsResult.data.map(row) : [];
  const run = runs.length === 1 ? runs[0] : {};
  const runId = typeof run.id === "string" ? run.id : "";
  const outboxesResult = runId
    ? await admin
        .from("ghl_provider_outbox")
        .select("id,organization_id,provisioning_run_id,operation,status,created_at")
        .eq("organization_id", task.organization_id)
        .eq("provisioning_run_id", runId)
        .eq("operation", "location_create")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(2)
    : { data: [], error: null };
  if (outboxesResult.error) throw new Error(outboxesResult.error.message ?? "GHL deletion create receipt lookup failed.");
  const outboxes = Array.isArray(outboxesResult.data) ? outboxesResult.data.map(row) : [];
  const outbox = outboxes.length === 1 ? outboxes[0] : {};
  const outboxId = typeof outbox.id === "string" ? outbox.id : "";
  const receiptsResult = outboxId
    ? await admin
        .from("ghl_provider_receipts")
        .select("outbox_id,outcome,provider_reference,received_at")
        .eq("outbox_id", outboxId)
        .eq("outcome", "succeeded")
        .order("received_at", { ascending: false })
        .limit(2)
    : { data: [], error: null };
  if (receiptsResult.error) throw new Error(receiptsResult.error.message ?? "GHL deletion provider receipt lookup failed.");
  const receipts = Array.isArray(receiptsResult.data) ? receiptsResult.data.map(row) : [];
  const receipt = receipts.find(
    (candidate: Record<string, unknown>) => candidate.provider_reference === providerLocationId,
  ) ?? {};
  const originResult = await admin
    .from("ghl_location_origin_attestations")
    .select("organization_id,location_mapping_id,provider_location_id,origin,evidence_reference_hash")
    .eq("organization_id", task.organization_id)
    .eq("location_mapping_id", mappingId)
    .eq("provider_location_id", providerLocationId)
    .limit(2);
  if (originResult.error) {
    throw new Error(originResult.error.message ?? "GHL deletion origin evidence lookup failed.");
  }
  const origins = Array.isArray(originResult.data) ? originResult.data.map(row) : [];
  const origin = origins.length === 1 ? origins[0] : {};

  return {
    requestedOrganizationId: task.organization_id,
    mappingOrganizationId: typeof mapping.organization_id === "string" ? mapping.organization_id : "",
    mappingId,
    mappingPartnerId: typeof mapping.partner_id === "string" ? mapping.partner_id : null,
    providerLocationId,
    provisioningOwner: typeof mapping.provisioning_owner === "string" ? mapping.provisioning_owner : "",
    environment,
    installationId,
    installationOwnerKind: typeof installation.owner_kind === "string" ? installation.owner_kind : "",
    installationPartnerId: typeof installation.partner_id === "string" ? installation.partner_id : null,
    credentialRef:
      typeof installation.encrypted_credential_ref === "string"
        ? installation.encrypted_credential_ref
        : "",
    provisioningRunOrganizationId:
      typeof run.organization_id === "string" ? run.organization_id : null,
    provisioningRunMappingId:
      typeof run.location_mapping_id === "string" ? run.location_mapping_id : null,
    provisioningRunInstallationId:
      typeof run.installation_id === "string" ? run.installation_id : null,
    provisioningRunState: typeof run.state === "string" ? run.state : null,
    createOutboxOrganizationId:
      typeof outbox.organization_id === "string" ? outbox.organization_id : null,
    createOutboxStatus: typeof outbox.status === "string" ? outbox.status : null,
    createReceiptOutcome: typeof receipt.outcome === "string" ? receipt.outcome : null,
    createReceiptProviderReference:
      typeof receipt.provider_reference === "string" ? receipt.provider_reference : null,
    originAttestationOrganizationId:
      typeof origin.organization_id === "string" ? origin.organization_id : null,
    originAttestationMappingId:
      typeof origin.location_mapping_id === "string" ? origin.location_mapping_id : null,
    originAttestationProviderLocationId:
      typeof origin.provider_location_id === "string" ? origin.provider_location_id : null,
    originAttestationOrigin: typeof origin.origin === "string" ? origin.origin : null,
    originAttestationEvidenceHash:
      typeof origin.evidence_reference_hash === "string" ? origin.evidence_reference_hash : null,
  };
}

function getGhlAccountDeletionGate(environment: string) {
  const operationEnabled = process.env.GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED === "true";
  if (!operationEnabled) {
    return { allowed: false, code: "ghl_account_deletion_kill_switch_closed" };
  }
  if (environment === "production") {
    const configured = ghlProductionGateFromEnvironment("provisioning");
    const decision = evaluateGhlProductionGate({ ...configured, operationEnabled: true });
    return { allowed: decision.allowed, code: decision.code };
  }
  if (environment === "sandbox") {
    const decision = evaluateGhlSandboxGate(ghlSandboxGateFromEnvironment());
    return { allowed: decision.allowed, code: decision.code };
  }
  return { allowed: false, code: "ghl_account_deletion_environment_unproven" };
}

async function executeGhlTask(
  admin: UntypedClient,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const authority = await loadGhlAccountDeletionAuthority(admin, task);
  if (!authority) {
    return {
      outcome: "completed",
      code: "ghl_already_disconnected",
      metadata: { providerLocationDeleted: false, localDetachRequired: false },
    };
  }
  const gate = getGhlAccountDeletionGate(authority.environment);
  const credentialResolver = authority.environment === "production"
    ? createProductionEnvironmentGhlCredentialResolver()
    : createEnvironmentGhlCredentialResolver();
  try {
    return await executeGhlAccountDeletionProviderOffboarding({
      authority,
      credentialResolver,
      httpClient: new GhlHttpClient({ baseUrl: process.env.GHL_PROVIDER_BASE_URL }),
      providerWriteAllowed:
        accountDeletionProviderWritesEnabled() &&
        process.env.GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED === "true",
      providerGateAllowed: gate.allowed,
      providerGateCode: gate.code,
    });
  } catch (error) {
    if (error instanceof GhlAccountDeletionProviderError) {
      if (error.uncertain) throw new AccountDeletionUncertainError(error.code);
      return { outcome: "operator_required", code: error.code, metadata: {} };
    }
    throw error;
  }
}

async function executeCreativeStorageTask(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  const { data, error } = await (admin as unknown as UntypedClient).rpc(
    "get_account_deletion_creative_storage_inventory_v2",
    {
      p_task_id: task.id,
      p_claim_token: task.claim_token,
      p_claim_generation: task.claim_generation,
    },
  );
  if (error) throw new Error(error.message ?? "Creative asset inventory failed.");
  const assets = Array.isArray(data) ? data.map(row) : [];
  if (assets.some(
    (asset) => asset.inventory_state !== "canonical" && asset.inventory_state !== "database_only",
  )) {
    return { outcome: "operator_required", code: "creative_storage_identity_ambiguous" };
  }
  type StaticCleanupCandidate = {
    organizationId: string;
    userId: string;
    campaignId: string;
    dispatchId: string;
    imageAssetId: string;
    thumbnailAssetId: string;
    bucket: string;
    path: string;
    contentSha256: string;
    cleanupState: string;
  };
  const pathsByBucket = new Map<string, Set<string>>();
  const staticCandidates = new Map<string, StaticCleanupCandidate>();
  const assetIds: string[] = [];
  for (const asset of assets) {
    const assetId = typeof asset.asset_id === "string" ? asset.asset_id : "";
    const bucket = typeof asset.storage_bucket === "string" ? asset.storage_bucket : "";
    const path = typeof asset.storage_path === "string" ? asset.storage_path : "";
    if (assetId) assetIds.push(assetId);
    if (!bucket && !path && asset.inventory_state === "database_only") continue;
    if (!assetId || !bucket || !path || path.startsWith("/") || path.includes("..")) {
      return { outcome: "operator_required", code: "creative_storage_identity_ambiguous" };
    }
    if (asset.provider_name === "openai") {
      const candidate: StaticCleanupCandidate = {
        organizationId: typeof asset.organization_id === "string" ? asset.organization_id : "",
        userId: typeof asset.user_id === "string" ? asset.user_id : "",
        campaignId: typeof asset.campaign_id === "string" ? asset.campaign_id : "",
        dispatchId: typeof asset.dispatch_id === "string" ? asset.dispatch_id : "",
        imageAssetId: typeof asset.image_asset_id === "string" ? asset.image_asset_id : "",
        thumbnailAssetId:
          typeof asset.thumbnail_asset_id === "string" ? asset.thumbnail_asset_id : "",
        bucket,
        path,
        contentSha256: typeof asset.content_sha256 === "string" ? asset.content_sha256 : "",
        cleanupState: typeof asset.cleanup_state === "string" ? asset.cleanup_state : "",
      };
      if (
        candidate.organizationId !== task.organization_id || !candidate.userId ||
        !candidate.campaignId || !candidate.dispatchId || !candidate.imageAssetId ||
        !candidate.thumbnailAssetId || candidate.imageAssetId === candidate.thumbnailAssetId ||
        !/^[0-9a-f]{64}$/.test(candidate.contentSha256)
      ) {
        return { outcome: "operator_required", code: "creative_storage_identity_ambiguous" };
      }
      const existing = staticCandidates.get(candidate.dispatchId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
        return { outcome: "operator_required", code: "creative_storage_identity_ambiguous" };
      }
      staticCandidates.set(candidate.dispatchId, candidate);
      continue;
    }
    const bucketPaths = pathsByBucket.get(bucket) ?? new Set<string>();
    bucketPaths.add(path);
    pathsByBucket.set(bucket, bucketPaths);
  }

  for (const [dispatchId, candidate] of staticCandidates) {
    const { data: authorityData, error: authorityError } = await (
      admin as unknown as UntypedClient
    ).rpc("authorize_generated_static_storage_cleanup_v1", {
      p_task_id: task.id,
      p_claim_token: task.claim_token,
      p_claim_generation: task.claim_generation,
      p_organization_id: candidate.organizationId,
      p_user_id: candidate.userId,
      p_campaign_id: candidate.campaignId,
      p_dispatch_id: dispatchId,
      p_image_asset_id: candidate.imageAssetId,
      p_thumbnail_asset_id: candidate.thumbnailAssetId,
      p_storage_bucket: candidate.bucket,
      p_storage_path: candidate.path,
      p_content_sha256: candidate.contentSha256,
    });
    if (authorityError) {
      throw new Error(authorityError.message ?? "Generated static cleanup authority failed.");
    }
    const authority = row(firstRow(authorityData));
    const cleanupState = typeof authority.cleanup_state === "string"
      ? authority.cleanup_state
      : "";
    if (cleanupState !== "authorized" && cleanupState !== "object_deleted") {
      return { outcome: "operator_required", code: "generated_static_cleanup_state_invalid" };
    }
    candidate.cleanupState = cleanupState;
  }

  let removedCount = 0;
  for (const [bucket, paths] of pathsByBucket) {
    const exactPaths = [...paths];
    const { error: removeError } = await admin.storage.from(bucket).remove(exactPaths);
    if (removeError) throw removeError;
    removedCount += exactPaths.length;
  }
  for (const candidate of staticCandidates.values()) {
    if (candidate.cleanupState === "authorized") {
      const { error: removeError } = await admin.storage
        .from(candidate.bucket)
        .remove([candidate.path]);
      if (removeError) throw removeError;
      removedCount += 1;
    }
    const { data: authorityData, error: authorityError } = await (
      admin as unknown as UntypedClient
    ).rpc("authorize_generated_static_storage_cleanup_v1", {
      p_task_id: task.id,
      p_claim_token: task.claim_token,
      p_claim_generation: task.claim_generation,
      p_organization_id: candidate.organizationId,
      p_user_id: candidate.userId,
      p_campaign_id: candidate.campaignId,
      p_dispatch_id: candidate.dispatchId,
      p_image_asset_id: candidate.imageAssetId,
      p_thumbnail_asset_id: candidate.thumbnailAssetId,
      p_storage_bucket: candidate.bucket,
      p_storage_path: candidate.path,
      p_content_sha256: candidate.contentSha256,
    });
    const confirmed = row(firstRow(authorityData));
    if (authorityError || confirmed.cleanup_state !== "object_deleted") {
      throw new AccountDeletionUncertainError(
        authorityError?.message ?? "Generated static object deletion was not durably observed.",
      );
    }
  }
  const { data: finalized, error: finalizeError } = await (admin as unknown as UntypedClient).rpc(
    "finalize_account_deletion_creative_storage_v2",
    {
      p_task_id: task.id,
      p_claim_token: task.claim_token,
      p_claim_generation: task.claim_generation,
      p_asset_ids: assetIds,
    },
  );
  if (finalizeError) {
    throw new AccountDeletionUncertainError(
      finalizeError.message ?? "Creative asset database reconciliation failed.",
    );
  }
  const finalizedCount = Number(firstRow(finalized) ?? 0);
  if (!Number.isSafeInteger(finalizedCount) || finalizedCount !== assetIds.length) {
    throw new AccountDeletionUncertainError("Creative asset deletion count requires reconciliation.");
  }
  return {
    outcome: "completed",
    code: "creative_storage_deleted",
    metadata: { removedCount, finalizedCount },
  };
}

async function executeClaimedTask(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  task: ClaimedAccountDeletionTask,
): Promise<TaskExecutionReceipt> {
  if (!accountDeletionWritesEnabled()) {
    return { outcome: "operator_required", code: "account_deletion_execution_disabled" };
  }
  if (task.task_kind === "revoke_auth_sessions" || task.task_kind === "delete_auth_identity") {
    return executeAuthTask(admin, task);
  }
  if (task.task_kind === "cancel_stripe_subscription") {
    return executeStripeTask(admin as unknown as UntypedClient, task);
  }
  if (task.task_kind === "revoke_meta_permissions") {
    return executeMetaTask(admin as unknown as UntypedClient, task);
  }
  if (task.task_kind === "disconnect_ghl") {
    return executeGhlTask(admin as unknown as UntypedClient, task);
  }
  if (task.task_kind === "delete_creative_storage") {
    return executeCreativeStorageTask(admin, task);
  }
  if (task.task_kind === "complete_request") {
    return executeFinalDeletionTask(admin as unknown as UntypedClient, task);
  }
  return executeInternalDeletionAction(admin as unknown as UntypedClient, task);
}

export async function processAccountDeletionWork(params?: { maxTasks?: number; workerId?: string }) {
  if (!accountDeletionWritesEnabled()) {
    throw new ApiError(
      503,
      "Account deletion execution is disabled. No lifecycle task was claimed.",
      "account_deletion_execution_disabled",
    );
  }
  const privacyAuthority = await readPrivacySystemAuthority();
  if (!privacyAuthority) {
    throw new ApiError(
      503,
      "Signed privacy worker authority is unavailable. No lifecycle task was claimed.",
      "account_deletion_privacy_worker_authority_unavailable",
    );
  }
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Account deletion worker is unavailable.", "deletion_worker_unavailable");
  const workerId = params?.workerId ?? `account-deletion-${randomUUID()}`;
  const maxTasks = Math.min(Math.max(params?.maxTasks ?? 10, 1), 25);
  const { data, error } = await (admin as unknown as UntypedClient).rpc(
    "claim_account_deletion_tasks_v2",
    {
      p_worker_id: workerId,
      p_limit: maxTasks,
      p_lease_seconds: 120,
      ...privacyAuthority.rpc,
    },
  );
  if (error) throw new ApiError(503, error.message ?? "Deletion tasks could not be claimed.", "deletion_claim_failed");
  const claims = (Array.isArray(data) ? data : []).map(mapClaim).filter(Boolean) as ClaimedAccountDeletionTask[];
  const results: Array<{ taskId: string; kind: AccountDeletionTaskKind; outcome: string; code: string }> = [];

  for (const task of claims) {
    let receipt: TaskExecutionReceipt;
    try {
      receipt = await executeClaimedTask(admin, task);
    } catch (taskError) {
      receipt = {
        outcome: taskError instanceof AccountDeletionUncertainError ? "reconcile" : "retry",
        code: taskError instanceof AccountDeletionUncertainError
          ? "deletion_provider_outcome_ambiguous"
          : taskError instanceof Error && taskError.name === "AbortError"
            ? "deletion_provider_timeout"
            : "deletion_task_failed",
      };
    }
    const { error: settleError } = await (admin as unknown as UntypedClient).rpc(
      "settle_account_deletion_task_v1",
      {
        p_task_id: task.id,
        p_claim_token: task.claim_token,
        p_claim_generation: task.claim_generation,
        p_outcome: receipt.outcome,
        p_result_code: receipt.code,
        p_provider_receipt_id: receipt.providerReceiptId ?? null,
        p_receipt_metadata: sanitizeAccountDeletionReceiptMetadata(receipt.metadata),
        p_next_attempt_at: receipt.nextAttemptAt ?? null,
      },
    );
    if (settleError) {
      throw new ApiError(503, "Deletion task settlement failed.", "deletion_settlement_failed");
    }
    results.push({ taskId: task.id, kind: task.task_kind, outcome: receipt.outcome, code: receipt.code });
  }

  return { workerId, claimed: claims.length, results };
}

/**
 * Cron-safe deletion entry point. A disabled deletion lifecycle is an expected,
 * fail-closed state, so the shared scheduler must report it without claiming a
 * task or turning unrelated system-job stages into failures.
 */
export async function processScheduledAccountDeletionWork(params?: {
  maxTasks?: number;
  workerId?: string;
}) {
  if (!accountDeletionWritesEnabled()) {
    return {
      enabled: false as const,
      blockedReason: "account_deletion_execution_disabled" as const,
      workerId: null,
      claimed: 0,
      results: [] as Array<{
        taskId: string;
        kind: AccountDeletionTaskKind;
        outcome: string;
        code: string;
      }>,
    };
  }

  const result = await processAccountDeletionWork(params);
  return {
    enabled: true as const,
    blockedReason: null,
    ...result,
  };
}
