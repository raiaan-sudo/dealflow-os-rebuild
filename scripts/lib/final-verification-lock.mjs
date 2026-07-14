import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_SCHEMA = "dealflow.final-verification-lock.v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function readOwner(lockPath, repositoryRootSha256) {
  const lockStat = lstatSync(lockPath);
  if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
    throw new Error("Final verification lock path is not a safe directory");
  }
  const entries = readdirSync(lockPath).sort();
  if (entries.length !== 1 || entries[0] !== "owner.json") {
    throw new Error("Final verification lock directory has an unsafe shape");
  }
  const ownerPath = join(lockPath, "owner.json");
  const ownerStat = lstatSync(ownerPath);
  if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) {
    throw new Error("Final verification lock owner is not a safe regular file");
  }
  let owner;
  try {
    owner = JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    throw new Error("Final verification lock owner is malformed");
  }
  if (
    owner?.schemaVersion !== LOCK_SCHEMA ||
    owner.repositoryRootSha256 !== repositoryRootSha256 ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    !/^[a-f0-9]{48}$/.test(owner.nonce ?? "") ||
    typeof owner.createdAt !== "string"
  ) {
    throw new Error("Final verification lock owner is malformed");
  }
  return { owner, ownerPath };
}

function removeExactLock(lockPath, ownerPath) {
  unlinkSync(ownerPath);
  rmdirSync(lockPath);
}

export function acquireFinalVerificationLock({
  repositoryRoot,
  lockRoot = tmpdir(),
  pid = process.pid,
  processAlive = defaultProcessAlive,
} = {}) {
  const exactRepositoryRoot = realpathSync(repositoryRoot);
  const exactLockRoot = realpathSync(lockRoot);
  const lockRootStat = lstatSync(exactLockRoot);
  if (!lockRootStat.isDirectory() || lockRootStat.isSymbolicLink()) {
    throw new Error("Final verification lock root is not a safe directory");
  }
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw new Error("Final verification lock requires a valid process id");
  }
  const repositoryRootSha256 = sha256(exactRepositoryRoot);
  const lockPath = join(
    exactLockRoot,
    `dealflow-final-verification-${repositoryRootSha256}.lock`,
  );

  function createLock() {
    let directoryCreated = false;
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      directoryCreated = true;
      const owner = {
        schemaVersion: LOCK_SCHEMA,
        repositoryRootSha256,
        pid,
        nonce: randomBytes(24).toString("hex"),
        createdAt: new Date().toISOString(),
      };
      writeFileSync(join(lockPath, "owner.json"), `${JSON.stringify(owner)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      return owner;
    } catch (error) {
      if (directoryCreated) {
        try {
          rmdirSync(lockPath);
        } catch {
          // Preserve any non-empty or replaced lock so a later run fails closed.
        }
      }
      throw error;
    }
  }

  let owner;
  try {
    owner = createLock();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = readOwner(lockPath, repositoryRootSha256);
    if (processAlive(existing.owner.pid)) {
      throw new Error(
        `Another exact final verification is already active for this worktree (pid ${existing.owner.pid})`,
      );
    }
    throw new Error(
      `A stale final verification lock requires explicit operator cleanup after confirming pid ${existing.owner.pid} and its child processes are absent`,
    );
  }

  let held = true;
  return Object.freeze({
    lockPath,
    owner: Object.freeze({ ...owner }),
    release({ strict = true } = {}) {
      if (!held) return true;
      try {
        const current = readOwner(lockPath, repositoryRootSha256);
        if (current.owner.pid !== owner.pid || current.owner.nonce !== owner.nonce) {
          throw new Error("Final verification lock ownership changed unexpectedly");
        }
        removeExactLock(lockPath, current.ownerPath);
        held = false;
        return true;
      } catch (error) {
        if (strict) throw error;
        return false;
      }
    },
  });
}
