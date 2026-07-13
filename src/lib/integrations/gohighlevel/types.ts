export const GHL_ENVIRONMENTS = ["production", "sandbox", "test"] as const;
export type GhlEnvironment = (typeof GHL_ENVIRONMENTS)[number];

export const GHL_PROVISIONING_STATES = [
  "requested",
  "location_create_requested",
  "location_uncertain",
  "location_assigned",
  "snapshot_install_requested",
  "snapshot_installing",
  "snapshot_verifying",
  "required_objects_verifying",
  "ready",
  "retryable_failure",
  "operator_action_required",
  "canceled",
] as const;

export type GhlProvisioningState = (typeof GHL_PROVISIONING_STATES)[number];

export type GhlRetryResumeState = Extract<
  GhlProvisioningState,
  | "location_create_requested"
  | "snapshot_install_requested"
  | "snapshot_verifying"
  | "required_objects_verifying"
>;

export const GHL_PROVIDER_OPERATIONS = [
  "location_create",
  "location_reconcile",
  "snapshot_install",
  "snapshot_status",
  "required_objects_verify",
  "lead_contact_upsert",
  "lead_opportunity_upsert",
  "lead_tag_apply",
  "lead_workflow_enroll",
  "appointment_sync",
] as const;

export type GhlProviderOperation = (typeof GHL_PROVIDER_OPERATIONS)[number];

export type GhlTenantBinding = {
  organizationId: string;
  tenantKind: "direct_realtor" | "partner_child";
  partnerId: string | null;
  status: "active" | "inactive";
};

export type GhlRequiredObject = {
  kind: "pipeline" | "stage" | "workflow" | "tag" | "calendar" | "custom_field";
  key: string;
  minimumCount?: number;
  providerObjectId?: string;
};

export const GHL_CAMPAIGN_PERSONALIZATION_FIELDS = [
  "campaignId",
  "organizationId",
  "selectedCreativeId",
  "campaignMode",
  "offer",
  "market",
  "audience",
  "propertyType",
  "priceRange",
  "headline",
  "primaryText",
  "cta",
  "agentName",
  "brokerageName",
  "phone",
  "language",
  "themePrimaryColor",
  "themeSecondaryColor",
  "themeAccentColor",
  "logoUrl",
] as const;

export type GhlCampaignPersonalizationField =
  (typeof GHL_CAMPAIGN_PERSONALIZATION_FIELDS)[number];

export type GhlInboundQuestionMapping = {
  fieldId: string;
  question: string;
};

export type GhlInboundQuestionMappings =
  | []
  | [GhlInboundQuestionMapping]
  | [GhlInboundQuestionMapping, GhlInboundQuestionMapping]
  | [GhlInboundQuestionMapping, GhlInboundQuestionMapping, GhlInboundQuestionMapping];

export type GhlCampaignPersonalizationSlot = {
  slotKey: string;
  destinationUrl: string;
  requiredFormIds: string[];
  customValueNames: Record<GhlCampaignPersonalizationField, string>;
  inboundSmsConsentFieldId?: string;
  inboundSmsConsentPolicyVersion?: string;
  inboundSmsConsentCopy?: string;
  inboundAdvertisingConsentFieldId?: string;
  inboundAdvertisingConsentPolicyVersion?: string;
  inboundQuestionContractVersion?: string;
  inboundQuestionMappings?: GhlInboundQuestionMappings;
};

export type GhlSnapshotPersonalizationContract = {
  customValues: Record<string, string>;
  requiredFormIds: string[];
  destinationUrl: string;
  inboundSmsConsentFieldId?: string;
  inboundSmsConsentPolicyVersion?: string;
  inboundSmsConsentCopy?: string;
  inboundAdvertisingConsentFieldId?: string;
  inboundAdvertisingConsentPolicyVersion?: string;
  inboundQuestionContractVersion?: string;
  inboundQuestionMappings?: GhlInboundQuestionMappings;
  campaignSlots?: GhlCampaignPersonalizationSlot[];
};

export type GhlSnapshotManifest = {
  id: string;
  environment: GhlEnvironment;
  snapshotKey: string;
  snapshotVersion: string;
  providerSnapshotId: string;
  installationMode?: "preinstalled" | "provider_api";
  personalizationContract?: GhlSnapshotPersonalizationContract;
  requiredObjects: GhlRequiredObject[];
  status: "draft" | "approved" | "retired";
};

