import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyMigrationDatabaseTarget({
  connection,
  projectRecord,
  production,
  expectedProjectFingerprint,
}) {
  let url;
  try {
    url = new URL(connection);
  } catch {
    throw new Error("migration_database_url_invalid");
  }
  const host = url.hostname.toLowerCase();
  const username = decodeURIComponent(url.username).toLowerCase();
  const poolerMatch = username.match(/^postgres\.([a-z0-9]{20})$/);
  const directMatch = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  const projectRef = poolerMatch?.[1] ?? directMatch?.[1] ?? "";
  if (
    projectRecord.databaseHostSha256 !== sha256(host) ||
    projectRecord.databaseUsernameSha256 !== sha256(username) ||
    projectRecord.projectRefSha256 !== sha256(projectRef) ||
    !projectRef.endsWith(projectRecord.safeSuffix) ||
    (production && sha256(projectRef) !== expectedProjectFingerprint)
  ) {
    throw new Error("migration_database_target_mismatch");
  }
  return Object.freeze({
    databaseHostSha256: sha256(host),
    databaseUsernameSha256: sha256(username),
    projectRefSha256: sha256(projectRef),
    safeSuffix: projectRecord.safeSuffix,
  });
}
