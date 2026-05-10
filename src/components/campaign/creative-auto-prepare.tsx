"use client";

import { useEffect, useRef } from "react";

type CreativeAutoPrepareProps = {
  campaignId: string | null | undefined;
  enabled: boolean;
  storageScope?: string;
};

export function CreativeAutoPrepare({
  campaignId,
  enabled,
  storageScope = "creative-handoff",
}: CreativeAutoPrepareProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !campaignId || startedRef.current) {
      return;
    }

    const storageKey = `dealflow:auto-image-render:${storageScope}:${campaignId}`;

    try {
      if (window.sessionStorage.getItem(storageKey) === "started") {
        return;
      }

      window.sessionStorage.setItem(storageKey, "started");
    } catch {
      // Session storage is only a loop guard. If unavailable, still queue once for this mount.
    }

    startedRef.current = true;

    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-static-ads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: false }),
    }).catch(() => undefined);
  }, [campaignId, enabled, storageScope]);

  return null;
}
