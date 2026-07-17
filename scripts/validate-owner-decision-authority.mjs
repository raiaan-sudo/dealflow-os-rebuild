#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
export const PACKET_PATH = join(
  REPOSITORY_ROOT,
  "config",
  "authority",
  "dealflow-owner-decisions.v1.json",
);
export const SCHEMA_PATH = join(
  REPOSITORY_ROOT,
  "config",
  "authority",
  "dealflow-owner-decisions.schema.json",
);
export const PLAN_PATH = join(
  REPOSITORY_ROOT,
  "docs",
  "dealflow-completion",
  "FINAL_FULL_STACK_EXECUTION_PLAN.md",
);

export const EXPECTED_DECISION_IDS = Object.freeze([
  "OWNER-001",
  "OWNER-002",
  "OWNER-003",
  "OWNER-004",
  "OWNER-005",
  "OWNER-006",
  "OWNER-007",
  "OWNER-008",
  "OWNER-009",
  "OWNER-010",
  "OWNER-011",
  "OWNER-012",
  "OWNER-013",
  "OWNER-014",
  "OWNER-015",
  "OWNER-016",
  "OWNER-017",
  "OWNER-018",
  "OWNER-019",
  "OWNER-PRIVACY-001",
  "OWNER-PRIVACY-002",
  "OWNER-PRIVACY-003",
  "OWNER-PRIVACY-004",
  "OWNER-PRIVACY-005",
  "OWNER-PRIVACY-006",
  "OWNER-PRIVACY-007",
  "OWNER-PRIVACY-008",
  "OWNER-PRIVACY-009",
  "OWNER-SCOPE-001",
  "OWNER-SCOPE-002",
  "OWNER-SCOPE-003",
  "OWNER-SCOPE-004",
  "OWNER-SCOPE-005",
  "OWNER-SCOPE-006",
  "OWNER-SCOPE-007",
  "OWNER-SCOPE-008",
  "OWNER-SCOPE-009",
  "OWNER-SCOPE-010",
  "OWNER-SCOPE-011",
  "OWNER-SCOPE-012",
  "OWNER-SCOPE-GROWTH-AGENT",
  "OWNER-SCOPE-SALES-COPILOT",
  "OWNER-ADMIN-SECURITY-SURFACE",
]);

export const EXPECTED_REQUIREMENT_IDS = Object.freeze([
  "CORE-ADMIN-001",
  "CORE-AUTH-001",
  "CORE-CAMPAIGN-001",
  "CORE-FUNNEL-001",
  "CORE-ONBOARDING-001",
  "CORE-QUALITY-SCALE-001",
  "CORE-SECURITY-DATA-001",
  "CORE-UI-001",
  "PRIVACY-COMPLIANCE-001",
  "PVD-CONTENT-RIGHTS-001",
  "PVD-CREATIVE-001",
  "PVD-DELETE-001",
  "PVD-FOUNDATION-001",
  "PVD-GHL-001",
  "PVD-GHL-COMMUNICATION-SAFETY-001",
  "PVD-GOLDEN-001",
  "PVD-LEAD-OUTCOME-FEEDBACK-001",
  "PVD-LOCALIZATION-001",
  "PVD-META-001",
  "PVD-OPTIMIZER-001",
  "PVD-REPORT-001",
  "PVD-STRIPE-001",
  "PVD-TWILIO-001",
  "PVD-WHITELABEL-001",
  "REL-ALIASES-001",
  "REL-CANARY-001",
  "REL-CANARY-INGRESS-001",
  "REL-CAPABILITY-001",
  "REL-CUTOVER-001",
  "REL-DEPLOYMENT-001",
  "REL-DOMAINS-001",
  "REL-DRAIN-001",
  "REL-ENV-001",
  "REL-GOLDEN-001",
  "REL-GUARD-001",
  "REL-LEGACY-FUNNEL-MIGRATION-001",
  "REL-MIGRATION-001",
  "REL-MIGRATION-IMPACT-001",
  "REL-MONITOR-001",
  "REL-OBS-001",
  "REL-POST-ALIAS-GUARD-AND-RAMP-001",
  "REL-POST-MIGRATION-GUARD-001",
  "REL-PRE-ALIAS-001",
  "REL-PROD-TRUTH-001",
  "REL-RECOVERY-001",
  "REL-SEAL-001",
  "REL-SIGNED-PREREQUISITE-INDEX-001",
  "REL-SOURCE-001",
  "REL-SUPPLY-CHAIN-001",
  "REL-TRUST-001",
  "REL-WHOLE-SYSTEM-DR-001",
  "SEC-PRIVILEGED-TENANCY-001",
  "VISION-SUPPORT-001",
]);

