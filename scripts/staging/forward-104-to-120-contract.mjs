import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const FORWARD_104_TO_120_AUTHORITY = Object.freeze({
  schemaVersion: "dealflow.staging-forward-104-to-120-authority.v1",
  projectFingerprint:
    "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c",
  projectSafeSuffix: "qibh",
  prior: Object.freeze({
    migrationCount: 104,
    finalMigration:
      "20260715010000_move_legacy_org_member_policies_private.sql",
    migrationPortfolioSha256:
      "f44431a984f93c736fcc229d2fff321cff3c676b3d334d4a8ca25d715e353224",
    normalizedSchemaSha256:
      "67f201df805559a97908e353e6c4e4a2c35df0812eb96cb6b92b50e711f84fe3",
    structuralCatalogSha256:
      "b863d9843c967ecab57a96dbf4005c39e28c90345b2545b797782919058af95d",
    proofCommit: "3ab010b692d3870d59effed3022ec631c1006289",
    proofTree: "4e07ee3ff7c188ed4242c928a9fa406c710092dc",
    brokerSourceSha256:
      "a92f9385a7bd9044ca709078cae263530b949ca571b59a0fe8290b4d9bce7dfa",
    authSurface: Object.freeze({
      userCount: 11,
      status: "EXACT_SYNTHETIC_FIXTURE_SET",
      emailSetSha256:
        "93afbc1dd7c7a8623f995994b2282bb567a64891c2d5e301a3e061d5cb2638a1",
      identitySetSha256:
        "eaacbf2e4302cdd9fa3babf7f6e31403ff04eef7824206bfc4c4074862386ca1",
    }),
  }),
  current: Object.freeze({
    migrationCount: 120,
    finalMigration:
      "20260717090000_create_canonical_lead_outcome_ledger.sql",
    migrationPortfolioSha256:
      "fa6f66b0346b7674f5613a206fcc188e1cb38cc0332919f9fe76337c2a37570f",
    // Independently reproduced twice on PostgreSQL 17.6: once from a fresh
    // 120-migration database and once from the exact 104 prefix followed by
    // migrations 105-120. The managed catalog uses a pg_catalog-only search
    // path, sorted ACL sets, and canonical JSON records so equivalent hosted
    // PostgreSQL catalog rendering cannot create a false mismatch. The managed
    // schema omits ACL rendering; the independent security oracle below binds
    // ACLs, policies, and routines.
    managedNormalizedSchemaSha256:
      "dcccf3e9514fa8cade3c88d39a518670f435807ac2d1461ca80c06db5ad10ffc",
    managedStructuralCatalogSha256:
      "7d2981e288c278a081539777ca1a23be0f5558b9e16c7db5991dcc52d4afce36",
    managedSecurityOracleSha256:
      "3a5e6b71867885fcb593d528e232d23d6bf339854511c8be59b39125cac4f48d",
  }),
  forwardMigrations: Object.freeze([
    Object.freeze({
      version: "20260716010000",
      file: "20260716010000_require_optimizer_cpl_minimum_lead_sample.sql",
      sha256: "83ace50e65a8f8445e0308090454c7bd4f850580d7defc575a4a8f9323c9f371",
      bytes: 3566,
    }),
    Object.freeze({
      version: "20260716180000",
      file: "20260716180000_harden_credit_top_up_request_idempotency.sql",
      sha256: "1825be59553b694dac292591fcf5febb5d4fd9e21f285fdeee2bb5eab895fe34",
      bytes: 4326,
    }),
    Object.freeze({
      version: "20260716190000",
      file: "20260716190000_add_ghl_marketplace_oauth_install_foundation.sql",
      sha256: "aecd5224183c6a50c8f80ed50f23ebeccf283cab8182cce71f34a80670b19a46",
      bytes: 72891,
    }),
    Object.freeze({
      version: "20260716200000",
      file: "20260716200000_harden_stripe_payment_lifecycle.sql",
      sha256: "e29627bf1db3419a07b5a9c6acfd8ad059cda9d186bb4a19bae5d62fbf706fae",
      bytes: 49454,
    }),
    Object.freeze({
      version: "20260717010000",
      file: "20260717010000_harden_onboarding_draft_integrity.sql",
      sha256: "e238144605a6397dca6b5f83a672be165327be80eab750c34c71b65bb5cbb301",
      bytes: 25866,
    }),
    Object.freeze({
      version: "20260717013000",
      file: "20260717013000_complete_ghl_marketplace_runtime_lifecycle.sql",
      sha256: "aae90729f392e05747a547179d18ae3227186cd6cf502801774467544cba6bd5",
      bytes: 58814,
    }),
    Object.freeze({
      version: "20260717020000",
      file: "20260717020000_canonicalize_campaign_lifecycle_truth.sql",
      sha256: "9968f7d299dd5a2f0de8e455c358391432b5020f150eb577c1cc56039a8d59dd",
      bytes: 16580,
    }),
    Object.freeze({
      version: "20260717030000",
      file: "20260717030000_harden_platform_operator_authority.sql",
      sha256: "4699891dcba38bd21efd874eda79120d597e07b3d43d2c829745b09c9cdfadd4",
      bytes: 19343,
    }),
    Object.freeze({
      version: "20260717040000",
      file: "20260717040000_bind_generated_static_storage_tenancy.sql",
      sha256: "3e9132b066789836be26fe1a64a2ae2ecac73f72717fa0fd05ceb7d19a27c706",
      bytes: 60690,
    }),
    Object.freeze({
      version: "20260717050000",
      file: "20260717050000_create_privacy_consent_dsar_authority.sql",
      sha256: "34ddaa16f92cc770f92d8ae77fedc9ce3cb0bd23111c291d5f38818738b796d8",
      bytes: 83774,
    }),
    Object.freeze({
      version: "20260717060000",
      file: "20260717060000_install_owner_decision_authority_grants.sql",
      sha256: "e7447581bf01e34f7e1751de46ff1827b064c171e1ceec0f5b16b344d9d06ab8",
      bytes: 15181,
    }),
    Object.freeze({
      version: "20260717070000",
      file: "20260717070000_complete_privacy_runtime_and_dynamic_deletion.sql",
      sha256: "6a554a72b631d09644ae3b88e985c338e077ad38febf09c1298c46b8b262fa97",
      bytes: 16773,
    }),
    Object.freeze({
      version: "20260717080000",
      file: "20260717080000_harden_support_delivery_lifecycle.sql",
      sha256: "71db8a821e05231ff3af20b18bbb629d8f37861dc3b6616dcde8dd06e8fcf948",
      bytes: 9468,
    }),
    Object.freeze({
      version: "20260717081000",
      file: "20260717081000_expand_campaign_lifecycle_authority.sql",
      sha256: "5b9861d310456e1a9d90b3ba1b2d85faef4bbd361651282bc9a30a1d478b8b4b",
      bytes: 21278,
    }),
    Object.freeze({
      version: "20260717082000",
      file: "20260717082000_provider_aware_funnel_publication.sql",
      sha256: "6787041d74216102cc5dcd63f8250981ec1921eafcc663231d6e105999dfebc4",
      bytes: 10615,
    }),
    Object.freeze({
      version: "20260717090000",
      file: "20260717090000_create_canonical_lead_outcome_ledger.sql",
      sha256: "3de79eb21cdddddaac9e85dfe9f6d419ec059e2c39e37fd16c07bbd5ab4df2de",
      bytes: 15133,
    }),
  ]),
  priorEvidence: Object.freeze({
    artifactSha256: Object.freeze({
      "evidence-manifest.json":
        "632400d491376d1abe89a3aa60e118b9bd0cdfe81c87cc1958e09166c0a48757",
      "evidence-manifest.pre-mutation.json":
        "7d920d214e4a30a99e283f58a73e2bfb4fafbd94b5cf87eb0e98014dddebee9b",
      "staging-broker-preflight.json":
        "5c57dc76b9249371ab1a2dde55c4a1787bd077a488a28162a3b0f30c2d3bd3b3",
      "staging-migration-proof.json":
        "d12260f416ec61e9e8c87881d47cfd57429f182086fa375ea62355b4c8c60ff6",
      "staging-migration-summary.json":
        "88fcbc904c3420d19bc4ef0c60c764b335686220ad404c177e70aaa4b5bb647b",
      "staging-migration-summary.pre-mutation.json":
        "11ffb105fb3dce66be552de4dc13c5a61dc6ceabae3910748af133f2f263de42",
      "staging-remote-read-started.json":
        "165938b7eea578b4df64b2fc4a2ab615f08f2f9392865e1d34d7dfc163f32e34",
    }),
    syntheticSurface: Object.freeze({
      outerManifestSha256:
        "cc1f02b95119c374670d53914c6f7b205093bb503d23d5498e443347431b8dae",
      sha256SumsSha256:
        "50babde77cdf8476aa5f571ceef9ddc49b9e5d417cf21321ca59792752636ad2",
      seedArtifactSha256:
        "b0342d5d0459675f5161053dcdef0cdd3972b90d8ced025d238bf7a8a494e52e",
      loadCountsArtifactSha256:
        "53a9ae24ee16a9b334b59c2914442a4a920bce55a8cbd738bd266ca03c793d82",
      fixture: "DF-STAGING-20260712",
      authUserCount: 11,
      organizationCount: 10,
      exactHighRiskCounts: Object.freeze({
        leads: 2,
        lead_messages: 1,
        ghl_provider_outbox: 0,
        support_notification_outbox: 1,
        provider_usage_events: 1,
        system_jobs: 5,
      }),
    }),
  }),
});

