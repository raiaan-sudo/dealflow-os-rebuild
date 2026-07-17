#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outputIndex = args.indexOf("--output-dir");
const outputDirectory = outputIndex >= 0 ? resolve(args[outputIndex + 1] ?? "") : null;

if (!checkOnly && !outputDirectory) {
  throw new Error("Use --check or provide --output-dir <directory>.");
}
if (outputIndex >= 0 && !args[outputIndex + 1]) {
  throw new Error("--output-dir requires a directory.");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const packageJsonBytes = await readFile(join(root, "package.json"));
const lockBytes = await readFile(join(root, "package-lock.json"));
const nvmrcBytes = await readFile(join(root, ".nvmrc"));
const packageJson = JSON.parse(packageJsonBytes.toString("utf8"));
const lock = JSON.parse(lockBytes.toString("utf8"));
const exactLocalNode = nvmrcBytes.toString("utf8").trim();

if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== "object") {
  throw new Error("A package-lock v3 package inventory is required.");
}
if (
  packageJson.packageManager !== "npm@11.11.0" ||
  packageJson.engines?.node !== "24.x" ||
  exactLocalNode !== "24.14.1"
) {
  throw new Error(
    "The exact local/CI toolchain and provider-supported hosted Node major are not pinned.",
  );
}

const acceptedLicenseExpressions = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
]);
const legalReviewExpressions = new Set([
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "CC-BY-4.0",
  "LGPL-3.0-or-later",
  "MPL-2.0",
  "Python-2.0",
]);
const prohibitedLicenseTokens = /(?:^|\s(?:AND|OR)\s)(?:AGPL|GPL)(?:-|$)/i;

function packageNameFromLockPath(path) {
  return path.split("node_modules/").at(-1) ?? "";
}

function purlFor(name, version) {
  if (name.startsWith("@")) {
    const [scope, packageName] = name.split("/");
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function integrityHashes(integrity) {
  if (typeof integrity !== "string") return [];
  const supported = new Map([
    ["sha1", "SHA-1"],
    ["sha256", "SHA-256"],
    ["sha384", "SHA-384"],
    ["sha512", "SHA-512"],
  ]);
  const hashes = [];
  for (const token of integrity.trim().split(/\s+/)) {
    const separator = token.indexOf("-");
    const algorithm = supported.get(token.slice(0, separator));
    if (!algorithm || separator < 1) continue;
    try {
      hashes.push({ alg: algorithm, content: Buffer.from(token.slice(separator + 1), "base64").toString("hex") });
    } catch {
      throw new Error(`Malformed integrity for ${token.slice(0, separator)} package.`);
    }
  }
  return hashes;
}

const components = [];
const licenseCounts = new Map();
const reviewComponents = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = packageNameFromLockPath(path);
  const version = typeof entry.version === "string" ? entry.version : "";
  const license = typeof entry.license === "string" ? entry.license.trim() : "";
  if (!name || !version || !license) {
    throw new Error(`Incomplete package identity or license at ${path}.`);
  }
  if (prohibitedLicenseTokens.test(license) && !license.includes("LGPL")) {
    throw new Error(`Prohibited copyleft license in ${name}@${version}: ${license}.`);
  }
  if (!acceptedLicenseExpressions.has(license)) {
    throw new Error(`Unreviewed dependency license in ${name}@${version}: ${license}.`);
  }
  licenseCounts.set(license, (licenseCounts.get(license) ?? 0) + 1);
  if (legalReviewExpressions.has(license)) {
    reviewComponents.push({ name, version, license });
  }
  const purl = purlFor(name, version);
  components.push({
    type: "library",
    name,
    version,
    "bom-ref": purl,
    purl,
    licenses: [{ expression: license }],
    hashes: integrityHashes(entry.integrity),
    scope: entry.dev === true ? "optional" : "required",
    properties: [
      { name: "dealflow:lockPath", value: path },
      { name: "dealflow:optional", value: String(entry.optional === true) },
    ],
  });
}
components.sort((left, right) =>
  `${left.name}\0${left.version}\0${left.properties[0].value}`.localeCompare(
    `${right.name}\0${right.version}\0${right.properties[0].value}`,
  ),
);
reviewComponents.sort((left, right) =>
  `${left.name}\0${left.version}`.localeCompare(`${right.name}\0${right.version}`),
);

const rootPurl = purlFor(packageJson.name, packageJson.version);
const lockSha256 = sha256(lockBytes);
const serialHex = sha256(`dealflow-sbom\0${lockSha256}`);
const serialUuid = `${serialHex.slice(0, 8)}-${serialHex.slice(8, 12)}-5${serialHex.slice(13, 16)}-a${serialHex.slice(17, 20)}-${serialHex.slice(20, 32)}`;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${serialUuid}`,
  version: 1,
  metadata: {
    tools: { components: [{ type: "application", name: "dealflow-lockfile-sbom", version: "1" }] },
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
      "bom-ref": rootPurl,
      purl: rootPurl,
      licenses: [{ expression: "LicenseRef-Proprietary" }],
    },
    properties: [
      { name: "dealflow:packageLockSha256", value: lockSha256 },
      { name: "dealflow:hostedNodeMajor", value: packageJson.engines.node },
      { name: "dealflow:qualifiedLocalNode", value: exactLocalNode },
      { name: "dealflow:packageManager", value: packageJson.packageManager },
    ],
  },
  components,
  dependencies: [{ ref: rootPurl, dependsOn: components.map((component) => component["bom-ref"]) }],
};

const licenseInventory = {
  schemaVersion: "dealflow.dependency-license-inventory.v1",
  packageLockSha256: lockSha256,
  componentCount: components.length,
  missingLicenseCount: 0,
  unreviewedLicenseCount: 0,
  prohibitedLicenseCount: 0,
  requiresOwnerLegalReview: reviewComponents.length > 0,
  licenseCounts: Object.fromEntries([...licenseCounts].sort(([left], [right]) => left.localeCompare(right))),
  ownerLegalReviewComponents: reviewComponents,
};
const provenance = {
  schemaVersion: "dealflow.local-supply-chain-provenance.v1",
  qualification: "LOCKFILE_DERIVED_NOT_A_SIGNED_BUILD_ATTESTATION",
  packageJsonSha256: sha256(packageJsonBytes),
  packageLockSha256: lockSha256,
  sbomSha256: sha256(`${JSON.stringify(sbom, null, 2)}\n`),
  licenseInventorySha256: sha256(`${JSON.stringify(licenseInventory, null, 2)}\n`),
  hostedNodeMajor: packageJson.engines.node,
  qualifiedLocalNode: exactLocalNode,
  packageManager: packageJson.packageManager,
  componentCount: components.length,
  externalSignatureRequiredForRelease: true,
};

if (outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "cyclonedx-sbom.json"), `${JSON.stringify(sbom, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(outputDirectory, "dependency-license-inventory.json"), `${JSON.stringify(licenseInventory, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(outputDirectory, "local-supply-chain-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
}

console.log(JSON.stringify({
  status: reviewComponents.length > 0 ? "PASS_INVENTORY_OWNER_LEGAL_REVIEW_REQUIRED" : "PASS",
  componentCount: components.length,
  packageLockSha256: lockSha256,
  ownerLegalReviewComponentCount: reviewComponents.length,
  signedBuildProvenance: false,
  outputDirectory,
}));
