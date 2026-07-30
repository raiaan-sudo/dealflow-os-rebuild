import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export function verifyPinnedPsql({
  psql,
  expectedSha256,
  expectedVersion,
}) {
  if (
    !psql ||
    !path.isAbsolute(psql) ||
    !/^[0-9a-f]{64}$/.test(expectedSha256 ?? "") ||
    expectedVersion !== "17.6"
  ) {
    throw new Error("migration_psql_authority_invalid");
  }
  const stat = fs.lstatSync(psql);
  const resolved = fs.realpathSync(psql);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    sha256(fs.readFileSync(resolved)) !== expectedSha256
  ) {
    throw new Error("migration_psql_binary_mismatch");
  }
  const version = spawnSync(resolved, ["--version"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  if (
    version.status !== 0 ||
    version.stdout.trim() !== "psql (PostgreSQL) 17.6"
  ) {
    throw new Error("migration_psql_version_mismatch");
  }
  return resolved;
}
