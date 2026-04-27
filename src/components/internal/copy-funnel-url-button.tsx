"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyFunnelUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy funnel URL"}
    </Button>
  );
}
