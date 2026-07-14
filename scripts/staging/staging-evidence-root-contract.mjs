import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const EXACT_TEMP_ROOT = "/private/tmp";
const EVIDENCE_PREFIX = "dealflow-staging-acceptance-evidence-";

export function assertApprovedStagingEvidenceRootPath(
  rawPath,
  { mustExist = false } = {},
) {
  const exactPath = resolve(rawPath ?? "");
  const parent = dirname(exactPath);
  if (
    parent !== EXACT_TEMP_ROOT ||
    realpathSync(parent) !== EXACT_TEMP_ROOT ||
    !basename(exactPath).startsWith(EVIDENCE_PREFIX) ||
    basename(exactPath) === EVIDENCE_PREFIX
  ) {
    throw new Error("Evidence root must be a direct child of the real private temp root");
  }
  if (mustExist) {
    if (!existsSync(exactPath)) throw new Error("Evidence root does not exist");
    const stat = lstatSync(exactPath);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(exactPath) !== exactPath) {
      throw new Error("Evidence root must be a real non-symlink directory");
    }
  }
  return exactPath;
}
