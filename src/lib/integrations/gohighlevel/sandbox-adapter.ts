import type {
  GhlLeadProviderAdapter,
  GhlLeadProviderResult,
  GhlLocationCreateResult,
  GhlLocationReconcileResult,
  GhlProviderAdapter,
  GhlRequiredObject,
  GhlRequiredObjectsResult,
  GhlSnapshotInstallResult,
  GhlSnapshotStatusResult,
} from "./types";
import {
  GhlCredentialResolutionError,
  type GhlCredentialResolver,
} from "./credential-resolver";
import { GhlHttpClient, GhlHttpTransportError, type GhlHttpResponse } from "./http-client";
import { assertGhlSandboxAllowed, type GhlSandboxGateInput } from "./sandbox-gate";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asRows(value: unknown, keys: string[]) {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord);
  }
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function safeProviderId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,180}$/.test(value) ? value : null;
}

function stringValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return "";
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function requestFailure(
  response: GhlHttpResponse,
  prefix: string,
): Extract<GhlLeadProviderResult, { outcome: Exclude<GhlLeadProviderResult["outcome"], "succeeded"> }> {
  const retryable = response.status === 429 || response.status >= 500;
  return {
    outcome: retryable ? "retryable_failure" : "operator_action_required",
    errorCode: `${prefix}_${response.status}`,
    safeMessage: retryable
      ? "The GHL sandbox provider is temporarily unavailable or rate limited."
      : "The GHL sandbox provider rejected the bounded request.",
    providerRequestId: response.providerRequestId,
    httpStatus: response.status,
    responseFingerprint: response.responseFingerprint,
    ...(response.retryAfterMs === null ? {} : { retryAfterMs: response.retryAfterMs }),
    providerMutationAttempted: true,
  };
}

function transportFailure(
  error: unknown,
  prefix: string,
): Exclude<GhlLeadProviderResult, { outcome: "succeeded" }> {
  if (error instanceof GhlCredentialResolutionError) {
    return {
      outcome: "operator_action_required",
      errorCode: error.code,
      safeMessage: error.message,
      providerRequestId: null,
      httpStatus: null,
      responseFingerprint: null,
      providerMutationAttempted: false,
    };
  }
  if (error instanceof GhlHttpTransportError) {
    return {
      outcome: error.uncertain ? "uncertain" : "retryable_failure",
      errorCode: `${prefix}_${error.code}`,
      safeMessage: error.message,
      providerRequestId: null,
      httpStatus: null,
      responseFingerprint: null,
      providerMutationAttempted: true,
    };
  }
  return {
    outcome: "operator_action_required",
    errorCode: `${prefix}_unexpected_response`,
    safeMessage: "The GHL sandbox provider returned an unexpected result.",
    providerRequestId: null,
    httpStatus: null,
    responseFingerprint: null,
    providerMutationAttempted: false,
  };
}

export type GhlSandboxAdapterOptions = {
  credentialRef: string;
  credentialResolver: GhlCredentialResolver;
  gate: GhlSandboxGateInput;
  httpClient?: GhlHttpClient;
  companyId: string;
};

export class GhlSandboxAdapter implements GhlProviderAdapter, GhlLeadProviderAdapter {
  readonly kind = "sandbox" as const;
  readonly networkAccess = "https" as const;
  private readonly credentialRef: string;
  private readonly resolver: GhlCredentialResolver;
  private readonly gate: GhlSandboxGateInput;
  private readonly http: GhlHttpClient;
  private readonly companyId: string;

  constructor(options: GhlSandboxAdapterOptions) {
    assertGhlSandboxAllowed(options.gate);
    if (!safeProviderId(options.companyId)) {
      throw new Error("A valid GHL sandbox company id is required.");
    }
    this.credentialRef = options.credentialRef;
    this.resolver = options.credentialResolver;
    this.gate = { ...options.gate };
    this.http = options.httpClient ?? new GhlHttpClient({ baseUrl: options.gate.baseUrl });
    this.companyId = options.companyId;
  }

  private withCredential<T>(operation: (credential: string) => Promise<T>) {
    assertGhlSandboxAllowed(this.gate);
    return this.resolver.withCredential(this.credentialRef, operation);
  }