export type GhlProvisioningRequest = {
  organizationId: string;
  environment: GhlEnvironment;
  activationEventId: string;
  installationId: string;
  snapshotManifest: GhlSnapshotManifest;
  locationProfile: {
    displayName: string;
    country: string;
    timezone: string;
  };
};

export type GhlProvisioningRun = {
  id: string;
  organizationId: string;
  environment: GhlEnvironment;
  activationEventId: string;
  installationId: string;
  snapshotManifest: GhlSnapshotManifest;
  locationProfile: GhlProvisioningRequest["locationProfile"];
  idempotencyKey: string;
  state: GhlProvisioningState;
  resumeState: GhlRetryResumeState | null;
  reconcileBeforeRetry: boolean;
  locationMappingId: string | null;
  providerLocationId: string | null;
  attemptCount: number;
  maxAttempts: number;
  revision: number;
  lastReconciledAt: string | null;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  snapshotVerifiedAt: string | null;
  requiredObjectsVerifiedAt: string | null;
  requestedAt: string;
  readyAt: string | null;
  updatedAt: string;
};

export type GhlLocationAssignment = {
  id: string;
  organizationId: string;
  installationId: string;
  environment: GhlEnvironment;
  providerLocationId: string;
  snapshotManifestId: string;
  status: "provisioning" | "active" | "inactive" | "operator_action_required";
  snapshotVerifiedAt: string | null;
  requiredObjectsVerifiedAt: string | null;
};

export type GhlOutboxStatus =
  | "pending"
  | "dispatching"
  | "uncertain"
  | "succeeded"
  | "retryable_failure"
  | "operator_action_required"
  | "canceled";

export type GhlProviderOutboxRecord = {
  id: string;
  organizationId: string;
  provisioningRunId: string | null;
  operation: GhlProviderOperation;
  idempotencyKey: string;
  status: GhlOutboxStatus;
  requestPayload: Record<string, string | number | boolean | null>;
  attemptCount: number;
  availableAt: string;
  lastErrorCode: string | null;
  lockedBy: string | null;
  leaseToken: string | null;
  leaseGeneration: number;
  leaseExpiresAt: string | null;
};

export type GhlProviderOutboxLease = {
  workerId: string;
  token: string;
  generation: number;
  expiresAt: string;
};

export type GhlProviderReceipt = {
  outboxId: string;
  attemptNumber: number;
  outcome:
    | "accepted"
    | "succeeded"
    | "not_found"
    | "uncertain"
    | "retryable_failure"
    | "operator_action_required";
  providerRequestId: string | null;
  providerReference: string | null;
  httpStatus: number | null;
  responseFingerprint: string | null;
  metadata: Record<string, string | number | boolean | null>;
  receivedAt: string;
};

export type GhlOperatorRequest = {
  organizationId: string;
  provisioningRunId: string;
  requestKind:
    | "location_reconciliation"
    | "snapshot_verification"
    | "required_object_repair"
    | "funnel_publication"
    | "lead_effect_reconciliation";
  blockerCode: string;
  idempotencyKey: string;
  details: Record<string, string | number | boolean | null>;
};

export type GhlLocationCreateResult =
  | {
      outcome: "succeeded";
      providerLocationId: string;
      providerRequestId: string;
      providerReference: string;
      httpStatus: number;
    }
  | {
      outcome: "uncertain" | "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      httpStatus: number | null;
    };

export type GhlLocationReconcileResult =
  | {
      outcome: "found";
      providerLocationId: string;
      providerRequestId: string;
    }
  | {
      outcome: "not_found";
      providerRequestId: string;
    }
  | {
      outcome: "uncertain" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
    };

export type GhlSnapshotInstallResult =
  | {
      outcome: "accepted" | "succeeded";
      providerRequestId: string;
      providerReference: string;
      httpStatus: number;
    }
  | {
      outcome: "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      httpStatus: number | null;
    };

export type GhlSnapshotStatusResult =
  | {
      outcome: "pending" | "ready";
      providerRequestId: string;
      providerReference: string;
    }
  | {
      outcome: "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
    };

export type GhlRequiredObjectsResult =
  | {
      outcome: "verified";
      verifiedKeys: string[];
      providerRequestId: string;
    }
  | {
      outcome: "missing";
      verifiedKeys: string[];
      missingKeys: string[];
      providerRequestId: string;
    }
  | {
      outcome: "retryable_failure";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
    };

