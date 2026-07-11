export type MetaCallbackDiscoveryStatus = "success" | "failed" | "skipped";

export function preserveMetaSelection(params: {
  discoveryStatus: MetaCallbackDiscoveryStatus;
  previousId: string | null;
  discoveredIds: string[];
}) {
  if (params.discoveryStatus !== "success") {
    return params.previousId;
  }

  return params.previousId && params.discoveredIds.includes(params.previousId)
    ? params.previousId
    : null;
}

export function preserveMetaAssetList<T>(params: {
  discoveryStatus: MetaCallbackDiscoveryStatus;
  discovered: T[];
  previous: unknown;
}) {
  if (params.discoveryStatus === "success") {
    return params.discovered;
  }

  return Array.isArray(params.previous) ? params.previous : [];
}

export function deriveMetaCallbackConnectionTruth(params: {
  accountsStatus: MetaCallbackDiscoveryStatus;
  pagesStatus: MetaCallbackDiscoveryStatus;
  pixelsStatus: MetaCallbackDiscoveryStatus;
  selectedAccountId: string | null;
  selectedPageId: string | null;
  selectedPixelId: string | null;
}) {
  const discoveryComplete =
    params.accountsStatus === "success" &&
    params.pagesStatus === "success" &&
    (params.pixelsStatus === "success" || params.pixelsStatus === "skipped");
  const connectionReady = Boolean(
    discoveryComplete &&
      params.selectedAccountId &&
      params.selectedPageId &&
      params.selectedPixelId,
  );

  return {
    discoveryComplete,
    connectionReady,
    status: connectionReady ? ("connected" as const) : ("partial" as const),
  };
}
