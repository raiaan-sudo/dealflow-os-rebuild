import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const DISALLOWED_SOURCE_WRITE_BITS = 0o022;
const ALL_WRITE_BITS = 0o222;
const SNAPSHOT_PREFIX = "dealflow-vercel-cli-snapshot-";
const SNAPSHOT_PARENT_PREFIX = "dealflow-vercel-cli-snapshots-";
const INSTALLATION_DIGEST_SCHEMA = "dealflow.vercel-cli-installation.v1";
const managedSelections = new WeakSet();
const managedSelectionExitHandlers = new WeakMap();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function currentUid() {
  return typeof process.getuid === "function" ? BigInt(process.getuid()) : null;
}

function modeBits(stat) {
  return Number(stat.mode & 0o7777n);
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink
  );
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
}

function canonicalRelativePath(root, path) {
  const pathFromRoot = relative(root, path);
  if (!isWithin(root, path) || pathFromRoot === "") {
    throw new Error("The Vercel CLI installation member path is invalid");
  }
  return pathFromRoot.split(sep).join("/");
}

function assertOwned(stat, label) {
  const uid = currentUid();
  if (uid !== null && stat.uid !== uid) {
    throw new Error(`${label} must be owned by the current user`);
  }
}

function assertTrustedMode(stat, label, { snapshot }) {
  assertOwned(stat, label);
  const forbidden = snapshot ? ALL_WRITE_BITS : DISALLOWED_SOURCE_WRITE_BITS;
  if ((modeBits(stat) & forbidden) !== 0) {
    throw new Error(
      snapshot
        ? `${label} must be non-writable inside the pinned snapshot`
        : `${label} must not be group- or world-writable`,
    );
  }
}

function lstatBigInt(path, label) {
  try {
    return lstatSync(path, { bigint: true });
  } catch {
    throw new Error(`${label} does not exist`);
  }
}

function readExactOwnedRegularFile(path, label, { snapshot = false } = {}) {
  const before = lstatBigInt(path, label);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  if (realpathSync(path) !== path) {
    throw new Error(`${label} path must be canonical and contain no symlink components`);
  }
  assertTrustedMode(before, label, { snapshot });

  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameFileIdentity(before, opened)) {
      throw new Error(`${label} changed while it was opened`);
    }
    const contents = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(opened, after)) {
      throw new Error(`${label} changed while it was read`);
    }
    const finalPathState = lstatBigInt(path, label);
    if (!sameFileIdentity(after, finalPathState) || realpathSync(path) !== path) {
      throw new Error(`${label} changed after it was read`);
    }
    return Object.freeze({ contents, stat: after });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertTrustedAncestorChain(path, trustRoot) {
  const canonicalTrustRoot = realpathSync(trustRoot);
  const canonicalPath = realpathSync(path);
  if (canonicalTrustRoot !== trustRoot || canonicalPath !== path) {
    throw new Error("The Vercel CLI trust root and installation path must be canonical");
  }
  if (!isWithin(canonicalTrustRoot, canonicalPath)) {
    throw new Error("The Vercel CLI installation must be contained by its trust root");
  }
  const components = relative(canonicalTrustRoot, canonicalPath)
    .split(sep)
    .filter(Boolean);
  let current = canonicalTrustRoot;
  for (const component of ["", ...components]) {
    if (component) current = join(current, component);
    const stat = lstatBigInt(current, `Vercel CLI trusted directory ${current}`);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Every Vercel CLI trusted ancestor must be a non-symlink directory");
    }
    assertTrustedMode(stat, `Vercel CLI trusted directory ${current}`, {
      snapshot: false,
    });
  }
  return canonicalTrustRoot;
}

function assertSecureTemporaryParent(path) {
  const canonical = realpathSync(path);
  const stat = lstatBigInt(canonical, "Vercel CLI temporary snapshot parent");
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("The Vercel CLI temporary snapshot parent must be a directory");
  }
  const mode = modeBits(stat);
  if ((mode & 0o022) !== 0 && (mode & 0o1000) === 0) {
    throw new Error(
      "A writable Vercel CLI temporary snapshot parent must enforce the sticky bit",
    );
  }
  return canonical;
}

function normalizedSnapshotMode(stat) {
  return modeBits(stat) & 0o555;
}