function portfolioSha256(records, migrationDirectory) {
  const digest = createHash("sha256");
  for (const record of records) {
    const contents = readFileSync(join(migrationDirectory, record.name));
    digest.update(String(Buffer.byteLength(record.name)));
    digest.update("\0");
    digest.update(record.name);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function assertExactForward104To120Portfolio(records, migrationDirectory) {
  if (!Array.isArray(records) || records.length !== FORWARD_104_TO_120_AUTHORITY.current.migrationCount) {
    throw new Error("Forward authority requires the exact 120-migration portfolio");
  }
  const names = records.map((record) => record.name);
  const versions = names.map((name) => name.slice(0, 14));
  if (
    new Set(names).size !== names.length ||
    new Set(versions).size !== versions.length ||
    [...names].sort().some((name, index) => name !== names[index])
  ) {
    throw new Error("Forward authority rejects unordered, duplicate, or ambiguous migration identities");
  }
  const priorRecords = records.slice(0, FORWARD_104_TO_120_AUTHORITY.prior.migrationCount);
  const forwardRecords = records.slice(FORWARD_104_TO_120_AUTHORITY.prior.migrationCount);
  if (
    priorRecords.at(-1)?.name !== FORWARD_104_TO_120_AUTHORITY.prior.finalMigration ||
    portfolioSha256(priorRecords, migrationDirectory) !==
      FORWARD_104_TO_120_AUTHORITY.prior.migrationPortfolioSha256
  ) {
    throw new Error("Forward authority rejects drift in the exact historical 104-migration prefix");
  }
  const actualForward = forwardRecords.map((record) => {
    const contents = readFileSync(join(migrationDirectory, record.name));
    return {
      version: record.name.slice(0, 14),
      file: record.name,
      sha256: sha256(contents),
      bytes: contents.byteLength,
    };
  });
  if (
    JSON.stringify(actualForward) !== JSON.stringify(FORWARD_104_TO_120_AUTHORITY.forwardMigrations) ||
    forwardRecords.at(-1)?.name !== FORWARD_104_TO_120_AUTHORITY.current.finalMigration ||
    portfolioSha256(records, migrationDirectory) !==
      FORWARD_104_TO_120_AUTHORITY.current.migrationPortfolioSha256
  ) {
    throw new Error("Forward authority rejects drift in ordered migrations 105 through 120");
  }
  return Object.freeze({
    priorRecords: Object.freeze([...priorRecords]),
    forwardRecords: Object.freeze([...forwardRecords]),
    priorVersions: Object.freeze(priorRecords.map((record) => record.name.slice(0, 14))),
    forwardVersions: Object.freeze(actualForward.map((record) => record.version)),
    currentVersions: Object.freeze(records.map((record) => record.name.slice(0, 14))),
  });
}

function assertExactPrior104Payload({ proof, summary, manifest }) {
  const authority = FORWARD_104_TO_120_AUTHORITY;
  const prior = authority.prior;
  const shared = [proof, summary];
  if (
    manifest?.schemaVersion !== "dealflow.staging-evidence-manifest.v1" ||
    manifest.status !== "PASS" ||
    manifest.migrationMode !== "VERIFY_EXISTING_EXACT" ||
    manifest.verificationReadOnly !== true ||
    manifest.remoteMutationStarted !== false ||
    manifest.remoteMutationCompleted !== false ||
    manifest.portfolioApplicationRemoteMutationCompleted !== true
  ) {
    throw new Error("Prior 104 evidence manifest is not the exact read-only qibh seal");
  }
  for (const payload of shared) {
    if (
      payload?.status !== "PASS" ||
      payload.migrationMode !== "VERIFY_EXISTING_EXACT" ||
      payload.projectFingerprint !== authority.projectFingerprint ||
      payload.safeSuffix !== authority.projectSafeSuffix ||
      payload.headCommit !== prior.proofCommit ||
      payload.headTree !== prior.proofTree ||
      payload.migrationCount !== prior.migrationCount ||
      payload.migrationHistoryCount !== prior.migrationCount ||
      payload.migrationPortfolioSha256 !== prior.migrationPortfolioSha256 ||
      payload.lastCommittedVersion !== prior.finalMigration.slice(0, 14) ||
      payload.normalizedSchemaSha256 !== prior.normalizedSchemaSha256 ||
      payload.brokerSourceSha256 !== prior.brokerSourceSha256
    ) {
      throw new Error("Prior 104 evidence payload is not the exact historical qibh identity");
    }
  }
  const state = proof.remoteStateVerification?.state;
  const auth = proof.authUserSurfaceAtVerification;
  if (
    proof.schemaVersion !== "dealflow.isolated-staging-migration-proof.v1" ||
    summary.schemaVersion !== "dealflow.staging-migration-summary.v1" ||
    proof.remoteStateVerification?.status !== "EXACT_EXISTING_COMMITTED_PORTFOLIO" ||
    summary.remoteStateVerificationStatus !== "EXACT_EXISTING_COMMITTED_PORTFOLIO" ||
    state?.historyTableExists !== true ||
    state.migrationHistoryCount !== prior.migrationCount ||
    state.structuralCatalogSha256 !== prior.structuralCatalogSha256 ||
    state.storageObjectCount !== 0 ||
    auth?.status !== prior.authSurface.status ||
    auth.userCount !== prior.authSurface.userCount ||
    auth.emailSetSha256 !== prior.authSurface.emailSetSha256 ||
    auth.identitySetSha256 !== prior.authSurface.identitySetSha256 ||
    auth.unexpectedIdentityCount !== 0 ||
    auth.rawIdentityValuesPersisted !== false
  ) {
    throw new Error("Prior 104 evidence does not prove the exact safe structural and synthetic surface");
  }
  return Object.freeze({
    applicationCommit: prior.proofCommit,
    applicationTree: prior.proofTree,
    migrationCount: prior.migrationCount,
    lastCommittedVersion: prior.finalMigration.slice(0, 14),
    migrationPortfolioSha256: prior.migrationPortfolioSha256,
    normalizedSchemaSha256: prior.normalizedSchemaSha256,
    structuralCatalogSha256: prior.structuralCatalogSha256,
    authSurface: Object.freeze({ ...prior.authSurface }),
    evidenceKind: "read_only_exact_verification",
    portfolioApplicationRemoteMutationCompleted: true,
  });
}

export function loadExactPrior104StagingSeal(directory) {
  const stat = lstatSync(directory);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    realpathSync(directory) !== directory
  ) {
    throw new Error("Prior 104 staging seal must be a real canonical directory");
  }
  const expectedDigests = FORWARD_104_TO_120_AUTHORITY.priorEvidence.artifactSha256;
  const expectedNames = Object.keys(expectedDigests).sort();
  const actualNames = readdirSync(directory).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Prior 104 staging seal must contain the exact sealed artifact set");
  }
  const artifacts = new Map();
  for (const name of expectedNames) {
    const path = join(directory, name);
    const artifactStat = lstatSync(path);
    if (
      artifactStat.isSymbolicLink() ||
      !artifactStat.isFile() ||
      artifactStat.nlink !== 1 ||
      (artifactStat.mode & 0o077) !== 0 ||
      realpathSync(path) !== path
    ) {
      throw new Error("Prior 104 staging artifacts must be canonical owner-only regular files");
    }
    const contents = readFileSync(path);
    if (sha256(contents) !== expectedDigests[name]) {
      throw new Error("Prior 104 staging artifact does not match its pinned SHA-256");
    }
    artifacts.set(name, { contents, parsed: JSON.parse(contents.toString("utf8")) });
  }
  const manifest = artifacts.get("evidence-manifest.json").parsed;
  const manifestRecords = new Map((manifest.artifacts ?? []).map((record) => [record.path, record]));
  const sealedNames = expectedNames.filter((name) => name !== "evidence-manifest.json");
  if (manifestRecords.size !== sealedNames.length) {
    throw new Error("Prior 104 staging manifest does not seal the exact artifact set");
  }
  for (const name of sealedNames) {
    const record = manifestRecords.get(name);
    const artifact = artifacts.get(name);
    if (
      record?.sha256 !== sha256(artifact.contents) ||
      record?.bytes !== artifact.contents.byteLength
    ) {
      throw new Error("Prior 104 staging manifest record does not match its artifact");
    }
  }
  return Object.freeze({
    ...assertExactPrior104Payload({
      proof: artifacts.get("staging-migration-proof.json").parsed,
      summary: artifacts.get("staging-migration-summary.json").parsed,
      manifest,
    }),
    manifestSha256: expectedDigests["evidence-manifest.json"],
    proofSha256: expectedDigests["staging-migration-proof.json"],
    summarySha256: expectedDigests["staging-migration-summary.json"],
    priorEvidenceDirectoryName: basename(directory),
    priorEvidencePathSha256: sha256(directory),
    rawValuesPersisted: false,
  });
}

