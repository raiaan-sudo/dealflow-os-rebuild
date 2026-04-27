"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type PreviewActionsProps = {
  connectHref?: string;
  campaignId?: string | null;
};

export function PreviewActions({ connectHref = "/launch", campaignId = null }: PreviewActionsProps) {
  const router = useRouter();

  async function completePreview() {
    const nextUrl = new URL(connectHref, window.location.origin);

    if (campaignId) {
      nextUrl.searchParams.set("campaignId", campaignId);
    }

    router.push(nextUrl.pathname + nextUrl.search);
  }

  return (
    <div className="flex w-full flex-col items-center space-y-4 text-center">
      <div className="flex w-full max-w-[320px] justify-center">
        <Button
          className="h-13 w-full rounded-full bg-[#2f80ff] px-6 text-base font-semibold text-white shadow-[0_26px_70px_-28px_rgba(47,128,255,0.95)] hover:bg-[#3d8bff] sm:h-14"
          onClick={completePreview}
        >
          Continue to launch
        </Button>
      </div>
      <p className="max-w-[560px] text-sm text-muted-foreground">
        This moves the campaign from review into the launch setup screen.
      </p>
    </div>
  );
}
