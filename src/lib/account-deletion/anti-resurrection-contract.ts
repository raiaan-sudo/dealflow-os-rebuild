import { createHash } from "node:crypto";
import {
  isExplicitNonProductionDeployment,
  isProductionDeployment,
} from "@/lib/deployment-target";
import { isStrongSecretValue } from "@/lib/env";

const ANCHOR_ATTESTATION = "DEALFLOW_DELETION_TOMBSTONE_EXTERNAL_V1";
const MAX_RESPONSE_RECEIPT_LENGTH = 300;

export class AntiResurrectionPolicyError extends Error {
  constructor(message: string, readonly code: string, readonly uncertain = false) {
    super(message);
    this.name = "AntiResurrectionPolicyError";
  }
}

export function resolveAntiResurrectionPolicy(
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    environment.ACCOUNT_DELETION_TOMBSTONE_ANCHOR_ENABLED !== "true" ||
    environment.ACCOUNT_DELETION_TOMBSTONE_ATTESTATION !== ANCHOR_ATTESTATION
  ) {
    throw new AntiResurrectionPolicyError(
      "The independent deletion tombstone anchor is not owner-attested.",
      "account_deletion_tombstone_anchor_disabled",
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(environment.ACCOUNT_DELETION_TOMBSTONE_ENDPOINT?.trim() ?? "");
  } catch {
    throw new AntiResurrectionPolicyError(
      "The independent deletion tombstone endpoint is invalid.",
      "account_deletion_tombstone_endpoint_invalid",
    );
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new AntiResurrectionPolicyError(
      "The independent deletion tombstone endpoint contains forbidden URL state.",
      "account_deletion_tombstone_endpoint_invalid",
    );
  }

  const production = isProductionDeployment(environment);
  const nonproduction = isExplicitNonProductionDeployment(environment);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname);
  if (
    (production && (
      endpoint.protocol !== "https:" ||
      endpoint.origin !== environment.ACCOUNT_DELETION_TOMBSTONE_ALLOWED_ORIGIN?.trim()
    )) ||
    (nonproduction && !(endpoint.protocol === "http:" && loopback)) ||
    (!production && !nonproduction)
  ) {
    throw new AntiResurrectionPolicyError(
      "The independent deletion tombstone endpoint is outside its exact deployment boundary.",
      "account_deletion_tombstone_endpoint_forbidden",
    );
  }

  const token = environment.ACCOUNT_DELETION_TOMBSTONE_TOKEN?.trim();
  if (!isStrongSecretValue(token)) {
    throw new AntiResurrectionPolicyError(
      "The independent deletion tombstone credential is unavailable.",
      "account_deletion_tombstone_credential_missing",
    );
  }
  return { endpoint, token: token!, production };
}

export async function anchorAccountDeletionTombstone(params: {
  requestId: string;
  subjectDigest: string;
  manifestDigest: string;
  backupExpiryAt: string;
  tombstoneExpiryAt: string;
  environment?: Record<string, string | undefined>;
  transport?: typeof fetch;
}) {
  if (
    !/^[0-9a-f-]{36}$/i.test(params.requestId) ||
    !/^sha256:[a-f0-9]{64}$/.test(params.subjectDigest) ||
    !/^[a-f0-9]{64}$/.test(params.manifestDigest) ||
    !Number.isFinite(Date.parse(params.backupExpiryAt)) ||
    !Number.isFinite(Date.parse(params.tombstoneExpiryAt)) ||
    Date.parse(params.tombstoneExpiryAt) <= Date.parse(params.backupExpiryAt)
  ) {
    throw new AntiResurrectionPolicyError(
      "The deletion tombstone evidence is invalid.",
      "account_deletion_tombstone_evidence_invalid",
    );
  }
  const policy = resolveAntiResurrectionPolicy(params.environment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response: Response;
  try {
    response = await (params.transport ?? fetch)(policy.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${policy.token}`,
        "content-type": "application/json",
        "idempotency-key": `deletion-tombstone/${params.requestId}`,
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        schemaVersion: 1,
        requestReference: params.requestId,
        subjectDigest: params.subjectDigest,
        manifestDigest: params.manifestDigest,
        backupExpiryAt: params.backupExpiryAt,
        tombstoneExpiryAt: params.tombstoneExpiryAt,
      }),
    });
  } catch {
    throw new AntiResurrectionPolicyError(
      "The deletion tombstone outcome is ambiguous and must be reconciled before retry.",
      "account_deletion_tombstone_anchor_ambiguous",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new AntiResurrectionPolicyError(
      `The deletion tombstone anchor rejected the request with status ${response.status}.`,
      response.status >= 500
        ? "account_deletion_tombstone_anchor_ambiguous"
        : "account_deletion_tombstone_anchor_rejected",
      response.status >= 500,
    );
  }
  const receipt = response.headers.get("x-dealflow-tombstone-receipt")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,300}$/.test(receipt) || receipt.length > MAX_RESPONSE_RECEIPT_LENGTH) {
    throw new AntiResurrectionPolicyError(
      "The deletion tombstone anchor did not return a durable receipt.",
      "account_deletion_tombstone_receipt_missing",
      true,
    );
  }
  return {
    receiptDigest: `sha256:${createHash("sha256").update(receipt).digest("hex")}`,
  };
}
