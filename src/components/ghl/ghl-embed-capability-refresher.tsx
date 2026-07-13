"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 2 * 60 * 1_000;

export function GhlEmbedCapabilityRefresher(props: { parentOrigin: string | null }) {
  useEffect(() => {
    const parentOrigin = props.parentOrigin;
    if (!parentOrigin || window.self === window.top) return;
    let active = true;
    let pending = false;

    const refresh = () => {
      if (!active || pending || document.visibilityState === "hidden") return;
      pending = true;
      const timeout = window.setTimeout(() => {
        pending = false;
      }, 10_000);
      const onMessage = async (event: MessageEvent) => {
        if (
          !active ||
          event.source !== window.parent ||
          event.origin !== parentOrigin ||
          !event.data ||
          event.data.message !== "REQUEST_USER_DATA_RESPONSE" ||
          typeof event.data.payload !== "string"
        ) {
          return;
        }
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timeout);
        try {
          const response = await fetch("/api/integrations/ghl/embed-context", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              encryptedData: event.data.payload,
              parentOrigin: event.origin,
            }),
          });
          if (!response.ok) window.location.assign("/ghl/embed");
        } catch {
          // The signed capability remains valid until its short expiry. A later
          // interval/visibility event retries; navigation then fails closed to
          // the inert bootstrap through the longer-lived session marker.
        } finally {
          pending = false;
        }
      };
      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        { message: "REQUEST_USER_DATA" },
        parentOrigin,
      );
    };

    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [props.parentOrigin]);

  return null;
}
