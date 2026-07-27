import { createHash } from "node:crypto";
import type {
  GhlInboundFormSubmission,
  GhlInboundFormSubmissionsReadAdapter,
  GhlInboundFormSubmissionsReadResult,
  GhlPeriodicFormSweepReadAdapter,
  GhlPeriodicFormSweepReadResult,
  GhlLeadProviderAdapter,
  GhlLeadProviderResult,
  GhlPersonalizationProviderAdapter,
  GhlPersonalizationResult,
  GhlLocationCreateResult,
  GhlLocationDisplayNameFinalizeResult,
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
import { assertGhlProductionAllowed, type GhlProductionGateInput } from "./production-gate";
import {
  buildGhlLocationReconciliationResponseFingerprint,
  buildGhlProviderDisplayName,
  buildGhlProviderLocationName,
  GHL_LOCATION_SEARCH_MAX_PAGES,
  GHL_LOCATION_SEARCH_PAGE_LIMIT,
  isExactGhlLocationCreateContract,
} from "./snapshot-create-contract";

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

function boundedOptionalString(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function boundedHttpUrl(value: unknown) {
  const candidate = boundedOptionalString(value, 2_048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function pageAttribution(pageUrl: string | null) {
  if (!pageUrl) {
    return { utmSource: null, utmMedium: null, utmCampaign: null, adId: null };
  }
  const url = new URL(pageUrl);
  const parameter = (names: string[], maximum: number) => {
    for (const name of names) {
      const value = boundedOptionalString(url.searchParams.get(name), maximum);
      if (value) return value;
    }
    return null;
  };
  return {
    utmSource: parameter(["utm_source"], 500),
    utmMedium: parameter(["utm_medium"], 500),
    utmCampaign: parameter(["utm_campaign"], 500),
    adId: parameter(["ad_id", "adId", "adid"], 180),
  };
}

function strictIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function expandedDateOnly(value: string, dayOffset: number) {
  const timestamp = strictIsoTimestamp(value);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function boundedQualificationFields(others: JsonRecord, allowedFieldIds: ReadonlySet<string>) {
  const ignored = new Set(["eventData", "fieldsOriSequance"]);
  const entries = Object.entries(others)
    .filter(([id]) => !ignored.has(id) && allowedFieldIds.has(id))
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > 100) return null;
  const fields: GhlInboundFormSubmission["qualification"]["fields"] = [];
  for (const [rawId, value] of entries) {
    const id = rawId.trim();
    if (!id || id.length > 180 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    if (typeof value === "string") {
      if (value.length > 500) return null;
      fields.push({ id, value });
    } else if (typeof value === "number" && Number.isFinite(value)) {
      fields.push({ id, value });
    } else if (typeof value === "boolean") {
      fields.push({ id, value });
    } else if (value !== null && value !== undefined) {
      return null;
    }
  }
  return fields;
}

function parseInboundFormSubmission(
  value: unknown,
  allowedFieldIds: ReadonlySet<string>,
): GhlInboundFormSubmission | null {
  const submission = asRecord(value);
  const providerSubmissionId = safeProviderId(submission.id);
  const providerFormId = safeProviderId(submission.formId);
  const providerContactId = safeProviderId(submission.contactId);
  const submittedAt = strictIsoTimestamp(submission.createdAt);
  if (!providerSubmissionId || !providerFormId || !providerContactId || !submittedAt) return null;

  const others = asRecord(submission.others);
  const qualificationFields = boundedQualificationFields(others, allowedFieldIds);
  if (!qualificationFields) return null;
  const eventData = asRecord(others.eventData ?? submission.eventData);
  const page = asRecord(eventData.page);
  const pageUrl = boundedHttpUrl(page.url);
  const urlAttribution = pageAttribution(pageUrl);
  const attribution = {
    fbc: boundedOptionalString(eventData.fbc, 500),
    fbp: boundedOptionalString(eventData.fbp, 500),
    pageUrl,
    referrer: boundedHttpUrl(eventData.referrer),
    adSource: boundedOptionalString(eventData.adSource, 500),
    source: boundedOptionalString(eventData.source, 500),
    medium: boundedOptionalString(eventData.medium, 500),
    ...urlAttribution,
  };

  const normalized: Omit<GhlInboundFormSubmission, "submissionFingerprint"> = {
    providerSubmissionId,
    providerFormId,
    providerContactId,
    submittedAt,
    name: boundedOptionalString(submission.name, 500),
    firstName: boundedOptionalString(submission.firstName ?? others.first_name, 250),
    lastName: boundedOptionalString(submission.lastName ?? others.last_name, 250),
    email: boundedOptionalString(submission.email, 500),
    phone: boundedOptionalString(submission.phone ?? others.phone, 100),
    qualification: { fields: qualificationFields },
    attribution,
  };
  return {
    ...normalized,
    submissionFingerprint: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
  };
}

function formReadFailure(
  response: GhlHttpResponse,
  codePrefix: string,
): Exclude<GhlInboundFormSubmissionsReadResult, { outcome: "succeeded" }> {
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  return {
    outcome: retryable ? "retryable_failure" : "operator_action_required",
    errorCode: `${codePrefix}_${response.status}`,
    safeMessage: retryable
      ? "The GHL forms provider is temporarily unavailable or rate limited."
      : "The GHL forms provider rejected the bounded read-only request.",
    providerRequestId: response.providerRequestId,
    responseFingerprint: response.responseFingerprint,
    ...(response.retryAfterMs === null ? {} : { retryAfterMs: response.retryAfterMs }),
    providerMutationAttempted: false,
  };
}

function formReadTransportFailure(
  error: unknown,
): Exclude<GhlInboundFormSubmissionsReadResult, { outcome: "succeeded" }> {
  if (error instanceof GhlCredentialResolutionError) {
    return {
      outcome: "operator_action_required",
      errorCode: error.code,
      safeMessage: error.message,
      providerRequestId: null,
      responseFingerprint: null,
      providerMutationAttempted: false,
    };
  }
  if (error instanceof GhlHttpTransportError) {
    return {
      outcome: "retryable_failure",
      errorCode: `ghl_form_submissions_${error.code}`,
      safeMessage: error.message,
      providerRequestId: null,
      responseFingerprint: null,
      providerMutationAttempted: false,
    };
  }
  return {
    outcome: "operator_action_required",
    errorCode: "ghl_form_submissions_unexpected_response",
    safeMessage: "The GHL forms provider returned an unexpected read-only result.",
    providerRequestId: null,
    responseFingerprint: null,
    providerMutationAttempted: false,
  };
}

function requestFailure(
  response: GhlHttpResponse,
  prefix: string,
): Extract<GhlLeadProviderResult, { outcome: Exclude<GhlLeadProviderResult["outcome"], "succeeded"> }> {
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  return {
    outcome: retryable ? "retryable_failure" : "operator_action_required",
    errorCode: `${prefix}_${response.status}`,
    safeMessage: retryable
      ? "The GHL provider is temporarily unavailable or rate limited."
      : "The GHL provider rejected the bounded request.",
    providerRequestId: response.providerRequestId,
    httpStatus: response.status,
    responseFingerprint: response.responseFingerprint,
    ...(response.retryAfterMs === null ? {} : { retryAfterMs: response.retryAfterMs }),
    providerMutationAttempted: true,
  };
}

/**
 * A dispatched provider write is ambiguous whenever the remote side could
 * have committed it before returning a timeout, rate limit, or server error.
 * Those responses must be reconciled by durable provider identity; blindly
 * replaying them can duplicate contacts, opportunities, appointments, or
 * other side effects.
 */
function writeFailure(
  response: GhlHttpResponse,
  prefix: string,
): Extract<GhlLeadProviderResult, { outcome: Exclude<GhlLeadProviderResult["outcome"], "succeeded"> }> {
  const uncertain = response.status === 408 || response.status === 429 || response.status >= 500;
  return {
    outcome: uncertain ? "uncertain" : "operator_action_required",
    errorCode: `${prefix}_${response.status}`,
    safeMessage: uncertain
      ? "The GHL write may have completed, so its provider state must be reconciled before replay."
      : "The GHL provider rejected the bounded write request.",
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
    safeMessage: "The GHL provider returned an unexpected result.",
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
  authority?:
    | { kind: "sandbox"; gate: GhlSandboxGateInput }
    | { kind: "production"; gate: GhlProductionGateInput };
};

export class GhlSandboxAdapter implements GhlProviderAdapter, GhlLeadProviderAdapter, GhlPersonalizationProviderAdapter, GhlInboundFormSubmissionsReadAdapter, GhlPeriodicFormSweepReadAdapter {
  readonly kind: "sandbox" | "production";
  readonly networkAccess = "https" as const;
  private readonly credentialRef: string;
  private readonly resolver: GhlCredentialResolver;
  private readonly http: GhlHttpClient;
  private readonly companyId: string;
  private readonly providerEnvironment: "sandbox" | "production";
  private readonly assertAuthority: () => void;

  constructor(options: GhlSandboxAdapterOptions) {
    const authority = options.authority ?? { kind: "sandbox" as const, gate: options.gate };
    if (authority.kind === "production") {
      assertGhlProductionAllowed(authority.gate);
    } else {
      assertGhlSandboxAllowed(authority.gate);
    }
    if (!safeProviderId(options.companyId)) {
      throw new Error("A valid GHL company id is required.");
    }
    this.credentialRef = options.credentialRef;
    this.resolver = options.credentialResolver;
    this.kind = authority.kind;
    this.providerEnvironment = authority.kind;
    this.assertAuthority = authority.kind === "production"
      ? () => { assertGhlProductionAllowed(authority.gate); }
      : () => { assertGhlSandboxAllowed(authority.gate); };
    this.http = options.httpClient ?? new GhlHttpClient({ baseUrl: options.gate.baseUrl });
    this.companyId = options.companyId;
  }

  private withCredential<T>(operation: (credential: string) => Promise<T>) {
    this.assertAuthority();
    return this.resolver.withCredential(this.credentialRef, operation);
  }

  async createLocation(
    input: Parameters<GhlProviderAdapter["createLocation"]>[0],
  ): Promise<GhlLocationCreateResult> {
    if (input.environment !== this.providerEnvironment) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_environment_forbidden",
        safeMessage: `The GHL adapter accepts only ${this.providerEnvironment} locations.`,
        providerRequestId: null,
        httpStatus: null,
      };
    }
    if (
      input.snapshotManifest.environment !== input.environment
      || input.snapshotManifest.status !== "approved"
      || input.snapshotManifest.installationMode !== "preinstalled"
      || !safeProviderId(input.snapshotManifest.providerSnapshotId)
      || !isExactGhlLocationCreateContract(input)
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_snapshot_contract_mismatch",
        safeMessage: "GHL location creation requires the exact approved preinstalled snapshot contract.",
        providerRequestId: null,
        httpStatus: null,
      };
    }
    try {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "POST",
        path: "/locations/",
        credential,
        version: "v3",
        retryMode: "no-retry",
        body: {
          companyId: this.companyId,
          name: buildGhlProviderLocationName(
            input.profile.displayName,
            input.requestFingerprint,
          ),
          country: input.profile.country,
          timezone: input.profile.timezone,
          snapshotId: input.snapshotManifest.providerSnapshotId,
        },
      }));
      if (!response.ok) {
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          return {
            outcome: "uncertain",
            errorCode: `ghl_location_create_ambiguous_${response.status}`,
            safeMessage: "GHL returned a non-conclusive response after location creation was dispatched; reconciliation is required before replay.",
            providerRequestId: response.providerRequestId,
            httpStatus: response.status,
          };
        }
        const failure = requestFailure(response, "ghl_location_create");
        return { ...failure, outcome: "operator_action_required" };
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

  async reconcileLocationCreate(
    input: Parameters<GhlProviderAdapter["reconcileLocationCreate"]>[0],
  ): Promise<GhlLocationReconcileResult> {
    const requestFingerprint = input.requestFingerprint;
    const startedAt = Date.parse(input.visibilityStartedAt);
    const deadlineAt = Date.parse(input.visibilityDeadlineAt);
    const observedAt = Date.parse(input.observedAt);
    if (
      input.environment !== this.providerEnvironment
      || !/^[a-f0-9]{64}$/.test(requestFingerprint)
      || !Number.isFinite(startedAt)
      || !Number.isFinite(deadlineAt)
      || !Number.isFinite(observedAt)
      || deadlineAt <= startedAt
      || observedAt < startedAt
      || !input.profile.displayName.trim()
      || !input.profile.country.trim()
      || !input.profile.timezone.trim()
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_reconciliation_contract_invalid",
        safeMessage: "GHL location reconciliation requires one immutable request identity and bounded visibility window.",
        providerRequestId: null,
        requestFingerprint,
        responseFingerprint: null,
      };
    }

    const expectedName = buildGhlProviderLocationName(
      input.profile.displayName,
      requestFingerprint,
    );
    const expectedCountry = input.profile.country.trim().toUpperCase();
    const expectedTimezone = input.profile.timezone.trim();
    const pageFingerprints: string[] = [];
    const seenProviderLocationIds = new Set<string>();
    const matchedProviderLocationIds: string[] = [];
    let latestProviderRequestId: string | null = null;

    const resultFingerprint = () => buildGhlLocationReconciliationResponseFingerprint({
      requestFingerprint,
      pageFingerprints,
      matchedProviderLocationIds,
    });

    try {
      for (let page = 0; page < GHL_LOCATION_SEARCH_MAX_PAGES; page += 1) {
        const search = new URLSearchParams({
          companyId: this.companyId,
          skip: String(page * GHL_LOCATION_SEARCH_PAGE_LIMIT),
          limit: String(GHL_LOCATION_SEARCH_PAGE_LIMIT),
          order: "asc",
        });
        const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
          method: "GET",
          path: `/locations/search?${search.toString()}`,
          credential,
          version: "v3",
          retryMode: "safe-read",
        }));
        latestProviderRequestId = response.providerRequestId ?? latestProviderRequestId;
        pageFingerprints.push(response.responseFingerprint);

        if (!response.ok) {
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          return {
            outcome: retryable ? "uncertain" : "operator_action_required",
            errorCode: `ghl_location_reconciliation_search_${response.status}`,
            safeMessage: retryable
              ? "The bounded GHL location search did not return a conclusive result."
              : "GHL rejected the agency-scoped location reconciliation search.",
            providerRequestId: latestProviderRequestId,
            requestFingerprint,
            responseFingerprint: resultFingerprint(),
          };
        }

        const locations = asRecord(response.data).locations;
        if (!Array.isArray(locations) || locations.length > GHL_LOCATION_SEARCH_PAGE_LIMIT) {
          return {
            outcome: "operator_action_required",
            errorCode: "ghl_location_reconciliation_schema_invalid",
            safeMessage: "GHL returned a malformed location-search page; absence cannot be proven safely.",
            providerRequestId: latestProviderRequestId,
            requestFingerprint,
            responseFingerprint: resultFingerprint(),
          };
        }

        for (const rawLocation of locations) {
          const location = asRecord(rawLocation);
          const providerLocationId = safeProviderId(location.id);
          const locationName = typeof location.name === "string" ? location.name.trim() : null;
          if (!providerLocationId || locationName === null) {
            return {
              outcome: "operator_action_required",
              errorCode: "ghl_location_reconciliation_candidate_invalid",
              safeMessage: "GHL returned a location without a durable id and name; absence cannot be proven safely.",
              providerRequestId: latestProviderRequestId,
              requestFingerprint,
              responseFingerprint: resultFingerprint(),
            };
          }
          if (seenProviderLocationIds.has(providerLocationId)) {
            return {
              outcome: "operator_action_required",
              errorCode: "ghl_location_reconciliation_pagination_unstable",
              safeMessage: "GHL location-search pagination repeated a provider identity; automatic reconciliation stopped.",
              providerRequestId: latestProviderRequestId,
              requestFingerprint,
              responseFingerprint: resultFingerprint(),
            };
          }
          seenProviderLocationIds.add(providerLocationId);

          if (locationName !== expectedName) continue;
          const country = typeof location.country === "string"
            ? location.country.trim().toUpperCase()
            : null;
          const timezone = typeof location.timezone === "string"
            ? location.timezone.trim()
            : null;
          if (country === null || timezone === null) {
            return {
              outcome: "operator_action_required",
              errorCode: "ghl_location_reconciliation_match_fields_missing",
              safeMessage: "A fingerprint-matched GHL location omitted deterministic match fields; automatic reconciliation stopped.",
              providerRequestId: latestProviderRequestId,
              requestFingerprint,
              responseFingerprint: resultFingerprint(),
            };
          }
          if (country === expectedCountry && timezone === expectedTimezone) {
            matchedProviderLocationIds.push(providerLocationId);
          }
        }

        if (matchedProviderLocationIds.length > 1) {
          return {
            outcome: "operator_action_required",
            errorCode: "ghl_location_reconciliation_multiple_exact_matches",
            safeMessage: "Multiple GHL locations matched the immutable create request; automatic selection is forbidden.",
            providerRequestId: latestProviderRequestId,
            requestFingerprint,
            responseFingerprint: resultFingerprint(),
          };
        }
        if (locations.length < GHL_LOCATION_SEARCH_PAGE_LIMIT) {
          const responseFingerprint = resultFingerprint();
          return matchedProviderLocationIds.length === 1
            ? {
              outcome: "found",
              providerLocationId: matchedProviderLocationIds[0],
              providerRequestId: latestProviderRequestId,
              requestFingerprint,
              responseFingerprint,
            }
            : {
              outcome: "not_found",
              providerRequestId: latestProviderRequestId,
              requestFingerprint,
              responseFingerprint,
            };
        }
      }

      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_reconciliation_search_bound_exhausted",
        safeMessage: "The bounded GHL location search exhausted its pagination limit; absence cannot be proven safely.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: resultFingerprint(),
      };
    } catch (error) {
      if (error instanceof GhlCredentialResolutionError) {
        return {
          outcome: "operator_action_required",
          errorCode: error.code,
          safeMessage: error.message,
          providerRequestId: null,
          requestFingerprint,
          responseFingerprint: pageFingerprints.length > 0 ? resultFingerprint() : null,
        };
      }
      if (error instanceof GhlHttpTransportError) {
        return {
          outcome: "uncertain",
          errorCode: `ghl_location_reconciliation_${error.code}`,
          safeMessage: "The bounded GHL location search did not return a conclusive result.",
          providerRequestId: latestProviderRequestId,
          requestFingerprint,
          responseFingerprint: pageFingerprints.length > 0 ? resultFingerprint() : null,
        };
      }
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_reconciliation_unexpected_response",
        safeMessage: "GHL location reconciliation returned an unexpected result.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: pageFingerprints.length > 0 ? resultFingerprint() : null,
      };
    }
  }

  async finalizeLocationDisplayName(
    input: Parameters<GhlProviderAdapter["finalizeLocationDisplayName"]>[0],
  ): Promise<GhlLocationDisplayNameFinalizeResult> {
    const requestFingerprint = input.requestFingerprint;
    if (
      input.environment !== this.providerEnvironment
      || !safeProviderId(input.providerLocationId)
      || !/^[a-f0-9]{64}$/.test(requestFingerprint)
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_display_name_contract_invalid",
        safeMessage: "GHL display-name finalization requires the exact provider location and immutable request identity.",
        providerRequestId: null,
        requestFingerprint,
        responseFingerprint: null,
        httpStatus: null,
      };
    }

    const cleanName = buildGhlProviderDisplayName(input.profile.displayName);
    const taggedName = buildGhlProviderLocationName(cleanName, requestFingerprint);
    const expectedCountry = input.profile.country.trim().toUpperCase();
    const expectedTimezone = input.profile.timezone.trim();
    const responseFingerprints: string[] = [];
    let latestProviderRequestId: string | null = null;
    const responseFingerprint = () => buildGhlLocationReconciliationResponseFingerprint({
      requestFingerprint,
      pageFingerprints: responseFingerprints,
      matchedProviderLocationIds: [input.providerLocationId],
    });

    const readIdentity = async () => {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "GET",
        path: `/locations/${encodeURIComponent(input.providerLocationId)}`,
        credential,
        version: "v3",
        retryMode: "safe-read",
      }));
      latestProviderRequestId = response.providerRequestId ?? latestProviderRequestId;
      responseFingerprints.push(response.responseFingerprint);
      if (!response.ok) {
        return {
          kind: "failure" as const,
          retryable: response.status === 404
            || response.status === 408
            || response.status === 429
            || response.status >= 500,
          status: response.status,
        };
      }
      const location = asRecord(asRecord(response.data).location);
      const providerLocationId = safeProviderId(location.id);
      const name = typeof location.name === "string" ? location.name.trim() : null;
      const country = typeof location.country === "string"
        ? location.country.trim().toUpperCase()
        : null;
      const timezone = typeof location.timezone === "string"
        ? location.timezone.trim()
        : null;
      if (
        providerLocationId !== input.providerLocationId
        || name === null
        || country !== expectedCountry
        || timezone !== expectedTimezone
      ) {
        return { kind: "invalid" as const, status: response.status };
      }
      return { kind: "identity" as const, name, status: response.status };
    };

    const failureFromRead = (
      read: Awaited<ReturnType<typeof readIdentity>>,
      stage: "pre_update" | "post_update",
    ): GhlLocationDisplayNameFinalizeResult => {
      const retryable = read.kind === "failure" && read.retryable;
      return {
        outcome: retryable ? "retryable_failure" : "operator_action_required",
        errorCode: read.kind === "invalid"
          ? `ghl_location_display_name_${stage}_identity_invalid`
          : `ghl_location_display_name_${stage}_read_${read.status}`,
        safeMessage: retryable
          ? "The exact GHL location could not yet be read back; display-name finalization remains gated."
          : "The GHL location readback did not match the immutable location identity.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprints.length > 0 ? responseFingerprint() : null,
        httpStatus: read.status,
      };
    };

    let initialRead: Awaited<ReturnType<typeof readIdentity>>;
    try {
      initialRead = await readIdentity();
    } catch (error) {
      const credentialFailure = error instanceof GhlCredentialResolutionError;
      return {
        outcome: credentialFailure ? "operator_action_required" : "retryable_failure",
        errorCode: credentialFailure
          ? error.code
          : "ghl_location_display_name_pre_update_read_failed",
        safeMessage: credentialFailure
          ? error.message
          : "The exact GHL location could not yet be read back; display-name finalization remains gated.",
        providerRequestId: null,
        requestFingerprint,
        responseFingerprint: null,
        httpStatus: null,
      };
    }
    if (initialRead.kind !== "identity") return failureFromRead(initialRead, "pre_update");
    if (initialRead.name === cleanName) {
      return {
        outcome: "succeeded",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprint(),
        httpStatus: initialRead.status,
      };
    }
    if (initialRead.name !== taggedName) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_location_display_name_changed_out_of_band",
        safeMessage: "The GHL location name changed outside the immutable create/finalize contract; automatic overwrite is forbidden.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprint(),
        httpStatus: initialRead.status,
      };
    }

    let updateStatus: number | null = null;
    let ambiguousUpdate = false;
    try {
      const update = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "PUT",
        path: `/locations/${encodeURIComponent(input.providerLocationId)}`,
        credential,
        version: "v3",
        retryMode: "no-retry",
        body: {
          companyId: this.companyId,
          name: cleanName,
        },
      }));
      latestProviderRequestId = update.providerRequestId ?? latestProviderRequestId;
      responseFingerprints.push(update.responseFingerprint);
      updateStatus = update.status;
      ambiguousUpdate = update.status === 408 || update.status === 429 || update.status >= 500;
      if (!update.ok && !ambiguousUpdate) {
        return {
          outcome: "operator_action_required",
          errorCode: `ghl_location_display_name_update_${update.status}`,
          safeMessage: "GHL rejected the exact display-name cleanup request.",
          providerRequestId: latestProviderRequestId,
          requestFingerprint,
          responseFingerprint: responseFingerprint(),
          httpStatus: update.status,
        };
      }
    } catch (error) {
      if (error instanceof GhlCredentialResolutionError) {
        return {
          outcome: "operator_action_required",
          errorCode: error.code,
          safeMessage: error.message,
          providerRequestId: latestProviderRequestId,
          requestFingerprint,
          responseFingerprint: responseFingerprints.length > 0 ? responseFingerprint() : null,
          httpStatus: null,
        };
      }
      ambiguousUpdate = true;
    }

    let finalRead: Awaited<ReturnType<typeof readIdentity>>;
    try {
      finalRead = await readIdentity();
    } catch {
      return {
        outcome: "retryable_failure",
        errorCode: "ghl_location_display_name_post_update_read_failed",
        safeMessage: "The idempotent GHL name cleanup was dispatched, but exact readback is not yet conclusive.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprints.length > 0 ? responseFingerprint() : null,
        httpStatus: updateStatus,
      };
    }
    if (finalRead.kind !== "identity") return failureFromRead(finalRead, "post_update");
    if (finalRead.name === cleanName) {
      return {
        outcome: "succeeded",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprint(),
        httpStatus: finalRead.status,
      };
    }
    if (finalRead.name === taggedName) {
      return {
        outcome: "retryable_failure",
        errorCode: ambiguousUpdate
          ? "ghl_location_display_name_update_ambiguous"
          : "ghl_location_display_name_readback_pending",
        safeMessage: "The idempotent GHL name cleanup is not yet visible; bounded retry remains safe and required.",
        providerRequestId: latestProviderRequestId,
        requestFingerprint,
        responseFingerprint: responseFingerprint(),
        httpStatus: updateStatus,
      };
    }
    return {
      outcome: "operator_action_required",
      errorCode: "ghl_location_display_name_post_update_conflict",
      safeMessage: "The GHL location name changed unexpectedly after cleanup; automatic overwrite is forbidden.",
      providerRequestId: latestProviderRequestId,
      requestFingerprint,
      responseFingerprint: responseFingerprint(),
      httpStatus: finalRead.status,
    };
  }

  async installSnapshot(
    input: Parameters<GhlProviderAdapter["installSnapshot"]>[0],
  ): Promise<GhlSnapshotInstallResult> {
    if (input.manifest.installationMode !== "preinstalled") {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_snapshot_push_api_unavailable",
        safeMessage: `GHL exposes snapshot status but no sanctioned snapshot-push API. A preinstalled ${this.providerEnvironment} snapshot is required.`,
        providerRequestId: null,
        httpStatus: null,
      };
    }
    // A preinstalled snapshot has no later "push" receipt to poll. HighLevel's
    // snapshot-status endpoint reports pushes, and returns 422 for a location
    // whose snapshot was loaded when the sub-account was created. Verify the
    // approved manifest through its exact required-object inventory instead.
    const verification = await this.verifyRequiredObjects({
      providerLocationId: input.providerLocationId,
      manifest: input.manifest,
    });
    if (verification.outcome === "verified") {
      return {
        outcome: "succeeded",
        providerRequestId: verification.providerRequestId,
        providerReference:
          `${input.manifest.providerSnapshotId}:${input.providerLocationId}`,
        httpStatus: 200,
      };
    }
    if (verification.outcome === "missing") {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_preinstalled_required_objects_missing",
        safeMessage:
          `The preinstalled GHL snapshot is missing ${verification.missingKeys.length} required object(s).`,
        providerRequestId: verification.providerRequestId,
        httpStatus: 200,
      };
    }
    return {
      outcome: verification.outcome,
      errorCode: verification.errorCode,
      safeMessage: verification.safeMessage,
      providerRequestId: verification.providerRequestId,
      httpStatus: null,
    };
  }

  async getSnapshotStatus(
    input: Parameters<GhlProviderAdapter["getSnapshotStatus"]>[0],
  ): Promise<GhlSnapshotStatusResult> {
    if (
      !safeProviderId(input.providerLocationId)
      || !safeProviderId(input.manifest.providerSnapshotId)
      || input.manifest.environment !== this.providerEnvironment
      || input.manifest.status !== "approved"
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_snapshot_status_contract_invalid",
        safeMessage: "Snapshot status requires exact approved snapshot and sub-account identities.",
        providerRequestId: null,
      };
    }
    try {
      const response = await this.withCredential((credential) => this.http.request<JsonRecord>({
        method: "GET",
        path: `/snapshots/snapshot-status/${encodeURIComponent(input.manifest.providerSnapshotId)}/location/${encodeURIComponent(input.providerLocationId)}`,
        credential,
        version: "v3",
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
      const hasDocumentedWrapper = Object.prototype.hasOwnProperty.call(root, "data");
      const documented = asRecord(root.data);
      const legacy = asRecord(root.snapshotPush);
      let providerPushId: string | null = null;
      let rawStatus = "";
      if (hasDocumentedWrapper) {
        providerPushId = safeProviderId(documented.id);
        const returnedLocationId = safeProviderId(documented.locationId);
        const completed = documented.completed;
        const pending = documented.pending;
        if (
          !providerPushId
          || !returnedLocationId
          || !Array.isArray(completed)
          || !Array.isArray(pending)
          || completed.length > 500
          || pending.length > 500
          || [...completed, ...pending].some((item) =>
            typeof item !== "string" || !item.trim() || item.length > 180
          )
        ) {
          return {
            outcome: "operator_action_required",
            errorCode: "ghl_snapshot_status_receipt_invalid",
            safeMessage: "GHL returned a malformed snapshot-push receipt.",
            providerRequestId: response.providerRequestId,
          };
        }
        if (returnedLocationId !== input.providerLocationId) {
          return {
            outcome: "operator_action_required",
            errorCode: "ghl_snapshot_status_location_mismatch",
            safeMessage: "GHL returned snapshot status for a different sub-account.",
            providerRequestId: response.providerRequestId,
          };
        }
        rawStatus = stringValue(documented, ["status"]);
      } else {
        const returnedLocationId = stringValue(root, ["locationId"])
          || stringValue(legacy, ["locationId"]);
        if (returnedLocationId && (
          !safeProviderId(returnedLocationId)
          || returnedLocationId !== input.providerLocationId
        )) {
          return {
            outcome: "operator_action_required",
            errorCode: "ghl_snapshot_status_location_mismatch",
            safeMessage: "GHL returned snapshot status for a different sub-account.",
            providerRequestId: response.providerRequestId,
          };
        }
        rawStatus = stringValue(root, ["status", "snapshotStatus", "pushStatus"])
          || stringValue(legacy, ["status", "snapshotStatus", "pushStatus"]);
      }
      const normalized = normalizedKey(rawStatus);
      if (["completed", "complete", "success", "succeeded", "ready"].includes(normalized)) {
        return {
          outcome: "ready",
          providerRequestId: response.providerRequestId ?? `response:${response.responseFingerprint}`,
          providerReference: providerPushId
            ?? `${input.manifest.providerSnapshotId}:${input.providerLocationId}`,
        };
      }
      if (["pending", "processing", "queued", "in-progress", "started"].includes(normalized)) {
        return {
          outcome: "pending",
          providerRequestId: response.providerRequestId ?? `response:${response.responseFingerprint}`,
          providerReference: providerPushId
            ?? `${input.manifest.providerSnapshotId}:${input.providerLocationId}`,
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
      if (!response.ok) return writeFailure(response, input.errorPrefix);
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

  async applyCustomValues(input: {
    providerLocationId: string;
    values: Record<string, string>;
  }): Promise<GhlPersonalizationResult> {
    const entries = Object.entries(input.values).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0 || entries.length > 50 || entries.some(([name, value]) =>
      !name.trim() || name.length > 120 || typeof value !== "string" || value.length > 5_000
    )) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_custom_values_contract_invalid",
        safeMessage: "The bounded GHL custom-value personalization contract is invalid.",
        providerRequestId: null,
        responseFingerprint: null,
        providerMutationAttempted: false,
      };
    }
    let mutationAttempted = false;
    try {
      return await this.withCredential(async (credential) => {
        const listed = await this.http.request<JsonRecord>({
          method: "GET",
          path: `/locations/${encodeURIComponent(input.providerLocationId)}/customValues`,
          credential,
          retryMode: "safe-read",
        });
        if (!listed.ok) {
          const failure = requestFailure(listed, "ghl_custom_values_list");
          return { ...failure, responseFingerprint: listed.responseFingerprint, providerMutationAttempted: false };
        }
        const existingRows = asRows(listed.data, ["customValues", "custom_values"]);
        const references: string[] = [];
        let lastRequestId = listed.providerRequestId;
        let lastFingerprint = listed.responseFingerprint;
        for (const [rawName, value] of entries) {
          const name = rawName.trim();
          const existing = existingRows.find((candidate) => stringValue(candidate, ["name"]) === name);
          const existingId = safeProviderId(existing?.id);
          if (existingId && stringValue(existing!, ["value"]) === value) {
            references.push(existingId);
            continue;
          }
          mutationAttempted = true;
          const response = await this.http.request<JsonRecord>({
            method: existingId ? "PUT" : "POST",
            path: existingId
              ? `/locations/${encodeURIComponent(input.providerLocationId)}/customValues/${encodeURIComponent(existingId)}`
              : `/locations/${encodeURIComponent(input.providerLocationId)}/customValues`,
            credential,
            retryMode: "no-retry",
            body: { name, value },
          });
          lastRequestId = response.providerRequestId ?? lastRequestId;
          lastFingerprint = response.responseFingerprint;
          if (!response.ok) {
            const failure = writeFailure(response, "ghl_custom_value_write");
            return { ...failure, responseFingerprint: response.responseFingerprint, providerMutationAttempted: true };
          }
          const responseBody = asRecord(response.data);
          const reference = safeProviderId(asRecord(responseBody.customValue).id) ?? safeProviderId(responseBody.id);
          if (!reference) {
            return {
              outcome: "operator_action_required",
              errorCode: "ghl_custom_value_receipt_invalid",
              safeMessage: "GHL accepted custom-value personalization without a durable object id.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: true,
            };
          }
          references.push(reference);
        }
        return {
          outcome: "succeeded",
          verifiedReferences: references,
          providerRequestId: lastRequestId,
          responseFingerprint: lastFingerprint,
          providerMutationAttempted: mutationAttempted,
        };
      });
    } catch (error) {
      const failure = transportFailure(error, "ghl_custom_values");
      return { ...failure, providerMutationAttempted: mutationAttempted };
    }
  }

  async verifyPreinstalledForms(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<GhlPersonalizationResult> {
    const requiredFormIds = input.requiredFormIds.map((id) => id.trim());
    if (
      !safeProviderId(input.providerLocationId)
      || requiredFormIds.length === 0
      || requiredFormIds.length > 25
      || new Set(requiredFormIds).size !== requiredFormIds.length
      || requiredFormIds.some((id) => !safeProviderId(id))
    ) {
      return { outcome: "operator_action_required", errorCode: "ghl_required_forms_invalid", safeMessage: "Exact preinstalled GHL form IDs are required.", providerRequestId: null, responseFingerprint: null, providerMutationAttempted: false };
    }
    try {
      return await this.withCredential(async (credential) => {
        const pageSize = 50;
        const maximumForms = 1_000;
        const maximumPages = maximumForms / pageSize;
        const observed = new Set<string>();
        const evidence: Array<{ skip: number; count: number; fingerprint: string }> = [];
        let expectedTotal: number | null = null;
        let skip = 0;
        let lastRequestId: string | null = null;
        for (let page = 0; page < maximumPages; page += 1) {
          const parameters = new URLSearchParams({
            locationId: input.providerLocationId,
            skip: String(skip),
            limit: String(pageSize),
          });
          const response = await this.http.request<JsonRecord>({
            method: "GET",
            path: `/forms/?${parameters.toString()}`,
            credential,
            version: "v3",
            retryMode: "safe-read",
          });
          lastRequestId = response.providerRequestId ?? lastRequestId;
          if (!response.ok) {
            const failure = requestFailure(response, "ghl_forms_verify");
            return { ...failure, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
          }
          const root = asRecord(response.data);
          const rows = root.forms;
          const total = root.total;
          if (
            !Array.isArray(rows)
            || !Number.isInteger(total)
            || (total as number) < 0
            || (total as number) > maximumForms
            || rows.length > pageSize
            || (expectedTotal !== null && total !== expectedTotal)
            || skip + rows.length > (total as number)
          ) {
            return { outcome: "operator_action_required", errorCode: "ghl_forms_page_contract_invalid", safeMessage: "GHL returned an inconsistent or unbounded forms page.", providerRequestId: response.providerRequestId, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
          }
          expectedTotal = total as number;
          if (skip < expectedTotal && rows.length === 0) {
            return { outcome: "operator_action_required", errorCode: "ghl_forms_pagination_nonprogress", safeMessage: "GHL forms pagination stopped before the declared total.", providerRequestId: response.providerRequestId, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
          }
          for (const rawRow of rows) {
            const row = asRecord(rawRow);
            const formId = safeProviderId(row.id);
            const locationId = safeProviderId(row.locationId);
            if (!formId || !locationId) {
              return { outcome: "operator_action_required", errorCode: "ghl_form_identity_invalid", safeMessage: "GHL returned a form without stable tenant identity.", providerRequestId: response.providerRequestId, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
            }
            if (locationId !== input.providerLocationId) {
              return { outcome: "operator_action_required", errorCode: "ghl_form_location_mismatch", safeMessage: "GHL returned a form from a different sub-account.", providerRequestId: response.providerRequestId, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
            }
            if (observed.has(formId)) {
              return { outcome: "operator_action_required", errorCode: "ghl_form_identity_duplicate", safeMessage: "GHL returned one form identity more than once across pagination.", providerRequestId: response.providerRequestId, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
            }
            observed.add(formId);
          }
          evidence.push({ skip, count: rows.length, fingerprint: response.responseFingerprint });
          skip += rows.length;
          if (skip === expectedTotal) break;
        }
        if (expectedTotal === null || skip !== expectedTotal) {
          return { outcome: "operator_action_required", errorCode: "ghl_forms_pagination_limit_reached", safeMessage: "GHL forms exceeded the bounded verification window.", providerRequestId: lastRequestId, responseFingerprint: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"), providerMutationAttempted: false };
        }
        const missing = requiredFormIds.filter((id) => !observed.has(id));
        const responseFingerprint = createHash("sha256")
          .update(JSON.stringify(evidence))
          .digest("hex");
        if (missing.length > 0) {
          return { outcome: "operator_action_required", errorCode: "ghl_preinstalled_forms_missing", safeMessage: "One or more exact preinstalled GHL forms are missing.", providerRequestId: lastRequestId, responseFingerprint, providerMutationAttempted: false };
        }
        return { outcome: "succeeded", verifiedReferences: [...requiredFormIds], providerRequestId: lastRequestId, responseFingerprint, providerMutationAttempted: false };
      });
    } catch (error) {
      const failure = transportFailure(error, "ghl_forms_verify");
      return { ...failure, providerMutationAttempted: false };
    }
  }

  /**
   * Proves the credential is accepted by the exact submissions endpoint, not
   * merely the form-definition endpoint. The impossible probe identity and
   * 1970 date fence are intentionally non-customer-bearing. Any returned row
   * is discarded and fails closed; no response body leaves this method.
   */
  async verifyFormSubmissionsReadScope(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<GhlPersonalizationResult> {
    const formIds = [...new Set(input.requiredFormIds.map((id) => id.trim()))].sort();
    if (
      !safeProviderId(input.providerLocationId)
      || formIds.length === 0
      || formIds.length > 25
      || formIds.some((id) => !safeProviderId(id))
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_form_submissions_scope_probe_invalid",
        safeMessage: "Exact preinstalled GHL form IDs are required for the read-scope probe.",
        providerRequestId: null,
        responseFingerprint: null,
        providerMutationAttempted: false,
      };
    }
    try {
      return await this.withCredential(async (credential) => {
        let lastRequestId: string | null = null;
        let lastFingerprint = "";
        for (const formId of formIds) {
          const parameters = new URLSearchParams({
            locationId: input.providerLocationId,
            page: "1",
            limit: "1",
            formId,
            q: "dealflow_scope_probe_no_contact_000000000000",
            startAt: "1970-01-01",
            endAt: "1970-01-01",
          });
          const response = await this.http.request<JsonRecord>({
            method: "GET",
            path: `/forms/submissions?${parameters.toString()}`,
            credential,
            version: "v3",
            // The fenced authority command is the retry boundary. One bounded
            // GET per form avoids an unbounded interactive rotation command.
            retryMode: "no-retry",
          });
          lastRequestId = response.providerRequestId ?? lastRequestId;
          lastFingerprint = response.responseFingerprint;
          if (!response.ok) {
            const failure = requestFailure(response, "ghl_form_submissions_scope_probe");
            return { ...failure, responseFingerprint: response.responseFingerprint, providerMutationAttempted: false };
          }
          const root = asRecord(response.data);
          const submissions = root.submissions;
          const meta = asRecord(root.meta);
          if (
            !Array.isArray(submissions)
            || submissions.length !== 0
            || (meta.nextPage !== null && meta.nextPage !== undefined)
          ) {
            return {
              outcome: "operator_action_required",
              errorCode: "ghl_form_submissions_scope_probe_unbounded",
              safeMessage: "The zero-customer GHL submissions scope probe returned unexpected data or pagination.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false,
            };
          }
        }
        return {
          outcome: "succeeded",
          verifiedReferences: formIds,
          providerRequestId: lastRequestId,
          responseFingerprint: lastFingerprint,
          providerMutationAttempted: false,
        };
      });
    } catch (error) {
      const failure = transportFailure(error, "ghl_form_submissions_scope_probe");
      return { ...failure, providerMutationAttempted: false };
    }
  }

  async readFormSubmissions(input: {
    providerLocationId: string;
    providerContactId: string;
    requiredFormIds: string[];
    allowedFieldIds: string[];
    windowStart: string;
    windowEnd: string;
    limitPerForm?: number;
  }): Promise<GhlInboundFormSubmissionsReadResult> {
    const uniqueFormIds = [...new Set(input.requiredFormIds.map((id) => id.trim()))].sort();
    const uniqueAllowedFieldIds = [...new Set(input.allowedFieldIds.map((id) => id.trim()))].sort();
    const allowedFieldIds = new Set(uniqueAllowedFieldIds);
    // GHL's provider-side date filters are day-only and can be interpreted in
    // the location timezone. Expand one UTC day on both sides, then apply the
    // exact ISO window to every normalized row below.
    const startAt = expandedDateOnly(input.windowStart, -1);
    const endAt = expandedDateOnly(input.windowEnd, 1);
    const limit = Math.min(Math.max(input.limitPerForm ?? 20, 1), 20);
    const exactWindowMs = Date.parse(input.windowEnd) - Date.parse(input.windowStart);
    if (
      !safeProviderId(input.providerLocationId)
      || !safeProviderId(input.providerContactId)
      || uniqueFormIds.length === 0
      || uniqueFormIds.length > 25
      || uniqueFormIds.some((id) => !safeProviderId(id))
      || uniqueAllowedFieldIds.length > 125
      || uniqueAllowedFieldIds.some((id) => !/^[A-Za-z0-9_-]{3,180}$/.test(id))
      || !startAt
      || !endAt
      || !Number.isFinite(exactWindowMs)
      || exactWindowMs < 0
      || exactWindowMs > 48 * 60 * 60 * 1_000
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_form_submissions_read_contract_invalid",
        safeMessage: "The bounded GHL form-submission read contract is invalid.",
        providerRequestId: null,
        responseFingerprint: null,
        providerMutationAttempted: false,
      };
    }

    try {
      return await this.withCredential(async (credential) => {
        const submissions = new Map<string, GhlInboundFormSubmission>();
        const evidence: Array<{ formId: string; providerRequestId: string | null; fingerprint: string }> = [];
        for (const formId of uniqueFormIds) {
          const parameters = new URLSearchParams({
            locationId: input.providerLocationId,
            page: "1",
            limit: String(limit),
            formId,
            q: input.providerContactId,
            startAt,
            endAt,
          });
          const response = await this.http.request<JsonRecord>({
            method: "GET",
            path: `/forms/submissions?${parameters.toString()}`,
            credential,
            version: "v3",
            // Reconciliation itself is the durable retry boundary. Retrying
            // each of up to 25 form reads inside one system-job invocation can
            // starve every later stage, so each GET gets one bounded attempt.
            retryMode: "no-retry",
          });
          if (!response.ok) return formReadFailure(response, "ghl_form_submissions_read");
          const root = asRecord(response.data);
          if (!Array.isArray(root.submissions)) {
            return {
              outcome: "operator_action_required" as const,
              errorCode: "ghl_form_submissions_response_invalid",
              safeMessage: "GHL returned a malformed form-submission response.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false as const,
            };
          }
          const meta = asRecord(root.meta);
          if (
            (meta.nextPage !== null && meta.nextPage !== undefined)
            || (meta.nextPage === undefined && root.submissions.length >= limit)
          ) {
            return {
              outcome: "operator_action_required" as const,
              errorCode: "ghl_form_submissions_result_truncated",
              safeMessage: "The bounded GHL form-submission result requires operator reconciliation.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false as const,
            };
          }
          for (const candidate of root.submissions) {
            const parsed = parseInboundFormSubmission(candidate, allowedFieldIds);
            if (!parsed) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_form_submission_row_invalid",
                safeMessage: "GHL returned a form submission without stable routing identity.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            if (parsed.providerFormId !== formId) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_form_submission_form_scope_mismatch",
                safeMessage: "GHL returned a form submission outside the exact requested form scope.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            if (
              parsed.providerContactId !== input.providerContactId
              || Date.parse(parsed.submittedAt) < Date.parse(input.windowStart)
              || Date.parse(parsed.submittedAt) > Date.parse(input.windowEnd)
            ) {
              // q and day-level date filters are provider-side fuzzy filters.
              // Only exact contact and timestamp evidence may leave the adapter.
              continue;
            }
            const prior = submissions.get(parsed.providerSubmissionId);
            if (prior && JSON.stringify(prior) !== JSON.stringify(parsed)) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_form_submission_identity_conflict",
                safeMessage: "GHL returned conflicting rows for one stable submission identity.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            submissions.set(parsed.providerSubmissionId, parsed);
          }
          evidence.push({
            formId,
            providerRequestId: response.providerRequestId,
            fingerprint: response.responseFingerprint,
          });
        }
        return {
          outcome: "succeeded" as const,
          submissions: [...submissions.values()].sort((left, right) =>
            left.submittedAt.localeCompare(right.submittedAt)
              || left.providerSubmissionId.localeCompare(right.providerSubmissionId)
          ),
          providerRequestIds: evidence.flatMap((item) => item.providerRequestId ? [item.providerRequestId] : []),
          responseFingerprint: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
          requestCount: evidence.length,
          providerMutationAttempted: false as const,
        };
      });
    } catch (error) {
      return formReadTransportFailure(error);
    }
  }

  async readPeriodicFormSubmissionWindow(input: {
    providerLocationId: string;
    providerFormId: string;
    allowedFieldIds: string[];
    windowStart: string;
    windowEnd: string;
    maxPages?: number;
    maxSubmissions?: number;
  }): Promise<GhlPeriodicFormSweepReadResult> {
    const providerLocationId = input.providerLocationId.trim();
    const providerFormId = input.providerFormId.trim();
    const uniqueAllowedFieldIds = [...new Set(input.allowedFieldIds.map((id) => id.trim()))].sort();
    const allowedFieldIds = new Set(uniqueAllowedFieldIds);
    const windowStartMs = Date.parse(input.windowStart);
    const windowEndMs = Date.parse(input.windowEnd);
    const startAt = expandedDateOnly(input.windowStart, -1);
    const endAt = expandedDateOnly(input.windowEnd, 1);
    // Ten full pages is the hard per-cursor wall-time boundary (at the shared
    // 3s HTTP timeout: <=30s before application overhead). Higher-volume
    // provider-day results fail closed without cursor advancement and require
    // an operator-approved provider-supported partition strategy.
    const maxPages = Math.min(Math.max(input.maxPages ?? 10, 1), 10);
    const maxSubmissions = Math.min(Math.max(input.maxSubmissions ?? 1_000, 1), 1_000);
    if (
      !safeProviderId(providerLocationId)
      || !safeProviderId(providerFormId)
      || uniqueAllowedFieldIds.length > 125
      || uniqueAllowedFieldIds.some((id) => !/^[A-Za-z0-9_-]{3,180}$/.test(id))
      || !startAt
      || !endAt
      || !Number.isFinite(windowStartMs)
      || !Number.isFinite(windowEndMs)
      || windowEndMs <= windowStartMs
      || windowEndMs - windowStartMs > 48 * 60 * 60 * 1_000
    ) {
      return {
        outcome: "operator_action_required",
        errorCode: "ghl_periodic_form_sweep_read_contract_invalid",
        safeMessage: "The bounded GHL periodic form-submission read contract is invalid.",
        providerRequestId: null,
        responseFingerprint: null,
        providerMutationAttempted: false,
      };
    }

    try {
      return await this.withCredential(async (credential) => {
        const submissions: GhlInboundFormSubmission[] = [];
        const seen = new Map<string, string>();
        const providerRequestIds: string[] = [];
        const responseEvidence: Array<{ page: number; fingerprint: string; requestId: string | null }> = [];
        let fetchedRowCount = 0;
        let expectedTotal: number | null = null;
        let expectedPageCount: number | null = null;

        for (let page = 1; page <= maxPages; page += 1) {
          const parameters = new URLSearchParams({
            locationId: providerLocationId,
            page: String(page),
            limit: "100",
            formId: providerFormId,
            startAt,
            endAt,
          });
          const response = await this.http.request<JsonRecord>({
            method: "GET",
            path: `/forms/submissions?${parameters.toString()}`,
            credential,
            version: "v3",
            retryMode: "no-retry",
          });
          if (!response.ok) return formReadFailure(response, "ghl_periodic_form_sweep_read");
          const root = asRecord(response.data);
          const rows = root.submissions;
          const meta = asRecord(root.meta);
          const total = meta.total;
          const currentPage = meta.currentPage;
          const nextPage = meta.nextPage;
          const prevPage = meta.prevPage;
          if (
            !Array.isArray(rows)
            || !Number.isSafeInteger(total)
            || (total as number) < 0
            || !Number.isSafeInteger(currentPage)
            || currentPage !== page
            || !(
              nextPage === null
              || (Number.isSafeInteger(nextPage) && (nextPage as number) > 0)
            )
            || !(
              prevPage === null
              || (Number.isSafeInteger(prevPage) && (prevPage as number) > 0)
            )
          ) {
            return {
              outcome: "operator_action_required" as const,
              errorCode: "ghl_periodic_form_sweep_pagination_meta_invalid",
              safeMessage: "GHL returned malformed periodic form-submission pagination metadata.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false as const,
            };
          }
          const pageTotal = total as number;
          const pageCount = Math.max(1, Math.ceil(pageTotal / 100));
          const expectedPrevious = page === 1 ? null : page - 1;
          const expectedNext = page < pageCount ? page + 1 : null;
          const expectedRows = page < pageCount ? 100 : Math.max(pageTotal - ((page - 1) * 100), 0);
          if (
            (expectedTotal !== null && pageTotal !== expectedTotal)
            || (expectedPageCount !== null && pageCount !== expectedPageCount)
            || prevPage !== expectedPrevious
            || nextPage !== expectedNext
            || rows.length !== expectedRows
          ) {
            return {
              outcome: "retryable_failure" as const,
              errorCode: "ghl_periodic_form_sweep_pagination_unstable",
              safeMessage: "GHL changed the live form-submission result while it was being paged; the closed window will be retried without advancing its cursor.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false as const,
            };
          }
          expectedTotal ??= pageTotal;
          expectedPageCount ??= pageCount;
          if (pageCount > maxPages || pageTotal > maxSubmissions) {
            return {
              outcome: "operator_action_required" as const,
              errorCode: "ghl_periodic_form_sweep_work_cap_exceeded",
              safeMessage: "The periodic GHL form-submission window exceeds its bounded work cap.",
              providerRequestId: response.providerRequestId,
              responseFingerprint: response.responseFingerprint,
              providerMutationAttempted: false as const,
            };
          }

          for (const candidate of rows) {
            const raw = asRecord(candidate);
            if (
              (raw.locationId !== undefined && raw.locationId !== providerLocationId)
              || (raw.location_id !== undefined && raw.location_id !== providerLocationId)
            ) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_periodic_form_sweep_location_scope_mismatch",
                safeMessage: "GHL returned a form submission outside the exact requested location scope.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            const parsed = parseInboundFormSubmission(candidate, allowedFieldIds);
            if (!parsed) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_periodic_form_sweep_row_invalid",
                safeMessage: "GHL returned a malformed periodic form-submission row.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            if (parsed.providerFormId !== providerFormId) {
              return {
                outcome: "operator_action_required" as const,
                errorCode: "ghl_periodic_form_sweep_row_scope_mismatch",
                safeMessage: "GHL returned a successful row outside the exact periodic sweep scope.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            if (seen.has(parsed.providerSubmissionId)) {
              const identical = seen.get(parsed.providerSubmissionId) === parsed.submissionFingerprint;
              return {
                outcome: identical ? "retryable_failure" as const : "operator_action_required" as const,
                errorCode: identical
                  ? "ghl_periodic_form_sweep_duplicate_submission"
                  : "ghl_periodic_form_sweep_submission_identity_conflict",
                safeMessage: identical
                  ? "GHL pagination shifted while the live submission result was being read; the closed window will be retried without cursor advancement."
                  : "GHL returned conflicting data for one stable submission identity.",
                providerRequestId: response.providerRequestId,
                responseFingerprint: response.responseFingerprint,
                providerMutationAttempted: false as const,
              };
            }
            seen.set(parsed.providerSubmissionId, parsed.submissionFingerprint);
            fetchedRowCount += 1;
            // startAt/endAt are provider day-only filters and are deliberately
            // expanded. Same-route rows outside the closed ISO window are
            // expected: validate and deduplicate them above, then locally
            // retain only [windowStart, windowEnd) for durable enqueue.
            if (
              Date.parse(parsed.submittedAt) >= windowStartMs
              && Date.parse(parsed.submittedAt) < windowEndMs
            ) submissions.push(parsed);
          }
          if (response.providerRequestId) providerRequestIds.push(response.providerRequestId);
          responseEvidence.push({
            page,
            fingerprint: response.responseFingerprint,
            requestId: response.providerRequestId,
          });
          if (nextPage === null) break;
        }

        if (expectedTotal === null || expectedPageCount === null || fetchedRowCount !== expectedTotal) {
          return {
            outcome: "retryable_failure" as const,
            errorCode: "ghl_periodic_form_sweep_result_incomplete",
            safeMessage: "The live GHL form-submission result shifted before pagination completed; the closed window will be retried without cursor advancement.",
            providerRequestId: providerRequestIds.at(-1) ?? null,
            responseFingerprint: responseEvidence.at(-1)?.fingerprint ?? null,
            providerMutationAttempted: false as const,
          };
        }
        const responseFingerprint = createHash("sha256").update(JSON.stringify({
          providerLocationId,
          providerFormId,
          windowStart: new Date(windowStartMs).toISOString(),
          windowEnd: new Date(windowEndMs).toISOString(),
          total: expectedTotal,
          pages: responseEvidence,
          submissions: submissions.map((submission) => ({
            id: submission.providerSubmissionId,
            fingerprint: submission.submissionFingerprint,
          })),
        })).digest("hex");
        return {
          outcome: "succeeded" as const,
          submissions,
          providerRequestIds,
          responseFingerprint,
          requestCount: responseEvidence.length,
          pageCount: expectedPageCount,
          observedTotal: expectedTotal,
          providerMutationAttempted: false as const,
        };
      });
    } catch (error) {
      return formReadTransportFailure(error);
    }
  }
}