function digestRecord(hash, record) {
  hash.update(`${JSON.stringify(record)}\n`);
}

function captureInstallationDigest(root, { snapshot }) {
  const hash = createHash("sha256");
  hash.update(`${INSTALLATION_DIGEST_SCHEMA}\n`);
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let byteCount = 0;

  function visit(path, relativePath) {
    const label = `Vercel CLI installation member ${relativePath}`;
    const before = lstatBigInt(path, label);
    if (before.isSymbolicLink()) {
      assertOwned(before, label);
    } else {
      assertTrustedMode(before, label, { snapshot });
    }
    if (before.isDirectory() && !before.isSymbolicLink()) {
      directoryCount += 1;
      digestRecord(hash, {
        path: relativePath,
        type: "directory",
        mode: normalizedSnapshotMode(before),
      });
      const names = readdirSync(path).sort();
      for (const name of names) {
        const child = join(path, name);
        visit(
          child,
          relativePath === "."
            ? canonicalRelativePath(root, child)
            : `${relativePath}/${name}`,
        );
      }
      const after = lstatBigInt(path, label);
      if (!sameFileIdentity(before, after)) {
        throw new Error(`${label} changed while its contents were captured`);
      }
      return;
    }
    if (before.isFile() && !before.isSymbolicLink()) {
      const { contents, stat } = readExactOwnedRegularFile(path, label, {
        snapshot,
      });
      fileCount += 1;
      byteCount += contents.length;
      digestRecord(hash, {
        path: relativePath,
        type: "file",
        mode: normalizedSnapshotMode(stat),
        size: contents.length,
        sha256: sha256(contents),
      });
      return;
    }
    if (before.isSymbolicLink()) {
      const target = readlinkSync(path);
      if (isAbsolute(target)) {
        throw new Error(`${label} must use a relative internal symlink target`);
      }
      const lexicalTarget = resolve(dirname(path), target);
      let resolvedTarget;
      try {
        resolvedTarget = realpathSync(path);
      } catch {
        throw new Error(`${label} must not be a broken symlink`);
      }
      if (!isWithin(root, lexicalTarget) || !isWithin(root, resolvedTarget)) {
        throw new Error(`${label} symlink target must remain inside the installation root`);
      }
      const after = lstatBigInt(path, label);
      if (!sameFileIdentity(before, after) || readlinkSync(path) !== target) {
        throw new Error(`${label} changed while its symlink target was captured`);
      }
      symlinkCount += 1;
      digestRecord(hash, {
        path: relativePath,
        type: "symlink",
        target,
      });
      return;
    }
    throw new Error(`${label} has an unsupported filesystem type`);
  }

  visit(root, ".");
  return Object.freeze({
    schemaVersion: INSTALLATION_DIGEST_SCHEMA,
    sha256: hash.digest("hex"),
    fileCount,
    directoryCount,
    symlinkCount,
    byteCount,
  });
}

function deriveInstallationPaths(cliPath) {
  if (basename(cliPath) !== "index.js" || basename(dirname(cliPath)) !== "dist") {
    throw new Error("VERCEL_CLI_JS must be the exact vercel/dist/index.js entry point");
  }
  const packageRoot = dirname(dirname(cliPath));
  const nodeModulesRoot = dirname(packageRoot);
  if (basename(packageRoot) !== "vercel" || basename(nodeModulesRoot) !== "node_modules") {
    throw new Error("VERCEL_CLI_JS must belong to an exact node_modules/vercel package");
  }
  const installationRoot = dirname(nodeModulesRoot);
  return Object.freeze({
    cliPath,
    packageRoot,
    packagePath: join(packageRoot, "package.json"),
    installationRoot,
    installationPackagePath: join(installationRoot, "package.json"),
    installationLockPath: join(installationRoot, "package-lock.json"),
  });
}

