import "server-only";

import {
  createEnvironmentGhlCredentialResolver,
  createProductionEnvironmentGhlCredentialResolver,
  GhlCredentialResolutionError,
  type GhlCredentialResolver,
} from "@/lib/integrations/gohighlevel/credential-resolver";
import {
  decryptGhlMarketplaceCredential,
  type GhlEncryptedCredentialEnvelope,
} from "@/lib/integrations/gohighlevel/marketplace-runtime-contract";

const MARKETPLACE_TOKEN_SET_REF =
  /^ghl-marketplace-token-set:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function oneRow(value: unknown) {
  return Array.isArray(value) && value.length === 1 &&
    value[0] && typeof value[0] === "object"
    ? value[0] as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createGhlMarketplaceAwareCredentialResolver(input: {
  client: {
    from: (table: string) => any;
    rpc: (name: string, params: Record<string, unknown>) => Promise<{
      data: unknown;
      error: unknown;
    }>;
  };
  providerEnvironment: "sandbox" | "production";
  environment?: Readonly<Record<string, string | undefined>>;
}): GhlCredentialResolver {
  const environment = input.environment ?? process.env;
  const fallback = input.providerEnvironment === "production"
    ? createProductionEnvironmentGhlCredentialResolver(environment)
    : createEnvironmentGhlCredentialResolver(environment);

  return {
    async withCredential<T>(
      credentialRef: string,
      consumeCredential: (credential: string) => Promise<T>,
    ) {
      const match = MARKETPLACE_TOKEN_SET_REF.exec(credentialRef.trim());
      if (!match) {
        return fallback.withCredential(credentialRef, consumeCredential);
      }

      const tokenSetResult = await input.client
        .from("ghl_marketplace_token_sets")
        .select(
          "id,authority_id,subject_kind,status,encrypted_access_credential_ref,access_expires_at",
        )
        .eq("id", match[1])
        .eq("subject_kind", "location")
        .eq("status", "active")
        .limit(2);
      const tokenSet = oneRow(tokenSetResult.data);
      if (tokenSetResult.error || !tokenSet) {
        throw new GhlCredentialResolutionError(
          "ghl_marketplace_location_token_unavailable",
          "The exact active GHL Marketplace location token is unavailable.",
        );
      }
      const accessExpiresAt = Date.parse(text(tokenSet.access_expires_at));
      if (!Number.isFinite(accessExpiresAt) || accessExpiresAt <= Date.now()) {
        throw new GhlCredentialResolutionError(
          "ghl_marketplace_location_token_expired",
          "The GHL Marketplace location token requires refresh.",
        );
      }

      const authorityResult = await input.client
        .from("ghl_marketplace_authorities")
        .select("id,environment,status")
        .eq("id", tokenSet.authority_id)
        .eq("environment", input.providerEnvironment)
        .eq("status", "active")
        .limit(2);
      const authority = oneRow(authorityResult.data);
      if (authorityResult.error || !authority) {
        throw new GhlCredentialResolutionError(
          "ghl_marketplace_location_authority_unavailable",
          "The exact active GHL Marketplace authority is unavailable.",
        );
      }

      const { data: envelope, error } = await input.client.rpc(
        "resolve_ghl_marketplace_credential_v2",
        {
          p_credential_ref: text(tokenSet.encrypted_access_credential_ref),
          p_authority_id: text(authority.id),
        },
      );
      const encodedKey = environment.GHL_MARKETPLACE_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
      if (error || !envelope || Buffer.from(encodedKey, "base64url").length !== 32) {
        throw new GhlCredentialResolutionError(
          "ghl_marketplace_location_credential_unavailable",
          "The encrypted GHL Marketplace location credential is unavailable.",
        );
      }

      let credential = "";
      try {
        credential = decryptGhlMarketplaceCredential(
          envelope as GhlEncryptedCredentialEnvelope,
          encodedKey,
        );
      } catch {
        throw new GhlCredentialResolutionError(
          "ghl_marketplace_location_credential_invalid",
          "The encrypted GHL Marketplace location credential could not be verified.",
        );
      }
      return consumeCredential(credential);
    },
  };
}
