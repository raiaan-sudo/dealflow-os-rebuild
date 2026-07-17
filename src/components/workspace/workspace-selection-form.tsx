"use client";

import { useState } from "react";
import type { WorkspaceOption } from "@/lib/services/workspace-selection-service";

type WorkspaceSelectionFormProps = {
  options: WorkspaceOption[];
  currentOrganizationId?: string | null;
  returnTo: string;
  compact?: boolean;
};

export function WorkspaceSelectionForm({
  options,
  currentOrganizationId,
  returnTo,
  compact = false,
}: WorkspaceSelectionFormProps) {
  const initialId =
    options.find((option) => option.id === currentOrganizationId)?.id ??
    options[0]?.id ??
    "";
  const [organizationId, setOrganizationId] = useState(initialId);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || status === "pending") return;
    setStatus("pending");
    setMessage("");

    try {
      const response = await fetch("/api/workspaces/active", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Workspace selection failed.",
        );
      }
      window.location.assign(returnTo);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Workspace selection failed.");
    }
  }

  const selectId = compact ? "topbar-workspace" : "active-workspace";
  return (
    <form
      className={compact ? "flex min-w-0 items-center gap-2" : "space-y-4"}
      onSubmit={submit}
    >
      <div className={compact ? "min-w-0" : "space-y-2"}>
        <label
          className={compact ? "sr-only" : "text-sm font-medium text-foreground"}
          htmlFor={selectId}
        >
          Workspace
        </label>
        <select
          id={selectId}
          aria-describedby={status === "error" ? "workspace-selection-status" : undefined}
          className={
            compact
              ? "h-10 max-w-[190px] cursor-pointer rounded-[14px] border border-white/10 bg-white/[0.05] px-3 text-sm text-foreground outline-none transition focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30"
              : "h-12 w-full cursor-pointer rounded-[16px] border border-white/10 bg-white/[0.05] px-4 text-sm text-foreground outline-none transition focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30"
          }
          value={organizationId}
          onChange={(event) => setOrganizationId(event.target.value)}
          disabled={status === "pending" || options.length === 0}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} ({option.role})
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={!organizationId || status === "pending"}
        className={
          compact
            ? "h-10 shrink-0 cursor-pointer rounded-[14px] bg-primary px-3 text-xs font-semibold text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            : "h-12 w-full cursor-pointer rounded-[16px] bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {status === "pending" ? "Switching…" : compact ? "Switch" : "Continue"}
      </button>
      <p
        id="workspace-selection-status"
        aria-live="polite"
        className={status === "error" && !compact ? "text-sm text-red-300" : "sr-only"}
      >
        {message}
      </p>
    </form>
  );
}