function readValidatedPackageMetadata(packagePath, minimumMajor, { snapshot }) {
  const { contents } = readExactOwnedRegularFile(
    packagePath,
    "Pinned Vercel CLI package metadata",
    { snapshot },
  );
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error("Pinned Vercel CLI package metadata is not valid JSON");
  }
  if (packageMetadata?.name !== "vercel" || typeof packageMetadata.version !== "string") {
    throw new Error("Pinned Vercel CLI package metadata is not the vercel package");
  }
  const versionMatch = VERSION_PATTERN.exec(packageMetadata.version);
  if (!versionMatch || Number.parseInt(versionMatch[1], 10) < minimumMajor) {
    throw new Error(`Pinned Vercel CLI version ${minimumMajor} or newer is required`);
  }
  return Object.freeze({
    version: packageMetadata.version,
    sha256: sha256(contents),
  });
}

function captureSourceIdentity(cliPath, trustRoot, minimumMajor) {
  const paths = deriveInstallationPaths(cliPath);
  assertTrustedAncestorChain(paths.installationRoot, trustRoot);
  readExactOwnedRegularFile(
    paths.installationPackagePath,
    "Vercel CLI installation package metadata",
  );
  readExactOwnedRegularFile(
    paths.installationLockPath,
    "Vercel CLI installation lockfile",
  );
  const cli = readExactOwnedRegularFile(cliPath, "Pinned Vercel CLI");
  const packageIdentity = readValidatedPackageMetadata(
    paths.packagePath,
    minimumMajor,
    { snapshot: false },
  );
  const installation = captureInstallationDigest(paths.installationRoot, {
    snapshot: false,
  });
  return Object.freeze({
    ...paths,
    trustRoot,
    version: packageIdentity.version,
    packageSha256: packageIdentity.sha256,
    sha256: sha256(cli.contents),
    installation,
  });
}

function copyInstallationTree(sourceRoot, snapshotRoot) {
  function copyMember(source, destination, isRoot = false) {
    const stat = lstatBigInt(source, `Vercel CLI source snapshot member ${source}`);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      if (!isRoot) mkdirSync(destination, { mode: 0o700 });
      for (const name of readdirSync(source).sort()) {
        copyMember(join(source, name), join(destination, name));
      }
      chmodSync(destination, normalizedSnapshotMode(stat));
      return;
    }
    if (stat.isFile() && !stat.isSymbolicLink()) {
      copyFileSync(source, destination, constants.COPYFILE_EXCL);
      chmodSync(destination, normalizedSnapshotMode(stat));
      return;
    }
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), destination);
      return;
    }
    throw new Error("The Vercel CLI source contains an unsupported filesystem type");
  }
  copyMember(sourceRoot, snapshotRoot, true);
}

function makeSnapshotRemovable(root) {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(root, 0o700);
  for (const name of readdirSync(root)) {
    const child = join(root, name);
    const childStat = lstatSync(child);
    if (childStat.isDirectory() && !childStat.isSymbolicLink()) {
      makeSnapshotRemovable(child);
    }
  }
}

