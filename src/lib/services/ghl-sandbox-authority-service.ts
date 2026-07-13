import {
  assertGhlProductionAllowed,
  assertGhlSandboxAllowed,
  type GhlProductionGateInput,
  type GhlRequiredObject,
  type GhlSandboxGateInput,
} from "../integrations/gohighlevel";

type JsonRecord = Record<string, unknown>;
type QueryResult = Promise<{ data: unknown; error: { message: string } | null }>;

export type GhlSandboxAuthorityClient = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

export type GhlSandboxAuthority = {
  environment: "sandbox" | "production";
  organizationId: string;
  partnerId: string | null;
  mappingId: string;
  providerLocationId: string;
  installationId: string;
  providerAgencyId: string;
  credentialRef: string;
  snapshotManifestId: string;
  snapshotProviderId: string;
  requiredObjects: GhlRequiredObject[];
};

export type GhlInboundFormsReadAuthority = {
  environment: "sandbox" | "production";
  organizationId: string;
  mappingId: string;
  providerLocationId: string;
  providerAgencyId: string;
  credentialRef: string;
  capabilities: string[];
  scopeAttestedAt: string;
};

export class GhlSandboxAuthorityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GhlSandboxAuthorityError";
    this.code = code;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseRequiredObjects(value: unknown): GhlRequiredObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    const kind = asString(row.kind);
    const key = asString(row.key).trim();
    if (!key || !["pipeline", "stage", "workflow", "tag", "calendar", "custom_field"].includes(kind)) {
      return [];
    }
    return [{
      kind: kind as GhlRequiredObject["kind"],
      key,
      ...(typeof row.minimumCount === "number" ? { minimumCount: row.minimumCount } : {}),
      ...(asString(row.providerObjectId) || asString(row.provider_object_id)
        ? { providerObjectId: asString(row.providerObjectId) || asString(row.provider_object_id) }
        : {}),
    }];
  });
}

function parseCapabilities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && /^[a-z][a-z0-9._:-]{1,79}$/.test(item)
  ))].sort();
}

async function one(query: any, code: string) {
  const { data, error } = await query.maybeSingle() as Awaited<QueryResult>;
  if (error) throw new GhlSandboxAuthorityError(code, error.message);
  return data ? asRecord(data) : null;
}

export async function resolveGhlSandboxAuthority(input: {
  client: GhlSandboxAuthorityClient;
  organizationId: string;
  gate: GhlSandboxGateInput;
}): Promise<GhlSandboxAuthority | null> {
  assertGhlSandboxAllowed(input.gate);
  return resolveGhlProviderAuthority({
    client: input.client,
    organizationId: input.organizationId,
    environment: "sandbox",
  });
}

export async function resolveGhlProductionAuthority(input: {
  client: GhlSandboxAuthorityClient;
  organizationId: string;
  gate: GhlProductionGateInput;
}): Promise<GhlSandboxAuthority | null> {
  assertGhlProductionAllowed(input.gate);
  return resolveGhlProviderAuthority({
    client: input.client,
    organizationId: input.organizationId,
    environment: "production",
  });
}

