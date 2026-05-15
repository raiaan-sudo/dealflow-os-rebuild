import "server-only";

import { logWarn } from "@/lib/logging";
import type { FreshdeskTicketPayload } from "@/lib/support/support-ticket";

export type FreshdeskTicketResult =
  | {
      success: true;
      ticketId: string | number | null;
      status: number;
    }
  | {
      success: false;
      code:
        | "freshdesk_unconfigured"
        | "freshdesk_bad_config"
        | "freshdesk_timeout"
        | "freshdesk_unauthorized"
        | "freshdesk_rate_limited"
        | "freshdesk_unavailable"
        | "freshdesk_bad_response";
      status: number | null;
    };

const FRESHDESK_TIMEOUT_MS = 8000;

function normalizeFreshdeskDomain(domain: string) {
  const trimmed = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");

  if (!trimmed || trimmed.includes("/") || trimmed.includes("@")) {
    return null;
  }

  return trimmed;
}

function parseOptionalFreshdeskId(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getFreshdeskConfig() {
  const domain = normalizeFreshdeskDomain(process.env.FRESHDESK_DOMAIN ?? "");
  const apiKey = process.env.FRESHDESK_API_KEY?.trim() ?? "";

  if (!domain || !apiKey) {
    return { configured: false as const };
  }

  return {
    configured: true as const,
    endpoint: `https://${domain}/api/v2/tickets`,
    apiKey,
    productId: parseOptionalFreshdeskId(process.env.FRESHDESK_PRODUCT_ID),
    groupId: parseOptionalFreshdeskId(process.env.FRESHDESK_GROUP_ID),
  };
}

function classifyFreshdeskFailure(status: number): FreshdeskTicketResult {
  if (status === 401 || status === 403) {
    return { success: false, code: "freshdesk_unauthorized", status };
  }

  if (status === 429) {
    return { success: false, code: "freshdesk_rate_limited", status };
  }

  if (status >= 500) {
    return { success: false, code: "freshdesk_unavailable", status };
  }

  return { success: false, code: "freshdesk_bad_response", status };
}

export async function createFreshdeskTicket(
  payload: FreshdeskTicketPayload,
): Promise<FreshdeskTicketResult> {
  const config = getFreshdeskConfig();

  if (!config.configured) {
    return { success: false, code: "freshdesk_unconfigured", status: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FRESHDESK_TIMEOUT_MS);
  const body = {
    ...payload,
    ...(config.productId ? { product_id: config.productId } : {}),
    ...(config.groupId ? { group_id: config.groupId } : {}),
  };

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.apiKey}:X`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return classifyFreshdeskFailure(response.status);
    }

    const responseBody = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const ticketId =
      typeof responseBody?.id === "string" || typeof responseBody?.id === "number"
        ? responseBody.id
        : null;

    return { success: true, ticketId, status: response.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, code: "freshdesk_timeout", status: null };
    }

    logWarn("Freshdesk support ticket creation failed", {
      code: "freshdesk_unavailable",
      errorClass: error instanceof Error ? error.name : typeof error,
    });

    return { success: false, code: "freshdesk_unavailable", status: null };
  } finally {
    clearTimeout(timeout);
  }
}