  async createLocation(
    input: Parameters<GhlProviderAdapter["createLocation"]>[0],
  ): Promise<GhlLocationCreateResult> {
    if (input.environment !== "sandbox") {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_environment_forbidden",
        safeMessage: "The real GHL adapter accepts only sandbox locations.",
        providerRequestId: null,
        httpStatus: null,
      };
    }
    try {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "POST",
        path: "/locations/",
        credential,
        retryMode: "no-retry",
        body: {
          companyId: this.companyId,
          name: input.profile.displayName,
          country: input.profile.country,
          timezone: input.profile.timezone,
          prospectInfo: {
            source: "DealFlow isolated sandbox",
            id: input.idempotencyKey,
          },
        },
      }));
      if (!response.ok) {
        const failure = requestFailure(response, "ghl_location_create");
        return { ...failure, outcome: failure.outcome === "uncertain" ? "retryable_failure" : failure.outcome };
      }
      const root = asRecord(response.data);
      const location = asRecord(root.location);
      const providerLocationId = safeProviderId(root.id) ?? safeProviderId(location.id);
      if (!providerLocationId) {
        return {
          outcome: "operator_action_required",
          errorCode: "ghl_location_create_receipt_invalid",
          safeMessage: "GHL accepted the location request without a durable location id.",
          providerRequestId: response.providerRequestId,
          httpStatus: response.status,
        };
      }
      return {
        outcome: "succeeded",
        providerLocationId,
        providerRequestId: response.providerRequestId ?? `response:${response.responseFingerprint}`,
        providerReference: providerLocationId,
        httpStatus: response.status,
      };
    } catch (error) {
      const failure = transportFailure(error, "ghl_location_create");
      return {
        outcome: failure.outcome === "uncertain" ? "uncertain" : failure.outcome,
        errorCode: "errorCode" in failure ? failure.errorCode : "ghl_location_create_failed",
        safeMessage: "safeMessage" in failure ? failure.safeMessage : "GHL location creation failed.",
        providerRequestId: "providerRequestId" in failure ? failure.providerRequestId : null,
        httpStatus: "httpStatus" in failure ? failure.httpStatus : null,
      };
    }
  }

  async reconcileLocationCreate(): Promise<GhlLocationReconcileResult> {
    return {
      outcome: "operator_action_required",
      errorCode: "ghl_location_create_reconciliation_required",
      safeMessage: "An uncertain GHL location creation must be reconciled by exact provider receipt before retry.",
      providerRequestId: null,
    };
  }

  async installSnapshot(
    input: Parameters<GhlProviderAdapter["installSnapshot"]>[0],
  ): Promise<GhlSnapshotInstallResult> {
    if (input.manifest.installationMode !== "preinstalled") {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_snapshot_push_api_unavailable",
        safeMessage: "GHL exposes snapshot status but no sanctioned snapshot-push API. A preinstalled sandbox snapshot is required.",
        providerRequestId: null,
        httpStatus: null,
      };
    }
    const status = await this.getSnapshotStatus({
      providerLocationId: input.providerLocationId,
      manifest: input.manifest,
    });
    if (status.outcome === "ready" || status.outcome === "pending") {
      return {
        outcome: status.outcome === "ready" ? "succeeded" : "accepted",
        providerRequestId: status.providerRequestId,
        providerReference: status.providerReference,
        httpStatus: 200,
      };
    }
    if ("errorCode" in status) {
      return {
        outcome: status.outcome,
        errorCode: status.errorCode,
        safeMessage: status.safeMessage,
        providerRequestId: status.providerRequestId,
        httpStatus: null,
      };
    }
    return {
      outcome: "operator_action_required",
      errorCode: "ghl_snapshot_status_invalid",
      safeMessage: "GHL snapshot status could not be interpreted safely.",
      providerRequestId: null,
      httpStatus: null,
    };
  }

  async getSnapshotStatus(
    input: Parameters<GhlProviderAdapter["getSnapshotStatus"]>[0],
  ): Promise<GhlSnapshotStatusResult> {
    try {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "GET",
        path: `/snapshots/snapshot-status/${encodeURIComponent(input.manifest.providerSnapshotId)}/location/${encodeURIComponent(input.providerLocationId)}`,
        credential,
        retryMode: "safe-read",
      }));
      if (!response.ok) {
        const failure = requestFailure(response, "ghl_snapshot_status");
        return {
          outcome: failure.outcome === "operator_action_required" ? "operator_action_required" : "retryable_failure",
          errorCode: failure.errorCode,
          safeMessage: failure.safeMessage,
          providerRequestId: failure.providerRequestId,
        };
      }
      const root = asRecord(response.data);
      const nested = asRecord(root.snapshotPush);
      const rawStatus = stringValue(root, ["status", "snapshotStatus", "pushStatus"])
        || stringValue(nested, ["status", "snapshotStatus", "pushStatus"]);
      const normalized = normalizedKey(rawStatus);
      if (["completed", "complete", "success", "succeeded", "ready"].includes(normalized)) {
        return {
          outcome: "ready",
          providerRequestId: response.providerRequestId ?? `response:${response.responseFingerprint}`,
          providerReference: `${input.manifest.providerSnapshotId}:${input.providerLocationId}`,
        };
      }
      if (["pending", "processing", "queued", "in-progress", "started"].includes(normalized)) {
        return {
          outcome: "pending",
          providerRequestId: response.providerRequestId ?? `response:${response.responseFingerprint}`,
          providerReference: `${input.manifest.providerSnapshotId}:${input.providerLocationId}`,
        };
      }
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_snapshot_status_unrecognized",
        safeMessage: "GHL did not report a recognized snapshot installation state.",
        providerRequestId: response.providerRequestId,
      };
    } catch (error) {
      const failure = transportFailure(error, "ghl_snapshot_status");
      return {
        outcome: failure.outcome === "operator_action_required" ? "operator_action_required" : "retryable_failure",
        errorCode: "errorCode" in failure ? failure.errorCode : "ghl_snapshot_status_failed",
        safeMessage: "safeMessage" in failure ? failure.safeMessage : "GHL snapshot status failed.",
        providerRequestId: "providerRequestId" in failure ? failure.providerRequestId : null,
      };
    }
  }

  private async listRequiredObjectRows(
    credential: string,
    providerLocationId: string,
    object: GhlRequiredObject,
  ) {
    if (object.kind === "pipeline" || object.kind === "stage") {
      const response = await this.http.request<JsonRecord>({
        method: "GET",
        path: `/opportunities/pipelines?locationId=${encodeURIComponent(providerLocationId)}`,
        credential,
      });
      const pipelines = asRows(response.data, ["pipelines"]);
      if (object.kind === "pipeline") return { response, rows: pipelines };
      return {
        response,
        rows: pipelines.flatMap((pipeline) => asRows(pipeline.stages, ["stages"])),
      };
    }
    const contract = {
      workflow: [`/workflows/?locationId=${encodeURIComponent(providerLocationId)}`, ["workflows"]],
      tag: [`/locations/${encodeURIComponent(providerLocationId)}/tags`, ["tags"]],
      calendar: [`/calendars/?locationId=${encodeURIComponent(providerLocationId)}`, ["calendars"]],
      custom_field: [`/locations/${encodeURIComponent(providerLocationId)}/customFields`, ["customFields", "custom_fields"]],
    }[object.kind] as [string, string[]];
    const response = await this.http.request<JsonRecord>({ method: "GET", path: contract[0], credential });
    return { response, rows: asRows(response.data, contract[1]) };
  }

  async verifyRequiredObjects(
    input: Parameters<GhlProviderAdapter["verifyRequiredObjects"]>[0],
  ): Promise<GhlRequiredObjectsResult> {
    try {
      return await this.withCredential(async (credential) => {
        const verifiedKeys: string[] = [];
        const missingKeys: string[] = [];
        let lastRequestId: string | null = null;
        for (const object of input.manifest.requiredObjects) {
          const { response, rows } = await this.listRequiredObjectRows(
            credential,
            input.providerLocationId,
            object,
          );
          lastRequestId = response.providerRequestId ?? lastRequestId;
          if (!response.ok) {
            const failure = requestFailure(response, `ghl_${object.kind}_verify`);
            return {
              outcome: "retryable_failure" as const,
              errorCode: failure.errorCode,
              safeMessage: failure.safeMessage,
              providerRequestId: failure.providerRequestId,
            };
          }
          const matched = rows.some((row) => {
            const rowId = safeProviderId(row.id);
            if (object.providerObjectId) return rowId === object.providerObjectId;
            const rowName = stringValue(row, ["name", "key", "fieldKey", "slug"]);
            return normalizedKey(rowName) === normalizedKey(object.key);
          });
          (matched ? verifiedKeys : missingKeys).push(`${object.kind}:${object.key}`);
        }
        return missingKeys.length > 0
          ? {
              outcome: "missing" as const,
              verifiedKeys,
              missingKeys,
              providerRequestId: lastRequestId ?? "ghl-required-object-read",
            }
          : {
              outcome: "verified" as const,
              verifiedKeys,
              providerRequestId: lastRequestId ?? "ghl-required-object-read",
            };
      });
    } catch (error) {
      const failure = transportFailure(error, "ghl_required_objects");
      return {
        outcome: "retryable_failure",
        errorCode: "errorCode" in failure ? failure.errorCode : "ghl_required_objects_failed",
        safeMessage: "safeMessage" in failure ? failure.safeMessage : "GHL required-object verification failed.",
        providerRequestId: "providerRequestId" in failure ? failure.providerRequestId : null,
      };
    }
  }

  private async executeLeadWrite(input: {
    path: string;
    body?: Record<string, unknown>;
    method?: "POST" | "PUT";
    providerReference: (body: JsonRecord) => string | null;
    errorPrefix: string;
  }): Promise<GhlLeadProviderResult> {
    try {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: input.method ?? "POST",
        path: input.path,
        credential,
        retryMode: "no-retry",
        ...(input.body ? { body: input.body } : {}),
      }));
      if (!response.ok) return requestFailure(response, input.errorPrefix);
      const reference = input.providerReference(asRecord(response.data));
      if (!reference) {
        return {
          outcome: "operator_action_required",
          errorCode: `${input.errorPrefix}_receipt_invalid`,
          safeMessage: "GHL accepted the request without a durable provider object id.",
          providerRequestId: response.providerRequestId,
          httpStatus: response.status,
          responseFingerprint: response.responseFingerprint,
          providerMutationAttempted: true,
        };
      }
      return {
        outcome: "succeeded",
        providerRequestId: response.providerRequestId,
        providerReference: reference,
        httpStatus: response.status,
        responseFingerprint: response.responseFingerprint,
        providerMutationAttempted: true,
      };
    } catch (error) {
      return transportFailure(error, input.errorPrefix);
    }
  }

  upsertContact(input: Parameters<GhlLeadProviderAdapter["upsertContact"]>[0]) {
    return this.executeLeadWrite({
      path: "/contacts/upsert",
      errorPrefix: "ghl_contact_upsert",
      body: {
        locationId: input.providerLocationId,
        firstName: input.lead.firstName,
        lastName: input.lead.lastName,
        name: input.lead.name,
        email: input.lead.email,
        phone: input.lead.phone,
        source: input.lead.source ?? "DealFlow",
        createNewIfDuplicateAllowed: false,
      },
      providerReference: (body) => safeProviderId(asRecord(body.contact).id) ?? safeProviderId(body.id),
    });
  }

  upsertOpportunity(input: Parameters<GhlLeadProviderAdapter["upsertOpportunity"]>[0]) {
    return this.executeLeadWrite({
      path: "/opportunities/upsert",
      errorPrefix: "ghl_opportunity_upsert",
      body: {
        locationId: input.providerLocationId,
        contactId: input.providerContactId,
        pipelineId: input.pipelineId,
        pipelineStageId: input.stageId,
        name: input.opportunityName,
        status: "open",
      },
      providerReference: (body) => safeProviderId(asRecord(body.opportunity).id) ?? safeProviderId(body.id),
    });
  }

  applyTag(input: Parameters<GhlLeadProviderAdapter["applyTag"]>[0]) {
    return this.executeLeadWrite({
      path: `/contacts/${encodeURIComponent(input.providerContactId)}/tags`,
      errorPrefix: "ghl_tag_apply",
      body: { tags: [input.tag] },
      providerReference: (body) => safeProviderId(asRecord(body.contact).id)
        ?? safeProviderId(body.contactId)
        ?? input.providerContactId,
    });
  }

  enrollWorkflow(input: Parameters<GhlLeadProviderAdapter["enrollWorkflow"]>[0]) {
    return this.executeLeadWrite({
      path: `/contacts/${encodeURIComponent(input.providerContactId)}/workflow/${encodeURIComponent(input.workflowId)}`,
      errorPrefix: "ghl_workflow_enroll",
      body: {},
      providerReference: () => input.workflowId,
    });
  }

  syncAppointment(input: Parameters<GhlLeadProviderAdapter["syncAppointment"]>[0]) {
    return this.executeLeadWrite({
      path: "/calendars/events/appointments",
      errorPrefix: "ghl_appointment_sync",
      body: {
        locationId: input.providerLocationId,
        contactId: input.providerContactId,
        calendarId: input.calendarId,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        appointmentStatus: "new",
      },
      providerReference: (body) => safeProviderId(asRecord(body.event).id)
        ?? safeProviderId(asRecord(body.appointment).id)
        ?? safeProviderId(body.id),
    });
  }
}
