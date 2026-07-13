export const GHL_DESTINATION_POLL_INTERVAL_MS = 2_000;
export const GHL_DESTINATION_MAX_POLL_ATTEMPTS = 90;

export function shouldRetryPendingGhlDestination(input: {
  status: number;
  code: string | null | undefined;
  attempt: number;
}) {
  return input.status === 409
    && input.code === "ghl_destination_pending"
    && Number.isInteger(input.attempt)
    && input.attempt >= 0
    && input.attempt < GHL_DESTINATION_MAX_POLL_ATTEMPTS - 1;
}
