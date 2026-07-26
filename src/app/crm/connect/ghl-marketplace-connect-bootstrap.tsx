"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const CLAIM_STORAGE_KEY = "dealflow.ghl.marketplace.bootstrap.claim";

type BootstrapResponse = {
  status?: "authorization_required";
  authorizationUrl?: string;
  code?: string;
};

function safeCode(value: unknown) {
  return typeof value === "string" &&
    /^ghl_marketplace_[a-z0-9_]{1,100}$/.test(value)
    ? value
    : "ghl_marketplace_bootstrap_failed";
}

export function GhlMarketplaceConnectBootstrap() {
  const [status, setStatus] = useState("Preparing your secure CRM connection…");
  const [blocked, setBlocked] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("complete") === "1") {
      window.sessionStorage.removeItem(CLAIM_STORAGE_KEY);
      setStatus("CRM authorization is complete. DealFlow is verifying the snapshot and required objects.");
      return;
    }

    const claimFromFragment = new URLSearchParams(
      currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash,
    ).get("claim");
    if (claimFromFragment && claimFromFragment.length <= 4_096) {
      window.sessionStorage.setItem(CLAIM_STORAGE_KEY, claimFromFragment);
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`);
    }
    const claimToken = claimFromFragment ??
      window.sessionStorage.getItem(CLAIM_STORAGE_KEY);
    if (!claimToken) {
      setStatus("Open DealFlow from the exact CRM workspace and choose Connect DealFlow again.");
      setBlocked(true);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          "/api/integrations/ghl/marketplace/bootstrap",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimToken }),
          },
        );
        const result = await response.json().catch(() => ({})) as BootstrapResponse;
        if (response.status === 401) {
          const login = new URL("/login", window.location.origin);
          login.searchParams.set("redirectedFrom", "/crm/connect");
          window.location.assign(login.toString());
          return;
        }
        if (
          !response.ok ||
          result.status !== "authorization_required" ||
          !result.authorizationUrl
        ) {
          throw new Error(safeCode(result.code));
        }
        setStatus("Opening the official CRM authorization screen…");
        window.location.assign(result.authorizationUrl);
      } catch (error) {
        console.warn(
          `DealFlow GHL connection stopped: ${safeCode(
            error instanceof Error ? error.message : null,
          )}`,
        );
        setStatus("The CRM connection could not be completed. Reopen DealFlow from the CRM menu and try once more.");
        setBlocked(true);
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          DealFlow
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Connect your CRM</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600" role="status" aria-live="polite">
          {status}
        </p>
        {blocked ? (
          <Link
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            href="/support"
          >
            Contact support
          </Link>
        ) : null}
      </section>
    </main>
  );
}
