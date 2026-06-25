"use client";

import { useMemo, useState, useTransition } from "react";
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
  campaignId?: string | null;
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
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [liveConnection, setLiveConnection] = useState(connection);
  const [selectedAccountId, setSelectedAccountId] = useState(connection.accountId ?? "");
  const [selectedPageId, setSelectedPageId] = useState(connection.pageId ?? "");
  const [selectedPixelId, setSelectedPixelId] = useState(connection.tracking.pixelId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const isConnected = liveConnection.connectionStatus === "connected";
  const availableAccounts = liveConnection.availableAccounts;
  const availablePages = liveConnection.availablePages;
  const availablePixels = liveConnection.availablePixels;
  const allSelectionsReady = Boolean(selectedAccountId && selectedPageId && selectedPixelId);
  const busy = isSaving || isPending;
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
    setConfirmation(null);

    if (!nextAccountId) {
      return;
    }

    setIsSaving(true);
    void saveMetaSelections({ externalAccountId: nextAccountId, campaignId })
      .then((nextConnection) => {
        setLiveConnection(nextConnection);
        setSelectedAccountId(nextConnection.accountId ?? nextAccountId);
        setSelectedPageId(nextConnection.pageId ?? selectedPageId);
        setSelectedPixelId(nextConnection.tracking.pixelId ?? "");
        setConfirmation("Ad account saved. Choose the Facebook Page and pixel, then save the launch selections.");
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
    if (!allSelectionsReady) {
      setError(`Select a ${missingSelections.join(", ")} before launch.`);
      setConfirmation(null);
      return;
    }

    setError(null);
    setConfirmation(null);
    setIsSaving(true);

    void saveMetaSelections({
      externalAccountId: selectedAccountId,
      campaignId,
      pageId: selectedPageId,
      pixelId: selectedPixelId,
    })
      .then((nextConnection) => {
        setLiveConnection(nextConnection);
        setSelectedAccountId(nextConnection.accountId ?? selectedAccountId);
        setSelectedPageId(nextConnection.pageId ?? selectedPageId);
        setSelectedPixelId(nextConnection.tracking.pixelId ?? selectedPixelId);
        setConfirmation("Meta selections saved. Launch gates are being checked now.");
        startTransition(() => {
          router.refresh();
        });
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

  if (!isConnected) {
    return (
      <Card className="p-5 sm:p-7">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Meta required
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
    <Card className="p-5 sm:p-7">
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Required selection
          </p>
          <p className="mt-2 text-lg font-semibold">Choose the Meta assets for this launch</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            The campaign cannot move into launch until a specific ad account, Facebook Page, and
            pixel are selected and saved for this workspace.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">Ad account</span>
            <select
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
              value={selectedAccountId}
              onChange={(event) => handleAccountRefresh(event.target.value)}
              disabled={busy}
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
          <label className="space-y-2">
            <span className="text-sm font-medium">Facebook Page</span>
            <select
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
              value={selectedPageId}
              onChange={(event) => {
                setSelectedPageId(event.target.value);
                setError(null);
                setConfirmation(null);
              }}
              disabled={busy}
            >
              <option value="">Select Facebook Page</option>
              {availablePages.map((page) => (
                <option key={page.id ?? page.name} value={page.id ?? ""}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Pixel</span>
            <select
              className="flex h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground outline-none"
              value={selectedPixelId}
              onChange={(event) => {
                setSelectedPixelId(event.target.value);
                setError(null);
                setConfirmation(null);
              }}
              disabled={busy || !selectedAccountId}
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
          <div className="rounded-[18px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {confirmation ? (
          <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100">
            {confirmation}
          </div>
        ) : null}
        {!allSelectionsReady ? (
          <div className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Missing required selections: {missingSelections.join(", ")}.
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={handleSaveSelections} disabled={busy || !allSelectionsReady}>
            {isSaving ? "Saving..." : isPending ? "Checking gates..." : confirmation ? "Selections saved" : "Save Meta selections"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.assign(
                `/api/integrations/meta/connect?returnTo=${encodeURIComponent(launchReturnTo)}`,
              );
            }}
            disabled={busy}
          >
            Reconnect Meta
          </Button>
        </div>
      </div>
    </Card>
  );
}
