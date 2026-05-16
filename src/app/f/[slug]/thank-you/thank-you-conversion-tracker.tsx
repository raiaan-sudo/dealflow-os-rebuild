"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

export function ThankYouConversionTracker({
  campaignId,
  metaPixelId,
  shouldTrack,
}: {
  campaignId: string;
  metaPixelId?: string | null;
  shouldTrack: boolean;
}) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!metaPixelId || !shouldTrack || trackedRef.current) {
      return;
    }

    const storageKey = `dealflowos:thank-you-conversion:${campaignId}`;
    if (window.sessionStorage.getItem(storageKey) === "tracked") {
      trackedRef.current = true;
      return;
    }

    const intervalId = window.setInterval(() => {
      if (typeof window.fbq !== "function" || trackedRef.current) {
        return;
      }

      window.fbq("init", metaPixelId);
      window.fbq("track", "CompleteRegistration", { campaign_id: campaignId });
      window.sessionStorage.setItem(storageKey, "tracked");
      trackedRef.current = true;
      window.clearInterval(intervalId);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [campaignId, metaPixelId, shouldTrack]);

  if (!metaPixelId) {
    return null;
  }

  return (
    <Script id="meta-pixel-thank-you-base" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');`}
    </Script>
  );
}
