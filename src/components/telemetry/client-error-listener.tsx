"use client";

import { useEffect } from "react";

type ClientErrorPayload = {
  source: string;
  routePath?: string;
  errorName?: string;
  message: string;
  stack?: string;
  componentStack?: string;
  severity?: "critical" | "high" | "medium" | "low";
  browser?: string;
  viewport?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const MAX_EVENTS_PER_SESSION = 12;
const SESSION_KEY = "dealflow_client_error_keys";

function getBrowserLabel() {
  const userAgent = navigator.userAgent;

  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  return "Other";
}

function getRoutePath() {
  return `${window.location.pathname}`;
}

function getViewport() {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function safeSessionKeys() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberSessionKey(key: string) {
  try {
    const keys = safeSessionKeys();
    if (keys.includes(key) || keys.length >= MAX_EVENTS_PER_SESSION) {
      return false;
    }

    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...keys, key].slice(-MAX_EVENTS_PER_SESSION)));
    return true;
  } catch {
    return true;
  }
}

function eventKey(payload: ClientErrorPayload) {
  return [payload.source, payload.routePath, payload.errorName, payload.message, payload.stack?.slice(0, 180)].join("|");
}

export function reportClientError(payload: ClientErrorPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const routePath = payload.routePath ?? getRoutePath();
  const nextPayload: ClientErrorPayload = {
    ...payload,
    routePath,
    browser: payload.browser ?? getBrowserLabel(),
    viewport: payload.viewport ?? getViewport(),
  };

  if (!rememberSessionKey(eventKey(nextPayload))) {
    return;
  }

  void fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(nextPayload),
  }).catch(() => undefined);
}

function payloadFromUnknown(source: string, value: unknown): ClientErrorPayload {
  if (value instanceof Error) {
    return {
      source,
      errorName: value.name,
      message: value.message || "Unhandled browser error",
      stack: value.stack,
      severity: "medium",
    };
  }

  return {
    source,
    errorName: "UnhandledRejection",
    message: typeof value === "string" ? value : "Unhandled browser rejection",
    severity: "medium",
  };
}

export function ClientErrorListener() {
  useEffect(() => {
    function onWindowError(event: ErrorEvent) {
      reportClientError({
        source: "window_error",
        errorName: event.error instanceof Error ? event.error.name : "WindowError",
        message: event.message || "Unhandled browser error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        severity: "medium",
        metadata: {
          line: event.lineno || null,
          column: event.colno || null,
        },
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError(payloadFromUnknown("unhandled_rejection", event.reason));
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