const EXPECTED_INVENTORY_SHA256 =
  "12d0d5780a28dd93696f17ed1e7177ed85460428c4c3b02e180cf68db9073b8d";
const EXPECTED_REQUIREMENT_IDS_SHA256 =
  "8c6bf382bb5f7d0233ecb7edbf591167dad3c18f5f14206735d38f830f3c9bc4";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("unsupported canonical JSON");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every((value, index) => value === sortedExpected[index]);
}

function expectedCategory(id) {
  if (id.startsWith("OWNER-PRIVACY-")) return "PRIVACY";
  if (/^OWNER-SCOPE-\d/.test(id)) return "IMPORTED_DEBT";
  if (id === "OWNER-SCOPE-GROWTH-AGENT" || id === "OWNER-SCOPE-SALES-COPILOT") {
    return "EXPERIMENTAL_SCOPE";
  }
  if (id === "OWNER-ADMIN-SECURITY-SURFACE") return "ADMIN_SECURITY";
  return "PRIMARY";
}

function expectedSafeDefault(id) {
  if (id.startsWith("OWNER-PRIVACY-")) {
    return "FAIL_CLOSED_NO_UNAPPROVED_PROCESSING_OR_COMMUNICATION";
  }
  if (/^OWNER-SCOPE-\d/.test(id)) {
    return "PRESERVE_OR_QUARANTINE_FAIL_CLOSED_NO_PRODUCTION_EXPOSURE";
  }
  if (id === "OWNER-SCOPE-GROWTH-AGENT" || id === "OWNER-SCOPE-SALES-COPILOT") {
    return "UNREACHABLE_INTERNAL_OR_FUTURE_AND_RELEASE_BLOCKED_PENDING_SIGNATURE";
  }
  if (id === "OWNER-ADMIN-SECURITY-SURFACE") {
    return "REMOVE_OR_RENDER_UNAVAILABLE_NEVER_FABRICATE_A_SECURITY_SCORE";
  }
  if (id === "OWNER-005") return "fixed preinstalled GHL question slots";
  if (id === "OWNER-010") return "lead-facing automated SMS disabled";
  if (id === "OWNER-014") {
    return "Meta CAPI disabled and Browser Pixel explicit opt-in only";
  }
  return "FAIL_CLOSED";
}

function stableInventory(decisions) {
  return decisions.map(
    ({
      id,
      question,
      source,
      safeDefault,
      affectedRequirementIds,
      directlyAffectedLegacyKeys,
    }) => ({
      id,
      question,
      source,
      safeDefault,
      affectedRequirementIds,
      directlyAffectedLegacyKeys,
    }),
  );
}

