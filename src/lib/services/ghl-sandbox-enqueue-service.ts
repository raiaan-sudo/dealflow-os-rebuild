import { assertGhlSandboxAllowed, type GhlSandboxGateInput } from "../integrations/gohighlevel";
import {
  resolveGhlSandboxAuthority,
  type GhlSandboxAuthorityClient,
} from "./ghl-sandbox-authority-service";

type GhlSandboxEnqueueClient = GhlSandboxAuthorityClient & {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function enqueueGhlSandboxLeadDelivery(input: {
  client: GhlSandboxEnqueueClient;
  gate: GhlSandboxGateInput;
  organizationId: string;
  leadId: string;
  now?: string;
}) {
  assertGhlSandboxAllowed(input.gate);
  const authority = await resolveGhlSandboxAuthority({
    client: input.client,
    organizationId: input.organizationId,
    gate: input.gate,
  });
  if (!authority) {
    return {
      queued: false,
      reason: "ghl_sandbox_mapping_not_ready" as const,
      effectIds: [] as string[],
      providerMutationAttempted: false,
    };
  }
  const { data, error } = await input.client.rpc("enqueue_ghl_sandbox_lead_effects", {
    p_organization_id: input.organizationId,
    p_lead_id: input.leadId,
    p_now: input.now ?? new Date().toISOString(),
  });
  if (error) throw new Error(`GHL sandbox lead enqueue failed: ${error.message}`);
  const rows = Array.isArray(data) ? data : [];
  const effectIds = rows.flatMap((row) => {
    const value = row && typeof row === "object" ? (row as Record<string, unknown>).id : null;
    return typeof value === "string" ? [value] : [];
  });
  return {
    queued: effectIds.length > 0,
    reason: effectIds.length > 0 ? "queued" as const : "ghl_sandbox_mapping_not_ready" as const,
    effectIds,
    authority: {
      mappingId: authority.mappingId,
      providerLocationId: authority.providerLocationId,
      snapshotManifestId: authority.snapshotManifestId,
    },
    providerMutationAttempted: false,
  };
}
