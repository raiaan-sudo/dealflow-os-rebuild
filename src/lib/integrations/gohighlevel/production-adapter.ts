import type { GhlCredentialResolver } from "./credential-resolver";
import { GhlHttpClient } from "./http-client";
import { GhlSandboxAdapter } from "./sandbox-adapter";
import type { GhlProductionGateInput } from "./production-gate";
import type { GhlSandboxGateInput } from "./sandbox-gate";

export type GhlProductionAdapterOptions = {
  credentialRef: string;
  credentialResolver: GhlCredentialResolver;
  gate: GhlProductionGateInput;
  httpClient?: GhlHttpClient;
  companyId: string;
};

/**
 * The production adapter deliberately shares the bounded HTTP and receipt
 * parser with the sandbox adapter. Its construction and every credential use
 * are independently fenced by exact production authority.
 */
export function createGhlProductionAdapter(options: GhlProductionAdapterOptions) {
  return new GhlSandboxAdapter({
    credentialRef: options.credentialRef,
    credentialResolver: options.credentialResolver,
    // Not consulted for production authority; retained only for the common
    // adapter's backwards-compatible option shape.
    gate: {} as GhlSandboxGateInput,
    authority: { kind: "production", gate: options.gate },
    ...(options.httpClient ? { httpClient: options.httpClient } : {}),
    companyId: options.companyId,
  });
}
