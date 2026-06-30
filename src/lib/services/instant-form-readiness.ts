export type InstantFormSetupReadinessInput = {
  leadCaptureStatus?: string | null;
  leadCaptureReadyAt?: string | null;
  leadDeliveryDestination?: string | null;
  leadFormTemplateId?: string | null;
  metaLeadFormId?: string | null;
  privacyPolicyUrl?: string | null;
  smsConsentEnabled?: boolean | null;
  termsUrl?: string | null;
  leadLoopVerified?: boolean | null;
  leadCaptureLastError?: string | null;
  metaSelectionReady?: boolean | null;
};

export type InstantFormSetupReadiness = {
  ready: boolean;
  statusLabel: "Ready" | "Review required" | "Needs Meta" | "Error";
  detail: string;
  blockingReason: string | null;
};

const READY_STATUSES = new Set([
  "ready",
  "verified",
  "operator_verified",
  "launch_ready",
  "active",
]);

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStatus(value: string | null | undefined) {
  return normalizeText(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
}

export function getInstantFormSetupReadiness(
  input: InstantFormSetupReadinessInput,
): InstantFormSetupReadiness {
  if (!input.metaSelectionReady) {
    return {
      ready: false,
      statusLabel: "Needs Meta",
      detail: "Save the Meta ad account, Facebook Page, and pixel before verifying the native lead form.",
      blockingReason: "Save the Meta ad account, Page, and pixel before launch.",
    };
  }

  const lastError = normalizeText(input.leadCaptureLastError);

  if (lastError) {
    return {
      ready: false,
      statusLabel: "Error",
      detail: lastError,
      blockingReason: "Resolve the saved native lead-form verification error before launch.",
    };
  }

  const status = normalizeStatus(input.leadCaptureStatus);
  const hasExplicitReadySignal =
    (status ? READY_STATUSES.has(status) : false) ||
    Boolean(normalizeText(input.leadCaptureReadyAt)) ||
    Boolean(normalizeText(input.metaLeadFormId)) ||
    Boolean(normalizeText(input.leadFormTemplateId)) ||
    input.leadLoopVerified === true;

  if (!hasExplicitReadySignal) {
    return {
      ready: false,
      statusLabel: "Review required",
      detail:
        "Native Meta Instant Form setup is not operator-verified yet. Review fields, privacy/terms links, and delivery path before launch.",
      blockingReason: "Verify the Meta Instant Form fields, privacy policy, and lead delivery path before launch.",
    };
  }

  const privacyReady = Boolean(normalizeText(input.privacyPolicyUrl));
  const termsReady = Boolean(normalizeText(input.termsUrl));
  const deliveryDestination = normalizeText(input.leadDeliveryDestination);
  const detailParts = [
    "Native Meta Instant Form setup is operator-verified.",
    privacyReady ? "Privacy policy saved." : "Default platform privacy policy will be used.",
    termsReady ? "Terms URL saved." : "Default platform terms will be used.",
    deliveryDestination ? `Delivery: ${deliveryDestination}.` : "Lead delivery path verified.",
  ];

  return {
    ready: true,
    statusLabel: "Ready",
    detail: detailParts.join(" "),
    blockingReason: null,
  };
}