export function migrationPortfolioIdentity(root) {
  const directory = join(root, "supabase", "migrations");
  const files = readdirSync(directory)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  const versions = new Set(files.map((name) => name.slice(0, 14)));
  if (files.length === 0 || versions.size !== files.length) {
    throw new Error("Migration portfolio is empty or contains duplicate versions");
  }
  const digest = createHash("sha256");
  for (const name of files) {
    const contents = readFileSync(join(directory, name));
    digest.update(String(Buffer.byteLength(name)));
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(String(contents.length));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return {
    count: files.length,
    sha256: digest.digest("hex"),
  };
}

export function validateOwnerDecisionPacket(
  packet,
  { root = REPOSITORY_ROOT, checkRepository = true } = {},
) {
  const errors = [];
  const require = (condition, message) => {
    if (!condition) errors.push(message);
  };

  require(packet && typeof packet === "object" && !Array.isArray(packet), "packet must be an object");
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return { ok: false, errors, summary: null };
  }

  require(packet.$schema === "./dealflow-owner-decisions.schema.json", "unexpected schema reference");
  require(packet.schemaVersion === "dealflow.owner-decisions.v1", "unexpected schema version");
  require(
    packet.globalPolicy?.unresolvedBehavior ===
      "APPLY_SAFE_DEFAULT_AND_BLOCK_EFFECT_OR_RELEASE",
    "unresolved behavior must apply the safe default and block effect or release",
  );
  require(packet.globalPolicy?.environmentVariablesCannotGrantAuthority === true, "environment authority must be denied");
  require(packet.globalPolicy?.unsignedValuesCannotGrantAuthority === true, "unsigned authority must be denied");
  require(packet.globalPolicy?.providerCredentialsCannotGrantAuthority === true, "credential presence must not grant authority");
  require(packet.globalPolicy?.productionReleaseAuthorized === false, "packet must not authorize production release");

  const requirementIds = packet.planBinding?.requirementIds;
  require(packet.planBinding?.requirementCount === 53, "requirement count must be 53");
  require(sameStringSet(requirementIds, EXPECTED_REQUIREMENT_IDS), "requirement IDs must equal the frozen 53-ID set");
  const requirementDigest = sha256(`${[...(requirementIds ?? [])].sort().join("\n")}\n`);
  require(
    packet.planBinding?.sortedRequirementIdsSha256 === EXPECTED_REQUIREMENT_IDS_SHA256,
    "packet requirement-ID digest changed",
  );
  require(requirementDigest === EXPECTED_REQUIREMENT_IDS_SHA256, "computed requirement-ID digest changed");

  const decisions = Array.isArray(packet.decisions) ? packet.decisions : [];
  const decisionIds = decisions.map((decision) => decision?.id);
  require(decisions.length === 43, "decision count must be 43");
  require(new Set(decisionIds).size === decisionIds.length, "decision IDs must be unique");
  require(sameStringSet(decisionIds, EXPECTED_DECISION_IDS), "decision IDs must equal the frozen 43-ID set");

  const requirementSet = new Set(EXPECTED_REQUIREMENT_IDS);
  for (const decision of decisions) {
    const prefix = decision?.id ?? "UNKNOWN";
    require(typeof decision?.question === "string" && decision.question.length >= 8, `${prefix}: question is missing`);
    require(typeof decision?.source === "string" && decision.source.length > 0, `${prefix}: source is missing`);
    require(decision?.releaseBlocking === true, `${prefix}: decision must remain release blocking`);
    require(decision?.category === expectedCategory(prefix), `${prefix}: category changed`);
    require(decision?.safeDefault === expectedSafeDefault(prefix), `${prefix}: safe default changed`);
    require(
      Array.isArray(decision?.affectedRequirementIds) && decision.affectedRequirementIds.length > 0,
      `${prefix}: affected requirement IDs are missing`,
    );
    for (const id of decision?.affectedRequirementIds ?? []) {
      require(requirementSet.has(id), `${prefix}: unknown affected requirement ${id}`);
    }
    require(Array.isArray(decision?.directlyAffectedLegacyKeys), `${prefix}: legacy-key bindings must be an array`);
    require(Array.isArray(decision?.activationGates), `${prefix}: activation gates must be an array`);

    if (decision?.status === "UNRESOLVED_SIGNED_DECISION_REQUIRED") {
      require(decision.selectedValue === null, `${prefix}: unresolved decision selected a value`);
      require(decision.effectiveAt === null, `${prefix}: unresolved decision has an effective time`);
      require(decision.reviewAt === null, `${prefix}: unresolved decision has a review time`);
      require(decision.approver?.role === "UNASSIGNED", `${prefix}: unresolved decision assigned an approver`);
      require(decision.approver?.identityRef === null, `${prefix}: unresolved decision has an approver identity`);
      require(decision.approver?.approvedAt === null, `${prefix}: unresolved decision has an approval time`);
      require(decision.approver?.signatureRef === null, `${prefix}: unresolved decision has a signature`);
      require(decision.activationGates.includes("SAFE_DEFAULT_ACTIVE"), `${prefix}: safe default is not active`);
      require(
        decision.activationGates.includes("RELEASE_BLOCKED_UNTIL_SIGNED_APPROVAL"),
        `${prefix}: release block is missing`,
      );
    } else {
      require(false, `${prefix}: tracked template must remain unresolved; approvals belong only in the detached signed envelope`);
    }
  }

  const inventoryDigest = sha256(JSON.stringify(stableInventory(decisions)));
  require(packet.decisionInventorySha256 === EXPECTED_INVENTORY_SHA256, "packet decision-inventory digest changed");
  require(inventoryDigest === EXPECTED_INVENTORY_SHA256, "computed decision inventory changed");

  const unresolved = decisions.filter(
    (decision) => decision.status === "UNRESOLVED_SIGNED_DECISION_REQUIRED",
  ).length;
  const approved = decisions.filter((decision) => decision.status === "APPROVED").length;
  const categories = Object.fromEntries(
    ["PRIMARY", "PRIVACY", "IMPORTED_DEBT", "EXPERIMENTAL_SCOPE", "ADMIN_SECURITY"].map(
      (category) => [category, decisions.filter((decision) => decision.category === category).length],
    ),
  );
  require(packet.counts?.total === 43, "counts.total must be 43");
  require(packet.counts?.unresolved === unresolved, "counts.unresolved does not match decisions");
  require(packet.counts?.approved === approved, "counts.approved does not match decisions");
  require(packet.counts?.primary === categories.PRIMARY, "primary category count changed");
  require(packet.counts?.privacy === categories.PRIVACY, "privacy category count changed");
  require(packet.counts?.importedDebt === categories.IMPORTED_DEBT, "debt category count changed");
  require(packet.counts?.experimentalScope === categories.EXPERIMENTAL_SCOPE, "experimental category count changed");
  require(packet.counts?.adminSecurity === categories.ADMIN_SECURITY, "admin-security category count changed");

  require(unresolved === 43 && approved === 0, "tracked template must keep all 43 decisions unresolved");
  require(packet.packetStatus === "UNRESOLVED_FAIL_CLOSED", "tracked template must be fail closed");
  require(packet.signatureStatus === "NOT_SIGNED", "tracked template must never claim a signature");
  require(packet.packetDigest === null, "tracked template must never claim a signed digest");

  const binding = packet.candidateBinding;
  require(binding?.bindingType === "DETACHED_SIGNED_AUTHORITY_REQUIRED", "detached authority binding type changed");
  require(binding?.envelopeSchemaVersion === "dealflow.owner-decision-authority-envelope.v1", "detached envelope schema changed");
  require(binding?.templatePath === "config/authority/dealflow-owner-decisions.v1.json", "template path changed");
  require(binding?.exactCandidateIdentityLocation === "DETACHED_AUTHORITY_ENVELOPE", "candidate identity must remain detached");
  require(binding?.trackedTemplateCannotGrantAuthority === true, "tracked template authority denial is missing");
  require(binding?.trackedSuccessorRequiresNewDetachedAuthority === true, "tracked successor authority warning is missing");

  if (checkRepository) {
    const schema = readJson(join(root, "config", "authority", "dealflow-owner-decisions.schema.json"));
    require(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "JSON Schema draft changed");
    require(
      schema.$id === "https://agentdealflow.io/schemas/dealflow-owner-decisions.v1.schema.json",
      "JSON Schema ID changed",
    );
    require(schema.properties?.decisions?.minItems === 43, "JSON Schema no longer requires 43 decisions");
    require(schema.properties?.planBinding?.properties?.requirementCount?.const === 53, "JSON Schema no longer requires 53 requirements");

    const plan = readFileSync(join(root, "docs", "dealflow-completion", "FINAL_FULL_STACK_EXECUTION_PLAN.md"), "utf8");
    const assignedIds = [...plan.matchAll(/^- `([A-Z][A-Z0-9-]+)`$/gm)].map((match) => match[1]);
    require(sameStringSet(assignedIds, EXPECTED_REQUIREMENT_IDS), "execution plan must assign each of the 53 requirements exactly once");

    const packageJson = readJson(join(root, "package.json"));
    require(
      packageJson.scripts?.["authority:validate"] ===
        "node ./scripts/validate-owner-decision-authority.mjs",
      "authority:validate package script is missing or changed",
    );
    require(
      packageJson.scripts?.["test:authority"] ===
        "node ./scripts/test-owner-decision-authority.mjs",
      "test:authority package script is missing or changed",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      packetStatus: packet.packetStatus,
      decisions: decisions.length,
      unresolved,
      approved,
      requirements: requirementIds?.length ?? 0,
      templateSha256: sha256(Buffer.from(canonicalJson(packet))),
      candidateIdentityLocation: binding?.exactCandidateIdentityLocation ?? null,
      detachedEnvelopeRequired: true,
      productionReleaseAuthorized: false,
    },
  };
}

export function loadCanonicalPacket(root = REPOSITORY_ROOT) {
  return readJson(join(root, "config", "authority", "dealflow-owner-decisions.v1.json"));
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const packet = loadCanonicalPacket();
  const result = validateOwnerDecisionPacket(packet);
  if (!result.ok) {
    process.stderr.write(
      `${JSON.stringify({ verdict: "NO_GO", errors: result.errors, summary: result.summary }, null, 2)}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify({ verdict: "PASS_FAIL_CLOSED", ...result.summary }, null, 2)}\n`,
    );
  }
}