async function resolveGhlProviderAuthority(input: {
  client: GhlSandboxAuthorityClient;
  organizationId: string;
  environment: "sandbox" | "production";
}): Promise<GhlSandboxAuthority | null> {
  const prefix = input.environment === "sandbox" ? "ghl_sandbox" : "ghl_production";
  const tenant = await one(
    input.client.from("ghl_workspace_tenants")
      .select("organization_id,tenant_kind,partner_id,status")
      .eq("organization_id", input.organizationId)
      .eq("status", "active"),
    `${prefix}_tenant_lookup_failed`,
  );
  if (!tenant) return null;

  const mapping = await one(
    input.client.from("ghl_location_mappings")
      .select("id,organization_id,installation_id,environment,provider_location_id,snapshot_manifest_id,status,snapshot_verified_at,required_objects_verified_at")
      .eq("organization_id", input.organizationId)
      .eq("environment", input.environment)
      .eq("status", "active")
      .not("snapshot_verified_at", "is", null)
      .not("required_objects_verified_at", "is", null),
    `${prefix}_mapping_lookup_failed`,
  );
  if (!mapping) return null;

  const installation = await one(
    input.client.from("ghl_installations")
      .select("id,environment,provider_agency_id,encrypted_credential_ref,status")
      .eq("id", asString(mapping.installation_id))
      .eq("environment", input.environment)
      .eq("status", "active"),
    `${prefix}_installation_lookup_failed`,
  );
  const manifest = await one(
    input.client.from("ghl_snapshot_manifests")
      .select("id,environment,installation_id,provider_snapshot_id,required_objects,installation_mode,status")
      .eq("id", asString(mapping.snapshot_manifest_id))
      .eq("environment", input.environment)
      .eq("status", "approved"),
    `${prefix}_manifest_lookup_failed`,
  );
  if (!installation || !manifest) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_authority_incomplete`,
      `The canonical GHL ${input.environment} mapping is missing an active installation or approved manifest.`,
    );
  }
  if (asString(manifest.installation_id) !== asString(installation.id)) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_manifest_installation_mismatch`,
      `The approved GHL ${input.environment} manifest is not owned by the canonical installation.`,
    );
  }
  if (asString(manifest.installation_mode) !== "preinstalled") {
    throw new GhlSandboxAuthorityError(
      `${prefix}_snapshot_not_preinstalled`,
      `The approved GHL ${input.environment} manifest is not attested as preinstalled.`,
    );
  }

  const providerLocationId = asString(mapping.provider_location_id);
  const partnerId = asString(tenant.partner_id) || null;
  const legacyMappingsResult = await input.client.from("workspace_ghl_mapping")
    .select("ghl_location_id,sync_enabled")
    .eq("workspace_id", input.organizationId)
    .eq("sync_enabled", true) as Awaited<QueryResult>;
  if (legacyMappingsResult.error) {
    throw new GhlSandboxAuthorityError("ghl_legacy_mapping_lookup_failed", legacyMappingsResult.error.message);
  }
  const legacyMappings = Array.isArray(legacyMappingsResult.data)
    ? legacyMappingsResult.data.map(asRecord)
    : [];
  if (legacyMappings.some((legacy) => asString(legacy.ghl_location_id) !== providerLocationId)) {
    throw new GhlSandboxAuthorityError(
      "ghl_mapping_authority_conflict",
      "The canonical GHL mapping conflicts with the legacy workspace compatibility mapping.",
    );
  }

  if (partnerId) {
    const partnerConfig = await one(
      input.client.from("partner_ghl_config")
        .select("enabled,default_location_id")
        .eq("partner_id", partnerId)
        .eq("enabled", true),
      "ghl_legacy_partner_config_lookup_failed",
    );
    if (
      partnerConfig
      && asString(partnerConfig.default_location_id)
      && asString(partnerConfig.default_location_id) !== providerLocationId
    ) {
      throw new GhlSandboxAuthorityError(
        "ghl_mapping_authority_conflict",
        "The canonical GHL mapping conflicts with the legacy partner compatibility configuration.",
      );
    }
  }

  const credentialRef = asString(installation.encrypted_credential_ref).trim();
  const providerAgencyId = asString(installation.provider_agency_id);
  const requiredObjects = parseRequiredObjects(manifest.required_objects);
  if (!credentialRef || !providerAgencyId || !providerLocationId || requiredObjects.length === 0) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_authority_incomplete`,
      `The canonical GHL ${input.environment} authority is missing its credential reference or provider manifest.`,
    );
  }

  return {
    environment: input.environment,
    organizationId: input.organizationId,
    partnerId,
    mappingId: asString(mapping.id),
    providerLocationId,
    installationId: asString(installation.id),
    providerAgencyId,
    credentialRef,
    snapshotManifestId: asString(manifest.id),
    snapshotProviderId: asString(manifest.provider_snapshot_id),
    requiredObjects,
  };
}

export function requiredGhlProviderObject(
  authority: GhlSandboxAuthority,
  kind: GhlRequiredObject["kind"],
) {
  const object = authority.requiredObjects.find((candidate) => candidate.kind === kind);
  if (!object) return null;
  if (kind === "tag") return object.providerObjectId ?? object.key;
  return object.providerObjectId ?? null;
}

/**
 * Resolves the independent, location-scoped Sub-Account credential used only
 * for GET /forms/submissions. It never falls back to the installation's agency
 * credential and requires an explicit forms.readonly capability attestation.
 */
export async function resolveGhlInboundFormsReadAuthority(input: {
  client: GhlSandboxAuthorityClient;
  authority: GhlSandboxAuthority;
}): Promise<GhlInboundFormsReadAuthority> {
  const prefix = input.authority.environment === "production" ? "ghl_production" : "ghl_sandbox";
  const mapping = await one(
    input.client.from("ghl_location_mappings")
      .select("id,organization_id,environment,provider_location_id,status,forms_readonly_credential_ref,forms_readonly_capabilities,forms_readonly_scope_attested_at")
      .eq("id", input.authority.mappingId)
      .eq("organization_id", input.authority.organizationId)
      .eq("environment", input.authority.environment)
      .eq("status", "active"),
    `${prefix}_forms_readonly_authority_lookup_failed`,
  );
  if (!mapping) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_forms_readonly_authority_missing`,
      "The exact active GHL mapping has no form-submission read authority.",
    );
  }
  if (asString(mapping.provider_location_id) !== input.authority.providerLocationId) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_forms_readonly_location_mismatch`,
      "The GHL form-submission read authority is not bound to the canonical location.",
    );
  }

  const credentialRef = asString(mapping.forms_readonly_credential_ref).trim();
  const expectedCredentialPattern = input.authority.environment === "production"
    ? /^env:GHL_PRODUCTION_[A-Z0-9_]*_TOKEN$/
    : /^env:GHL_SANDBOX_[A-Z0-9_]*_TOKEN$/;
  const capabilities = parseCapabilities(mapping.forms_readonly_capabilities);
  const scopeAttestedAt = asString(mapping.forms_readonly_scope_attested_at);
  const attestationTimestamp = Date.parse(scopeAttestedAt);
  if (
    !expectedCredentialPattern.test(credentialRef)
    || !capabilities.includes("forms.readonly")
    || !Number.isFinite(attestationTimestamp)
    || attestationTimestamp > Date.now() + 300_000
  ) {
    throw new GhlSandboxAuthorityError(
      `${prefix}_forms_readonly_scope_unproven`,
      "A location-scoped GHL Sub-Account credential with forms.readonly scope is not attested.",
    );
  }

  return {
    environment: input.authority.environment,
    organizationId: input.authority.organizationId,
    mappingId: input.authority.mappingId,
    providerLocationId: input.authority.providerLocationId,
    providerAgencyId: input.authority.providerAgencyId,
    credentialRef,
    capabilities,
    scopeAttestedAt: new Date(attestationTimestamp).toISOString(),
  };
}