/**
 * Immutable input for the one non-retryable Create Sub-Account request. The
 * full approved manifest is carried to the adapter so its fingerprint can be
 * recomputed immediately before the provider mutation.
 */
export type GhlLocationCreateInput = {
  idempotencyKey: string;
  installationId: string;
  environment: GhlEnvironment;
  organizationId: string;
  profile: GhlProvisioningRequest["locationProfile"];
  snapshotManifest: GhlSnapshotManifest;
  snapshotManifestFingerprint: string;
  requestFingerprint: string;
};

export interface GhlProviderAdapter {
  readonly kind: "fake" | "sandbox" | "production";
  readonly networkAccess: "none" | "https";
  createLocation(input: GhlLocationCreateInput): Promise<GhlLocationCreateResult>;
  reconcileLocationCreate(input: {
    idempotencyKey: string;
    installationId: string;
    environment: GhlEnvironment;
  }): Promise<GhlLocationReconcileResult>;
  installSnapshot(input: {
    idempotencyKey: string;
    providerLocationId: string;
    manifest: GhlSnapshotManifest;
  }): Promise<GhlSnapshotInstallResult>;
  getSnapshotStatus(input: {
    providerLocationId: string;
    manifest: GhlSnapshotManifest;
  }): Promise<GhlSnapshotStatusResult>;
  verifyRequiredObjects(input: {
    providerLocationId: string;
    manifest: GhlSnapshotManifest;
  }): Promise<GhlRequiredObjectsResult>;
}

export type GhlLeadIdentity = {
  id: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
};

export type GhlLeadProviderResult =
  | {
      outcome: "succeeded";
      providerRequestId: string | null;
      providerReference: string;
      httpStatus: number;
      responseFingerprint: string;
      providerMutationAttempted?: boolean;
    }
  | {
      outcome: "uncertain" | "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      httpStatus: number | null;
      responseFingerprint: string | null;
      retryAfterMs?: number;
      providerMutationAttempted?: boolean;
    };

export interface GhlLeadProviderAdapter {
  readonly kind: "sandbox" | "production";
  readonly networkAccess: "https";
  upsertContact(input: {
    idempotencyKey: string;
    providerLocationId: string;
    lead: GhlLeadIdentity;
  }): Promise<GhlLeadProviderResult>;
  upsertOpportunity(input: {
    idempotencyKey: string;
    providerLocationId: string;
    providerContactId: string;
    pipelineId: string;
    stageId: string;
    opportunityName: string;
  }): Promise<GhlLeadProviderResult>;
  applyTag(input: {
    idempotencyKey: string;
    providerLocationId: string;
    providerContactId: string;
    tag: string;
  }): Promise<GhlLeadProviderResult>;
  enrollWorkflow(input: {
    idempotencyKey: string;
    providerLocationId: string;
    providerContactId: string;
    workflowId: string;
  }): Promise<GhlLeadProviderResult>;
  syncAppointment(input: {
    idempotencyKey: string;
    providerLocationId: string;
    providerContactId: string;
    calendarId: string;
    startTime: string;
    endTime: string;
    title: string;
  }): Promise<GhlLeadProviderResult>;
}

export type GhlPersonalizationResult =
  | {
      outcome: "succeeded";
      verifiedReferences: string[];
      providerRequestId: string | null;
      responseFingerprint: string;
      providerMutationAttempted: boolean;
    }
  | {
      outcome: "uncertain" | "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      responseFingerprint: string | null;
      providerMutationAttempted: boolean;
    };

export interface GhlPersonalizationProviderAdapter {
  applyCustomValues(input: {
    providerLocationId: string;
    values: Record<string, string>;
  }): Promise<GhlPersonalizationResult>;
  verifyPreinstalledForms(input: {
    providerLocationId: string;
    requiredFormIds: string[];
  }): Promise<GhlPersonalizationResult>;
}

export type GhlInboundFormQualificationField = {
  id: string;
  value: string | number | boolean;
};

export type GhlInboundFormAttribution = {
  fbc: string | null;
  fbp: string | null;
  pageUrl: string | null;
  referrer: string | null;
  adSource: string | null;
  source: string | null;
  medium: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  adId: string | null;
};

/**
 * A bounded, normalized projection of one provider form submission. Raw GHL
 * responses are intentionally never returned to callers or persisted by this
 * adapter contract.
 */
