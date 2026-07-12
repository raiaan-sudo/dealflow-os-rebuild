import { createHash } from "node:crypto";

export interface GhlCredentialResolver {
  withCredential<T>(
    credentialRef: string,
    consumeCredential: (credential: string) => Promise<T>,
  ): Promise<T>;
}

export class GhlCredentialResolutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlCredentialResolutionError";
    this.code = code;
  }
}

export function fingerprintCredentialReference(credentialRef: string) {
  return createHash("sha256").update(credentialRef.trim()).digest("hex");
}

export function createEnvironmentGhlCredentialResolver(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GhlCredentialResolver {
  return {
    async withCredential<T>(credentialRef: string, consumeCredential: (credential: string) => Promise<T>) {
      const match = /^env:(GHL_SANDBOX_[A-Z0-9_]*_TOKEN)$/.exec(credentialRef.trim());
      if (!match) {
        throw new GhlCredentialResolutionError(
          "ghl_credential_reference_invalid",
          "The GHL credential reference is not an approved sandbox secret reference.",
        );
      }

      const credential = environment[match[1]]?.trim() ?? "";
      if (credential.length < 20) {
        throw new GhlCredentialResolutionError(
          "ghl_credential_unavailable",
          "The referenced GHL sandbox credential is unavailable.",
        );
      }

      return consumeCredential(credential);
    },
  };
}
