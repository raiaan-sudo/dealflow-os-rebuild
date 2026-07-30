#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("invalid envelope value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
};
const args = Object.fromEntries(process.argv.slice(2).map((part) => {
  const [key, ...value] = part.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
for (const name of ["guard", "private-key", "output", "authority-id", "key-id", "expires-at"]) {
  if (!args[name]) throw new Error(`Missing --${name}`);
}
for (const name of ["guard", "private-key", "output"]) {
  if (!path.isAbsolute(args[name])) throw new Error(`${name} path must be absolute`);
}
const repositoryRoot = fs.realpathSync(process.cwd());
const privateKeyPath = fs.realpathSync(args["private-key"]);
const outputPath = path.join(
  fs.realpathSync(path.dirname(args.output)),
  path.basename(args.output),
);
for (const candidate of [privateKeyPath, outputPath]) {
  const relationship = path.relative(repositoryRoot, candidate);
  if (
    relationship === "" ||
    (!relationship.startsWith(`..${path.sep}`) && relationship !== "..") ||
    path.isAbsolute(relationship)
  ) throw new Error("Protected signer paths must resolve outside the repository");
}
const guardBytes = fs.readFileSync(args.guard);
const guard = JSON.parse(guardBytes);
if (
  guard.schemaVersion !== "dealflow.release-guard.v5" ||
  guard.gate?.decision !== "PRE_MUTATION_ADMISSION_PASS" ||
  guard.gate?.enforced !== true
) throw new Error("Guard v5 is not an enforced admission pass");
const expiresAt = Date.parse(args["expires-at"]);
if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Expiry is invalid");
const keyStat = fs.lstatSync(args["private-key"]);
if (!keyStat.isFile() || keyStat.isSymbolicLink() || (keyStat.mode & 0o077) !== 0) {
  throw new Error("Private key must be a protected regular file");
}
const privateKey = createPrivateKey(fs.readFileSync(privateKeyPath));
if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Signing key must be Ed25519");
const unsigned = {
  schema: "dealflow.release-guard-v5-signature.v1",
  algorithm: "ed25519",
  authorityId: args["authority-id"],
  keyId: args["key-id"],
  manifestSha256: sha256(guardBytes),
  expiresAt: new Date(expiresAt).toISOString(),
};
const envelope = {
  ...unsigned,
  signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString("base64"),
};
fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
});
