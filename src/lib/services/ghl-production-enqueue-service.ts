import { assertGhlProductionAllowed, type GhlProductionGateInput } from "../integrations/gohighlevel";
import {
  resolveGhlProductionAuthority,
  type GhlSandboxAuthorityClient,
} from "./ghl-sandbox-authority-service";

type Client = GhlSandboxAuthorityClient & {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function enqueueGhlProductionLeadDelivery(input: {
  client: Client;
  gate: GhlProductionGateInput;
  organizationId: string;
  leadId: string;
  now?: string;
}) {
  assertGhlProductionAllowed(input.gate);
  if (input.gate.operation !== "lead_delivery") throw new Error("GHL production gate is not scoped to lead delivery.");
  const authority = await resolveGhlProductionAuthority(input);
  if (!authority) return { queued: false, reason: "ghl_production_mapping_not_ready" as const, effectIds: [], providerMutationAttempted: false };
  const { data, error } = await input.client.rpc("enqueue_ghl_production_lead_effects", {
    p_organization_id: input.organizationId,
    p_lead_id: input.leadId,
    p_now: input.now ?? new Date().toISOString(),
  });
  if (error) throw new Error(`GHL production lead enqueue failed: ${error.message}`);
  const rows = Array.isArray(data) ? data : [];
  const effectIds = rows.flatMap((row) => {
    const id = row && typeof row === "object" ? (row as Record<string, unknown>).id : null;
    return typeof id === "string" ? [id] : [];
  });
  return {
    queued: effectIds.length > 0,
    reason: effectIds.length > 0 ? "queued" as const : "ghl_production_mapping_not_ready" as const,
    effectIds,
    authority: { mappingId: authority.mappingId, providerLocationId: authority.providerLocationId, snapshotManifestId: authority.snapshotManifestId },
    providerMutationAttempted: false,
  };
}
