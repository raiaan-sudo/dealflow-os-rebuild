"use client";

import { useEffect, useRef, useState } from "react";

type ExchangeResult = {
  status?: "ready" | "authentication_required";
  nextPath?: string;
};

type SignedEmbedContext = {
  encryptedData: string;
  parentOrigin: string;
};

export function GhlEmbedBootstrap(props: { allowedParentOrigins: string[] }) {
  const [status, setStatus] = useState("Verifying your CRM workspace…");
  const [blocked, setBlocked] = useState(false);
  const [needsStorageAccess, setNeedsStorageAccess] = useState(false);
  const pendingContextRef = useRef<SignedEmbedContext | null>(null);

  async function exchangeContext(context: SignedEmbedContext) {
    const response = await fetch("/api/integrations/ghl/embed-context", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    const result = await response.json().catch(() => ({})) as ExchangeResult;
    if (!response.ok || !result.nextPath) throw new Error("embed_context_rejected");

    const cookieProbe = await fetch("/api/integrations/ghl/embed-context", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!cookieProbe.ok) {
      pendingContextRef.current = context;
      setStatus("Your browser needs permission to use DealFlow securely inside this CRM tab.");
      setNeedsStorageAccess(true);
      return;
    }

    pendingContextRef.current = null;
    window.location.assign(result.nextPath);
  }

  async function enableEmbeddedStorage() {
    const context = pendingContextRef.current;
    if (!context) return;
    setBlocked(false);
    setStatus("Enabling secure embedded access…");
    try {
      if (typeof document.requestStorageAccess !== "function") {
        throw new Error("storage_access_api_unavailable");
      }
      await document.requestStorageAccess();
      await exchangeContext(context);
    } catch {
      setNeedsStorageAccess(false);
      setStatus("Embedded browser storage is blocked. Continue in a new tab, then reopen DealFlow from your CRM menu.");
      setBlocked(true);
    }
  }

  useEffect(() => {
    if (window.self === window.top || props.allowedParentOrigins.length === 0) {
      setStatus("Open DealFlow from your CRM menu, or continue in a new tab.");
      setBlocked(true);
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        setStatus("The CRM session could not be verified. Continue in a new tab and contact support if this repeats.");
        setBlocked(true);
      }
    }, 10_000);

    const onMessage = async (event: MessageEvent) => {
      if (
        settled ||
        event.source !== window.parent ||
        !props.allowedParentOrigins.includes(event.origin) ||
        !event.data ||
        event.data.message !== "REQUEST_USER_DATA_RESPONSE" ||
        typeof event.data.payload !== "string"
      ) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      try {
        await exchangeContext({
          encryptedData: event.data.payload,
          parentOrigin: event.origin,
        });
      } catch {
        setStatus("The CRM workspace did not match your DealFlow account. Continue in a new tab or contact support.");
        setBlocked(true);
      }
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
    return () => {
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [props.allowedParentOrigins]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">DealFlow</p>
        <h1 className="mt-3 text-2xl font-semibold">Secure CRM connection</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600" role="status" aria-live="polite">
          {status}
        </p>
        {needsStorageAccess ? (
          <button
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            type="button"
            onClick={() => void enableEmbeddedStorage()}
          >
            Enable embedded access
          </button>
        ) : null}
        {blocked || needsStorageAccess ? (
          <a
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            href="/login"
            target="_blank"
            rel="noreferrer"
          >
            Continue in a new tab
          </a>
        ) : null}
      </section>
    </main>
  );
}