export type GhlInboundFormSubmission = {
  providerSubmissionId: string;
  providerFormId: string;
  providerContactId: string;
  submittedAt: string;
  submissionFingerprint: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  qualification: {
    fields: GhlInboundFormQualificationField[];
  };
  attribution: GhlInboundFormAttribution;
};

export type GhlInboundFormSubmissionsReadResult =
  | {
      outcome: "succeeded";
      submissions: GhlInboundFormSubmission[];
      providerRequestIds: string[];
      responseFingerprint: string;
      requestCount: number;
      providerMutationAttempted: false;
    }
  | {
      outcome: "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      responseFingerprint: string | null;
      retryAfterMs?: number;
      providerMutationAttempted: false;
    };

export interface GhlInboundFormSubmissionsReadAdapter {
  readonly kind: "sandbox" | "production";
  readonly networkAccess: "https";
  readFormSubmissions(input: {
    providerLocationId: string;
    providerContactId: string;
    requiredFormIds: string[];
    allowedFieldIds: string[];
    windowStart: string;
    windowEnd: string;
    limitPerForm?: number;
  }): Promise<GhlInboundFormSubmissionsReadResult>;
}

/**
 * A complete, immutable provider window for one exact location/form route.
 * Unlike contact-webhook reconciliation, this contract deliberately has no
 * contact query: it is the durable recovery path for submissions whose
 * ContactCreate/ContactUpdate webhook never arrived.
 */
export type GhlPeriodicFormSweepReadResult =
  | {
      outcome: "succeeded";
      submissions: GhlInboundFormSubmission[];
      providerRequestIds: string[];
      responseFingerprint: string;
      requestCount: number;
      pageCount: number;
      observedTotal: number;
      providerMutationAttempted: false;
    }
  | {
      outcome: "retryable_failure" | "operator_action_required";
      errorCode: string;
      safeMessage: string;
      providerRequestId: string | null;
      responseFingerprint: string | null;
      retryAfterMs?: number;
      providerMutationAttempted: false;
    };

export interface GhlPeriodicFormSweepReadAdapter {
  readonly kind: "sandbox" | "production";
  readonly networkAccess: "https";
  readPeriodicFormSubmissionWindow(input: {
    providerLocationId: string;
    providerFormId: string;
    allowedFieldIds: string[];
    windowStart: string;
    windowEnd: string;
    maxPages?: number;
    maxSubmissions?: number;
  }): Promise<GhlPeriodicFormSweepReadResult>;
}

export interface GhlProvisioningRepository {
  getOrCreateRun(input: {
    request: GhlProvisioningRequest;
    idempotencyKey: string;
    now: string;
  }): Promise<GhlProvisioningRun>;
  getRun(runId: string): Promise<GhlProvisioningRun | null>;
  saveRun(run: GhlProvisioningRun, expectedRevision: number): Promise<GhlProvisioningRun>;
  ensureOutbox(input: {
    run: GhlProvisioningRun;
    operation: GhlProviderOperation;
    idempotencyKey: string;
    requestPayload: GhlProviderOutboxRecord["requestPayload"];
    now: string;
  }): Promise<GhlProviderOutboxRecord>;
  getLatestReceipt(outboxId: string): Promise<GhlProviderReceipt | null>;
  prepareOutboxReplay(input: {
    organizationId: string;
    idempotencyKey: string;
    now: string;
  }): Promise<void>;
  claimOutbox(input: {
    outboxId: string;
    organizationId: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }): Promise<GhlProviderOutboxRecord | null>;
  settleOutbox(input: {
    record: GhlProviderOutboxRecord;
    lease: GhlProviderOutboxLease;
    receipt: Omit<GhlProviderReceipt, "outboxId" | "attemptNumber">;
    status: GhlOutboxStatus;
    availableAt: string;
    lastErrorCode: string | null;
  }): Promise<GhlProviderOutboxRecord>;
  assignLocation(input: {
    run: GhlProvisioningRun;
    providerLocationId: string;
    now: string;
  }): Promise<GhlLocationAssignment>;
  markLocationVerified(input: {
    mappingId: string;
    snapshotVerifiedAt?: string;
    requiredObjectsVerifiedAt?: string;
  }): Promise<GhlLocationAssignment>;
  openOperatorRequest(request: GhlOperatorRequest): Promise<void>;
}
