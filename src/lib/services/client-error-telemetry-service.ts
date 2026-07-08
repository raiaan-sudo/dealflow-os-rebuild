import "server-only";

import { createHash } from "node:crypto";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClientErrorSeverity = "critical" | "high" | "medium" | "low";

export type ClientErrorIssue = {
  id: string;
  severity: ClientErrorSeverity;
  title: string;
  detail: string;
  status: "open" | "monitoring" | "resolved";
  createdAt: string | null;
  route: string | null;
  rawReference: string;
};

type SafeClientErrorMetadata = Record<
  string,
  string | number | boolean | null | Array<string | number | boolean | null>
>;

type RawClientErrorRow = {
  id: string;
  event_key: string;
  route_path: string | null;
  source: string | null;
  severity: ClientErrorSeverity | null;
  error_name: string | null;
  message: string | null;
  stack: string | null;
  component_stack: string | null;
  browser: string | null;
  viewport: string | null;
  metadata: unknown;
  occurrence_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  reviewed_at?: string | null;
};

const FORBIDDEN_TEXT_PATTERN =
  /(?:Bearer\s+[A-Za-z0-9._~+/=-]+|sk_(?:live|test)_[A-Za-z0-9]+|pk_(?:live|test)_[A-Za-z0-9]+|eyJ[A-Za-z0-9._-]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s().-]{7,}\d)/gi;
const FORBIDDEN_METADATA_KEY =
  /(?:email|phone|first.?name|last.?name|full.?name|name|address|token|secret|cookie|jwt|authorization|password|credential|api.?key|access.?token|refresh.?token|private.?key|card|payment|pii)/i;
const MAX_TEXT_LENGTH = 900;
const MAX_STACK_LENGTH = 2400;
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_STRING_LENGTH = 160;
const MAX_METADATA_ARRAY_LENGTH = 8;

function scrubText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const strippedQuery = value.replace(/\?[^)\s"']+/g, "?[redacted]");
  const scrubbed = strippedQuery.replace(FORBIDDEN_TEXT_PATTERN, "[redacted]").trim();
  return scrubbed.length > 0 ? scrubbed.slice(0, maxLength) : null;
}

function normalizeRoutePath(value: unknown) {
  const candidate = typeof value === "string" ? value : "/";

  try {
    const url = candidate.startsWith("http")
      ? new URL(candidate)
      : new URL(candidate, "https://www.agentdealflow.io");
    return url.pathname.slice(0, 240) || "/";
  } catch {
    return "/";
  }
}

function sanitizeMetadataValue(value: unknown): SafeClientErrorMetadata[string] | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    return scrubText(value, MAX_METADATA_STRING_LENGTH) ?? undefined;
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item))
      .filter((item): item is string | number | boolean | null => item !== undefined && !Array.isArray(item));
    return sanitized.length > 0 ? sanitized : undefined;
  }

  return undefined;
}

function sanitizeMetadata(input: unknown): SafeClientErrorMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const metadata: SafeClientErrorMetadata = {};

  for (const [rawKey, rawValue] of Object.entries(input).slice(0, MAX_METADATA_KEYS)) {
    const key = rawKey.trim().replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 64);

    if (!key || FORBIDDEN_METADATA_KEY.test(key)) {
      continue;
    }

    const value = sanitizeMetadataValue(rawValue);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function normalizeSource(value: unknown) {
  const source = scrubText(value, 80)?.replace(/[^a-zA-Z0-9_:-]/g, "_") ?? "browser";
  return source.length > 0 ? source : "browser";
}

function normalizeSeverity(value: unknown): ClientErrorSeverity {
  return value === "critical" || value === "high" || value === "low" ? value : "medium";
}

function buildEventKey(params: {
  source: string;
  routePath: string;
  errorName: string | null;
  message: string;
  stack: string | null;
}) {
  const stackHead = params.stack?.split("\n").slice(0, 3).join("\n") ?? "";
  return createHash("sha256")
    .update([params.source, params.routePath, params.errorName ?? "Error", params.message, stackHead].join("|"))
    .digest("hex");
}

function isMissingClientErrorTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /relation .*client_error_events.* does not exist/i.test(error.message ?? "");
}

