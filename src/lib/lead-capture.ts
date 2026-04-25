export type LeadCaptureStage = "onboarding" | "generated" | "launched";
export const GLOBAL_LEAD_CAPTURE_SCOPE = "global";

type PendingLeadCapture = {
  stage: LeadCaptureStage;
  queuedAt: string;
};

export const LEAD_CAPTURE_EVENT = "dealflowos:lead-capture";

function getPendingKey(organizationId: string) {
  return `dealflowos:lead-capture:pending:${organizationId}`;
}

function getHandledKey(organizationId: string, stage: LeadCaptureStage) {
  return `dealflowos:lead-capture:handled:${organizationId}:${stage}`;
}

export function hasHandledLeadCapture(organizationId: string, stage: LeadCaptureStage) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(getHandledKey(organizationId, stage)) === "true";
}

export function markLeadCaptureHandled(organizationId: string, stage: LeadCaptureStage) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getHandledKey(organizationId, stage), "true");
}

export function queueLeadCapture(organizationId: string, stage: LeadCaptureStage) {
  if (typeof window === "undefined" || hasHandledLeadCapture(organizationId, stage)) {
    return;
  }

  const payload: PendingLeadCapture = {
    stage,
    queuedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(getPendingKey(organizationId), JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(LEAD_CAPTURE_EVENT, { detail: payload }));
}

export function consumePendingLeadCapture(organizationId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getPendingKey(organizationId));

  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(getPendingKey(organizationId));

  try {
    const parsed = JSON.parse(raw) as PendingLeadCapture;

    if (!parsed?.stage || hasHandledLeadCapture(organizationId, parsed.stage)) {
      return null;
    }

    return parsed.stage;
  } catch {
    return null;
  }
}