function readCanonicalOwnerOnlyFile(path, label) {
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0 ||
    realpathSync(path) !== path
  ) {
    throw new Error(`${label} must be a canonical owner-only regular file`);
  }
  return readFileSync(path);
}

export function loadExactPrior104SyntheticSurfaceSeal(priorProofDirectory) {
  if (basename(priorProofDirectory) !== "migration-proof") {
    throw new Error("Prior 104 migration proof must remain inside its exact sealed acceptance bundle");
  }
  const outerDirectory = dirname(priorProofDirectory);
  const outerStat = lstatSync(outerDirectory);
  if (
    outerStat.isSymbolicLink() ||
    !outerStat.isDirectory() ||
    (outerStat.mode & 0o077) !== 0 ||
    realpathSync(outerDirectory) !== outerDirectory
  ) {
    throw new Error("Prior 104 synthetic surface bundle must be a canonical owner-only directory");
  }
  const authority = FORWARD_104_TO_120_AUTHORITY.priorEvidence.syntheticSurface;
  const manifestBytes = readCanonicalOwnerOnlyFile(
    join(outerDirectory, "evidence-manifest.json"),
    "Prior 104 outer evidence manifest",
  );
  const sumsBytes = readCanonicalOwnerOnlyFile(
    join(outerDirectory, "SHA256SUMS"),
    "Prior 104 checksum ledger",
  );
  const seedBytes = readCanonicalOwnerOnlyFile(
    join(outerDirectory, "synthetic-seed.json"),
    "Prior 104 synthetic seed proof",
  );
  const loadCountsBytes = readCanonicalOwnerOnlyFile(
    join(outerDirectory, "hosted-load-and-no-effect-counts.json"),
    "Prior 104 high-risk row-count proof",
  );
  if (
    sha256(manifestBytes) !== authority.outerManifestSha256 ||
    sha256(sumsBytes) !== authority.sha256SumsSha256 ||
    sha256(seedBytes) !== authority.seedArtifactSha256 ||
    sha256(loadCountsBytes) !== authority.loadCountsArtifactSha256
  ) {
    throw new Error("Prior 104 synthetic relational authority does not match its pinned sealed artifacts");
  }
  const sums = sumsBytes.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const [name, digest] of [
    ["synthetic-seed.json", authority.seedArtifactSha256],
    ["hosted-load-and-no-effect-counts.json", authority.loadCountsArtifactSha256],
  ]) {
    if (!sums.includes(`${digest}  ${name}`)) {
      throw new Error("Prior 104 checksum ledger does not bind the synthetic relational authority");
    }
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestRecord = new Map(
    (manifest.files ?? []).map((record) => [record.path, record]),
  );
  if (
    manifest.schemaVersion !== "dealflow.isolated-staging-acceptance-manifest.v1" ||
    manifest.containsRealCustomerData !== false ||
    manifestRecord.get("synthetic-seed.json")?.sha256 !== authority.seedArtifactSha256 ||
    manifestRecord.get("synthetic-seed.json")?.bytes !== seedBytes.byteLength ||
    manifestRecord.get("hosted-load-and-no-effect-counts.json")?.sha256 !==
      authority.loadCountsArtifactSha256 ||
    manifestRecord.get("hosted-load-and-no-effect-counts.json")?.bytes !==
      loadCountsBytes.byteLength
  ) {
    throw new Error("Prior 104 outer manifest does not seal the exact synthetic relational authority");
  }
  const seed = JSON.parse(seedBytes.toString("utf8"));
  const first = seed.first;
  if (
    seed.status !== "PASS" ||
    seed.containsRealCustomerData !== false ||
    seed.providerCredentialPresent !== false ||
    seed.providerMutationPerformed !== false ||
    seed.exactlyIdempotent !== true ||
    JSON.stringify(first) !== JSON.stringify(seed.replay) ||
    first?.fixture !== authority.fixture ||
    first.providerCredentialPresent !== false ||
    first.providerMutationPerformed !== false ||
    first.exactFixtureCountsVerified !== true ||
    first.exactSyntheticAuthUserCount !== authority.authUserCount
  ) {
    throw new Error("Prior 104 seed proof is not the exact idempotent synthetic-only fixture truth");
  }
  const userIds = [
    ...Object.values(first.scenarios ?? {}).map((scenario) => scenario?.userId),
    first.qaHarness?.userId,
  ].sort();
  const organizationIds = Object.values(first.organizations ?? {}).sort();
  if (
    userIds.length !== authority.authUserCount ||
    organizationIds.length !== authority.organizationCount ||
    new Set(userIds).size !== userIds.length ||
    new Set(organizationIds).size !== organizationIds.length ||
    userIds.some(
      (value) =>
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value ?? "",
        ),
    ) ||
    organizationIds.some(
      (value) =>
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value ?? "",
        ),
    ) ||
    !userIds.includes(first.userId) ||
    !organizationIds.includes(first.organizationId) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      first.campaignId ?? "",
    )
  ) {
    throw new Error("Prior 104 seed proof does not bind the exact synthetic user and organization roots");
  }
  const loadCounts = JSON.parse(loadCountsBytes.toString("utf8"));
  if (
    loadCounts.status !== "PASS" ||
    loadCounts.exactCountsUnchanged !== true ||
    loadCounts.providerMutationPerformed !== false ||
    loadCounts.customerLeadWritePerformed !== false ||
    JSON.stringify(loadCounts.countsBefore) !==
      JSON.stringify(authority.exactHighRiskCounts) ||
    JSON.stringify(loadCounts.countsAfter) !==
      JSON.stringify(authority.exactHighRiskCounts)
  ) {
    throw new Error("Prior 104 load proof does not bind the exact high-risk synthetic row counts");
  }
  return Object.freeze({
    userIds: Object.freeze(userIds),
    organizationIds: Object.freeze(organizationIds),
    highRiskCountScopes: Object.freeze({
      leads: Object.freeze({ column: "campaign_id", value: first.campaignId }),
      provider_usage_events: Object.freeze({
        column: "organization_id",
        value: first.organizationId,
      }),
      system_jobs: Object.freeze({
        column: "organization_id",
        value: first.organizationId,
      }),
    }),
    evidence: Object.freeze({
      schemaVersion: "dealflow.prior-104-synthetic-relational-authority.v1",
      fixture: authority.fixture,
      authUserCount: userIds.length,
      organizationCount: organizationIds.length,
      userIdSetSha256: sha256(JSON.stringify(userIds)),
      organizationIdSetSha256: sha256(JSON.stringify(organizationIds)),
      exactHighRiskCounts: authority.exactHighRiskCounts,
      outerManifestSha256: authority.outerManifestSha256,
      sha256SumsSha256: authority.sha256SumsSha256,
      seedArtifactSha256: authority.seedArtifactSha256,
      loadCountsArtifactSha256: authority.loadCountsArtifactSha256,
      rawIdentityValuesPersisted: false,
      containsRealCustomerData: false,
      providerCredentialPresent: false,
    }),
  });
}

export function classifyForward104RemoteHistory(
  versions,
  { priorVersions, currentVersions },
) {
  if (
    !Array.isArray(versions) ||
    !Array.isArray(priorVersions) ||
    !Array.isArray(currentVersions) ||
    versions.some((value) => !/^\d{14}$/.test(value))
  ) {
    return "UNEXPECTED_OR_AMBIGUOUS_HISTORY";
  }
  const authority = FORWARD_104_TO_120_AUTHORITY;
  const priorFinal = authority.prior.finalMigration.slice(0, 14);
  const currentFinal = authority.current.finalMigration.slice(0, 14);
  if (
    versions.length === authority.prior.migrationCount &&
    versions.at(-1) === priorFinal &&
    new Set(versions).size === versions.length &&
    JSON.stringify(versions) === JSON.stringify(priorVersions)
  ) return "EXACT_PRIOR_104_CANDIDATE";
  if (
    versions.length === authority.current.migrationCount &&
    versions.at(-1) === currentFinal &&
    new Set(versions).size === versions.length &&
    JSON.stringify(versions) === JSON.stringify(currentVersions)
  ) return "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF";
  return "UNEXPECTED_OR_AMBIGUOUS_HISTORY";
}