export async function recordClientErrorEvent(input: {
  source?: unknown;
  routePath?: unknown;
  errorName?: unknown;
  message?: unknown;
  stack?: unknown;
  componentStack?: unknown;
  severity?: unknown;
  browser?: unknown;
  viewport?: unknown;
  metadata?: unknown;
}) {
  const admin = createAdminClient();

  if (!admin) {
    logWarn("client_error_event_skipped_service_role_missing", {
      source: scrubText(input.source, 80) ?? "browser",
      routePath: normalizeRoutePath(input.routePath),
    });
    return { recorded: false, skipped: "service_role_missing" as const };
  }

  const source = normalizeSource(input.source);
  const routePath = normalizeRoutePath(input.routePath);
  const errorName = scrubText(input.errorName, 120);
  const message = scrubText(input.message, MAX_TEXT_LENGTH) ?? "Browser error reported without a message.";
  const stack = scrubText(input.stack, MAX_STACK_LENGTH);
  const componentStack = scrubText(input.componentStack, MAX_STACK_LENGTH);
  const severity = normalizeSeverity(input.severity);
  const browser = scrubText(input.browser, 120);
  const viewport = scrubText(input.viewport, 80);
  const metadata = sanitizeMetadata(input.metadata);
  const eventKey = buildEventKey({ source, routePath, errorName, message, stack });
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await (admin as any)
    .from("client_error_events")
    .select("id,occurrence_count")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingError) {
    if (isMissingClientErrorTable(existingError)) {
      return { recorded: false, skipped: "client_error_table_missing" as const };
    }

    logWarn("client_error_event_lookup_failed", {
      routePath,
      source,
      message: existingError.message,
    });
    return { recorded: false, skipped: "lookup_failed" as const };
  }

  if (existing?.id) {
    const occurrenceCount =
      typeof existing.occurrence_count === "number" && Number.isFinite(existing.occurrence_count)
        ? existing.occurrence_count + 1
        : 2;
    const { error } = await (admin as any)
      .from("client_error_events")
      .update({
        occurrence_count: occurrenceCount,
        last_seen_at: now,
        updated_at: now,
        severity,
        route_path: routePath,
        source,
        error_name: errorName,
        message,
        stack,
        component_stack: componentStack,
        browser,
        viewport,
        metadata,
      })
      .eq("id", existing.id);

    if (error) {
      logWarn("client_error_event_update_failed", {
        routePath,
        source,
        message: error.message,
      });
      return { recorded: false, skipped: "update_failed" as const };
    }

    return { recorded: true, skipped: null };
  }

  const { error } = await (admin as any)
    .from("client_error_events")
    .insert({
      event_key: eventKey,
      route_path: routePath,
      source,
      severity,
      error_name: errorName,
      message,
      stack,
      component_stack: componentStack,
      browser,
      viewport,
      metadata,
      first_seen_at: now,
      last_seen_at: now,
    });

  if (error) {
    if (isMissingClientErrorTable(error)) {
      return { recorded: false, skipped: "client_error_table_missing" as const };
    }

    logWarn("client_error_event_insert_failed", {
      routePath,
      source,
      message: error.message,
    });
    return { recorded: false, skipped: "insert_failed" as const };
  }

  return { recorded: true, skipped: null };
}

export async function loadClientErrorIssues(limit = 40): Promise<ClientErrorIssue[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (admin as any)
    .from("client_error_events")
    .select("id,event_key,route_path,source,severity,error_name,message,stack,component_stack,browser,viewport,metadata,occurrence_count,first_seen_at,last_seen_at,reviewed_at")
    .is("reviewed_at", null)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingClientErrorTable(error)) {
      return [];
    }

    logWarn("client_error_issue_lookup_failed", { message: error.message });
    return [];
  }

  return ((data ?? []) as RawClientErrorRow[]).map((row) => {
    const occurrenceCount = Math.max(Number(row.occurrence_count ?? 1), 1);
    const severity =
      row.severity === "critical" || row.severity === "high" || row.severity === "low"
        ? row.severity
        : occurrenceCount >= 5
          ? "high"
          : "medium";
    const routePath = row.route_path || "/";
    const label = row.error_name || "Browser error";

    return {
      id: `client-error:${row.id}`,
      severity,
      title: `${label} on ${routePath}`,
      detail: `${row.message || "Client error captured."} Seen ${occurrenceCount} time${occurrenceCount === 1 ? "" : "s"} from ${row.source || "browser"}${row.browser ? ` on ${row.browser}` : ""}.`,
      status: "open",
      createdAt: row.last_seen_at || row.first_seen_at,
      route: routePath,
      rawReference: row.event_key || row.id,
    };
  });
}
