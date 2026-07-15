import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const EVIDENCE_PREFIX = "dealflow-staging-acceptance-evidence-";

function assertOwnerOnlyRealDirectory(rawPath, label) {
  if (typeof rawPath !== "string" || !isAbsolute(rawPath)) {
    throw new Error(`${label} must be an absolute owner-only real directory`);
  }
  const path = resolve(rawPath);
  if (!existsSync(path)) {
    throw new Error(`${label} must be an absolute owner-only real directory`);
  }
  const stat = lstatSync(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0 ||
    realpathSync(path) !== path
  ) {
    throw new Error(`${label} must be an absolute owner-only real directory`);
  }
  return path;
}

export function assertApprovedStagingEvidenceRootPath(
  rawPath,
  { mustExist = false, approvedParent } = {},
) {
  const parent = assertOwnerOnlyRealDirectory(
    approvedParent,
    "Approved evidence parent",
  );
  if (typeof rawPath !== "string" || !isAbsolute(rawPath)) {
    throw new Error(
      "Evidence root must be a direct prefixed child of the approved evidence parent",
    );
  }
  const exactPath = resolve(rawPath);
  if (
    dirname(exactPath) !== parent ||
    !basename(exactPath).startsWith(EVIDENCE_PREFIX) ||
    basename(exactPath) === EVIDENCE_PREFIX
  ) {
    throw new Error(
      "Evidence root must be a direct prefixed child of the approved evidence parent",
    );
  }
  if (mustExist) {
    if (!existsSync(exactPath)) throw new Error("Evidence root does not exist");
    const stat = lstatSync(exactPath);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0 ||
      realpathSync(exactPath) !== exactPath
    ) {
      throw new Error("Evidence root must be a real owner-only non-symlink directory");
    }
  }
  return exactPath;
}
