"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MetaConnectionState } from "@/lib/integrations/meta/types";

type LaunchMetaSelectionPanelProps = {
  connection: MetaConnectionState;
  campaignId?: string | null;
};

async function saveMetaSelections(input: {
  externalAccountId: string;
  pageId?: string;
  pixelId?: string;
}) {
  const response = await fetch("/api/integrations/meta/selections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const result = (await response.json().catch(() => null)) as
    | {
        connection?: MetaConnectionState;
        error?: string;
        action?: string;
        title?: string;
        retryEligible?: boolean;
      }
    | null;

  if (!response.ok || !result?.connection) {
    throw new Error(
      [result?.error, result?.action].filter(Boolean).join(" ") ||
        "Meta selections could not be updated.",
    );
  }

  return result.connection;
}

export function LaunchMetaSelectionPanel({
  connection,
  campaignId,
}: LaunchMetaSelectionPanelProps) {
  const router = useRouter();
  const [liveConnection, setLiveConnection] = useState(connection);
  const [selectedAccountId, setSelectedAccountId] = useState(connection.accountId ?? "");
  const [selectedPageId, setSelectedPageId] = useState(connection.pageId ?? "");
  const [selectedPixelId, setSelectedPixelId] = useState(connection.tracking.pixelId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasAuthorizedMetaSession =
    liveConnection.hasAccessToken &&
    (liveConnection.connectionStatus === "connected" ||
      liveConnection.connectionStatus === "partial" ||
      liveConnection.connectionStatus === "connecting");
  const availableAccounts = liveConnection.availableAccounts;
  const availablePages = liveConnection.availablePages;
  const availablePixels = liveConnection.availablePixels;
  const allSelectionsReady = Boolean(selectedAccountId && selectedPageId && selectedPixelId);
  const launchReturnTo = campaignId
    ? `/launch?campaignId=${encodeURIComponent(campaignId)}`
    : "/launch";
  const missingSelections = useMemo(() => {
    const missing: string[] = [];

    if (!selectedAccountId) {
      missing.push("ad account");
    }
    if (!selectedPageId) {
      missing.push("Facebook Page");
    }
    if (!selectedPixelId) {
      missing.push("pixel");
    }

    return missing;
  }, [selectedAccountId, selectedPageId, selectedPixelId]);

  function handleAccountRefresh(nextAccountId: string) {
    setSelectedAccountId(nextAccountId);
    setSelectedPixelId("");
    setError(null);
    setSaveMessage(null);

    if (!nextAccountId) {
      return;
    }

    setIsSaving(true);
    void saveMetaSelections({ externalAccountId: nextAccountId })
      .then((nextConnection) => {
        setLiveConnection(nextConnection);
        setSelectedAccountId(nextConnection.accountId ?? nextAccountId);
        setSelectedPageId(nextConnection.pageId ?? selectedPageId);
        setSelectedPixelId(nextConnection.tracking.pixelId ?? "");
        router.refresh();
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Meta ad account selection could not be updated.",
        );
      })
      .finally(() => {
        setIsSaving(false);
      });
  }

  function handleSaveSelections() {
    if (isSaving) {
      return;
    }

    if (!allSelectionsReady) {
      setError(`Select a ${missingSelections.join(", ")} before launch.`);
      return;
    }

    setError(null);
    setSaveMessage(null);
    setIsSaving(true);

    void saveMetaSelections({
      externalAccountId: selectedAccountId,
      pageId: selectedPageId,
      pixelId: selectedPixelId,
    })
      .then((nextConnection) => {
        setLiveConnection(nextConnection);
        setSelectedAccountId(nextConnection.accountId ?? selectedAccountId);
        setSelectedPageId(nextConnection.pageId ?? selectedPageId);
        setSelectedPixelId(nextConnection.tracking.pixelId ?? selectedPixelId);
        setSaveMessage("Meta selections saved. You can continue to launch review.");
        router.refresh();
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Meta launch selections could not be saved.",
        );
      })
      .finally(() => {
        setIsSaving(false);
      });
  }

  if (!hasAuthorizedMetaSession) {
    return (
      <Card className="p-5 sm:p-7">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Meta Required
            </p>
            <p className="mt-2 text-lg font-semibold">Connect Meta before launch</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Launch stays blocked until a Meta workspace is connected. Connect Meta first, then choose the exact ad account, Facebook Page, and pixel for this campaign.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              window.location.assign(
                `/api/integrations/meta/connect?returnTo=${encodeURIComponent(launchReturnTo)}`,
              );
            }}
          >
            Connect Meta
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card aria-busy={isSaving} className="p-5 sm:p-7">
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Required Selection
          </p>
          <p className="mt-2 text-lg font-semibold">Choose the Meta assets for this launch</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            The campaign cannot move into launch until a specific ad account, Facebook Page, and
            pixel are selected and saved for this workspace.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2" htmlFor="meta-ad-account">
            <span className="text-sm font-medium">Ad account</span>
            <select
              id="meta-ad-account"
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              value={selectedAccountId}
              onChange={(event) => handleAccountRefresh(event.target.value)}
              disabled={isSaving}
            >
              <option value="">Select ad account</option>
              {availableAccounts.map((account) => (
                <option
                  key={account.externalAccountId ?? account.id ?? account.name}
                  value={account.externalAccountId ?? ""}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2" htmlFor="meta-facebook-page">
            <span className="text-sm font-medium">Facebook Page</span>
            <select
              id="meta-facebook-page"
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              value={selectedPageId}
              onChange={(event) => {
                setSelectedPageId(event.target.value);
                setError(null);
                setSaveMessage(null);
              }}
              disabled={isSaving}
            >
              <option value="">Select Facebook Page</option>
              {availablePages.map((page) => (
                <option key={page.id ?? page.name} value={page.id ?? ""}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2" htmlFor="meta-pixel">
            <span className="text-sm font-medium">Pixel</span>
            <select
              id="meta-pixel"
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              value={selectedPixelId}
              onChange={(event) => {
                setSelectedPixelId(event.target.value);
                setError(null);
                setSaveMessage(null);
              }}
              disabled={isSaving || !selectedAccountId}
            >
              <option value="">
                {selectedAccountId ? "Select pixel" : "Select ad account first"}
              </option>
              {availablePixels.map((pixel) => (
                <option key={pixel.id ?? pixel.name} value={pixel.id ?? ""}>
                  {pixel.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <div
            aria-live="assertive"
            className="rounded-[18px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        {saveMessage ? (
          <div
            aria-live="polite"
            className="rounded-[18px] border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100"
            role="status"
          >
            {saveMessage}
          </div>
        ) : null}
        {!allSelectionsReady ? (
          <div
            aria-live="polite"
            className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            Missing required selections: {missingSelections.join(", ")}.
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={handleSaveSelections} disabled={isSaving || !allSelectionsReady}>
            {isSaving ? "Saving..." : saveMessage ? "Meta selections saved" : "Save Meta selections"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.assign("/api/integrations/meta/connect?returnTo=%2Flaunch");
            }}
            disabled={isSaving}
          >
            Reconnect Meta
          </Button>
        </div>
      </div>
    </Card>
  );
}
