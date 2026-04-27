"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type LaunchCampaignButtonProps = {
  campaignId: string;
};

export function LaunchCampaignButton({ campaignId }: LaunchCampaignButtonProps) {
  const router = useRouter();

  async function handleLaunch() {
    router.push(`/preview?campaignId=${encodeURIComponent(campaignId)}`);
  }

  return (
    <Button onClick={handleLaunch} type="button">
      Continue to preview
    </Button>
  );
}
