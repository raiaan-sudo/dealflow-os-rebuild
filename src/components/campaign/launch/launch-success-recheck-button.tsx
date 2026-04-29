import { MetaSyncRefreshButton } from "@/components/dashboard/meta-sync-refresh-button";

export function LaunchSuccessRecheckButton({
  campaignId,
}: {
  campaignId?: string | null;
}) {
  return <MetaSyncRefreshButton label="Recheck Meta Status" campaignId={campaignId ?? null} />;
}