function removeSnapshotRoot(root) {
  try {
    makeSnapshotRemovable(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function removeSnapshotPair(snapshotRoot, snapshotTrustRoot) {
  const failures = [];
  if (snapshotRoot) {
    try {
      removeSnapshotRoot(snapshotRoot);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    removeSnapshotRoot(snapshotTrustRoot);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "The Vercel CLI private snapshot could not be removed");
  }
}

function validateExpectedDigest(value, label) {
  if (!SHA256_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be an exact lowercase SHA-256 digest`);
  }
}

export function captureVercelCliInstallationPin({
  cliPath,
  trustRoot = realpathSync(homedir()),
  minimumMajor = 50,
} = {}) {
  if (!cliPath || !isAbsolute(cliPath) || resolve(cliPath) !== cliPath) {
    throw new Error("VERCEL_CLI_JS must be an absolute canonical path");
  }
  if (!Number.isInteger(minimumMajor) || minimumMajor < 1) {
    throw new Error("The minimum Vercel CLI major must be a positive integer");
  }
  const identity = captureSourceIdentity(cliPath, trustRoot, minimumMajor);
  return Object.freeze({
    cliPath,
    version: identity.version,
    cliSha256: identity.sha256,
    packageSha256: identity.packageSha256,
    installationSha256: identity.installation.sha256,
    installationFileCount: identity.installation.fileCount,
    installationDirectoryCount: identity.installation.directoryCount,
    installationSymlinkCount: identity.installation.symlinkCount,
    installationByteCount: identity.installation.byteCount,
  });
}

export function resolvePinnedVercelCli({
  cliPath = process.env.VERCEL_CLI_JS?.trim(),
  expectedSha256 = process.env.VERCEL_CLI_SHA256?.trim(),
  expectedInstallationSha256 =
    process.env.VERCEL_CLI_INSTALLATION_SHA256?.trim(),
  trustRoot = realpathSync(homedir()),
  minimumMajor = 50,
} = {}) {
  if (!cliPath) {
    throw new Error("VERCEL_CLI_JS is required; implicit CLI discovery is forbidden");
  }
  if (!isAbsolute(cliPath) || resolve(cliPath) !== cliPath) {
    throw new Error("VERCEL_CLI_JS must be an absolute canonical path");
  }
  validateExpectedDigest(expectedSha256, "VERCEL_CLI_SHA256");
  validateExpectedDigest(
    expectedInstallationSha256,
    "VERCEL_CLI_INSTALLATION_SHA256",
  );
  if (!Number.isInteger(minimumMajor) || minimumMajor < 1) {
    throw new Error("The minimum Vercel CLI major must be a positive integer");
  }

  const sourceBefore = captureSourceIdentity(cliPath, trustRoot, minimumMajor);
  if (sourceBefore.sha256 !== expectedSha256) {
    throw new Error("Pinned Vercel CLI SHA-256 does not match VERCEL_CLI_SHA256");
  }
  if (sourceBefore.installation.sha256 !== expectedInstallationSha256) {
    throw new Error(
      "Pinned Vercel CLI installation does not match VERCEL_CLI_INSTALLATION_SHA256",
    );
  }

  const secureTemporaryParent = assertSecureTemporaryParent(tmpdir());
  const snapshotTrustRoot = realpathSync(
    mkdtempSync(join(secureTemporaryParent, SNAPSHOT_PARENT_PREFIX)),
  );
  let snapshotRoot;
  try {
    snapshotRoot = realpathSync(
      mkdtempSync(
        join(
          snapshotTrustRoot,
          `${SNAPSHOT_PREFIX}${expectedInstallationSha256}-`,
        ),
      ),
    );
    assertTrustedAncestorChain(snapshotRoot, snapshotTrustRoot);
    copyInstallationTree(sourceBefore.installationRoot, snapshotRoot);
    const sourceAfter = captureSourceIdentity(cliPath, trustRoot, minimumMajor);
    if (
      sourceAfter.sha256 !== sourceBefore.sha256 ||
      sourceAfter.packageSha256 !== sourceBefore.packageSha256 ||
      sourceAfter.installation.sha256 !== sourceBefore.installation.sha256
    ) {
      throw new Error("The Vercel CLI installation changed while its snapshot was created");
    }

    const snapshotCliPath = join(
      snapshotRoot,
      relative(sourceBefore.installationRoot, cliPath),
    );
    const snapshotPaths = deriveInstallationPaths(snapshotCliPath);
    const snapshotCli = readExactOwnedRegularFile(
      snapshotCliPath,
      "Pinned Vercel CLI snapshot entry",
      { snapshot: true },
    );
    const snapshotPackage = readValidatedPackageMetadata(
      snapshotPaths.packagePath,
      minimumMajor,
      { snapshot: true },
    );
    const snapshotInstallation = captureInstallationDigest(snapshotRoot, {
      snapshot: true,
    });
    if (
      sha256(snapshotCli.contents) !== expectedSha256 ||
      snapshotPackage.sha256 !== sourceBefore.packageSha256 ||
      snapshotPackage.version !== sourceBefore.version ||
      snapshotInstallation.sha256 !== expectedInstallationSha256
    ) {
      throw new Error("The non-writable Vercel CLI snapshot does not match its pinned source");
    }

    const selection = Object.freeze({
      path: snapshotCliPath,
      sourcePath: cliPath,
      packagePath: snapshotPaths.packagePath,
      sourcePackagePath: sourceBefore.packagePath,
      installationRoot: snapshotRoot,
      sourceInstallationRoot: sourceBefore.installationRoot,
      snapshotTrustRoot,
      version: sourceBefore.version,
      packageSha256: sourceBefore.packageSha256,
      sha256: expectedSha256,
      installationSha256: expectedInstallationSha256,
      installationFileCount: snapshotInstallation.fileCount,
      installationDirectoryCount: snapshotInstallation.directoryCount,
      installationSymlinkCount: snapshotInstallation.symlinkCount,
      installationByteCount: snapshotInstallation.byteCount,
      minimumMajor,
    });
    managedSelections.add(selection);
    const exitHandler = () => {
      try {
        removeSnapshotPair(
          selection.installationRoot,
          selection.snapshotTrustRoot,
        );
      } catch {
        // Process exit remains authoritative; normal control flow reports cleanup failures.
      } finally {
        managedSelections.delete(selection);
        managedSelectionExitHandlers.delete(selection);
      }
    };
    managedSelectionExitHandlers.set(selection, exitHandler);
    process.once("exit", exitHandler);
    return selection;
  } catch (error) {
    try {
      removeSnapshotPair(snapshotRoot, snapshotTrustRoot);
    } catch (cleanupError) {
      process.once("exit", () => {
        try {
          removeSnapshotPair(snapshotRoot, snapshotTrustRoot);
        } catch {
          // SIGKILL and filesystem denial are outside process-level cleanup authority.
        }
      });
      throw new AggregateError(
        [error, cleanupError],
        "Pinned Vercel CLI snapshot creation and cleanup both failed",
      );
    }
    throw error;
  }
}

export function assertPinnedVercelCliUnchanged(selection) {
  if (
    !selection ||
    typeof selection !== "object" ||
    !managedSelections.has(selection)
  ) {
    throw new Error("A managed pinned Vercel CLI selection is required");
  }
  if (
    dirname(selection.snapshotTrustRoot) !== assertSecureTemporaryParent(tmpdir()) ||
    !basename(selection.snapshotTrustRoot).startsWith(SNAPSHOT_PARENT_PREFIX) ||
    realpathSync(selection.snapshotTrustRoot) !== selection.snapshotTrustRoot ||
    dirname(selection.installationRoot) !== selection.snapshotTrustRoot ||
    !basename(selection.installationRoot).startsWith(
      `${SNAPSHOT_PREFIX}${selection.installationSha256}-`,
    ) ||
    realpathSync(selection.installationRoot) !== selection.installationRoot ||
    !isWithin(selection.installationRoot, selection.path)
  ) {
    throw new Error("The pinned Vercel CLI snapshot root is invalid");
  }
  assertTrustedAncestorChain(
    selection.installationRoot,
    selection.snapshotTrustRoot,
  );
  const paths = deriveInstallationPaths(selection.path);
  if (
    paths.installationRoot !== selection.installationRoot ||
    paths.packagePath !== selection.packagePath
  ) {
    throw new Error("The pinned Vercel CLI snapshot paths changed after preflight");
  }
  const cli = readExactOwnedRegularFile(
    selection.path,
    "Pinned Vercel CLI snapshot entry",
    { snapshot: true },
  );
  const packageIdentity = readValidatedPackageMetadata(
    selection.packagePath,
    selection.minimumMajor,
    { snapshot: true },
  );
  const installation = captureInstallationDigest(selection.installationRoot, {
    snapshot: true,
  });
  if (
    sha256(cli.contents) !== selection.sha256 ||
    packageIdentity.version !== selection.version ||
    packageIdentity.sha256 !== selection.packageSha256 ||
    installation.sha256 !== selection.installationSha256 ||
    installation.fileCount !== selection.installationFileCount ||
    installation.directoryCount !== selection.installationDirectoryCount ||
    installation.symlinkCount !== selection.installationSymlinkCount ||
    installation.byteCount !== selection.installationByteCount
  ) {
    throw new Error("Pinned Vercel CLI executable closure changed after preflight");
  }
  return selection;
}

export function disposePinnedVercelCli(selection) {
  if (!selection || !managedSelections.has(selection)) {
    throw new Error("A managed pinned Vercel CLI selection is required for disposal");
  }
  const exitHandler = managedSelectionExitHandlers.get(selection);
  removeSnapshotPair(selection.installationRoot, selection.snapshotTrustRoot);
  if (exitHandler) process.removeListener("exit", exitHandler);
  managedSelections.delete(selection);
  managedSelectionExitHandlers.delete(selection);
}
