import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import {
  assertPinnedVercelCliUnchanged,
  captureVercelCliInstallationPin,
  disposePinnedVercelCli,
  resolvePinnedVercelCli,
} from "./vercel-cli-selection-contract.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeRegular(path, contents, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode });
}

function writeFixture(root, name, version = "56.2.0") {
  const installationRoot = join(root, name);
  const packageRoot = join(installationRoot, "node_modules", "vercel");
  const dist = join(packageRoot, "dist");
  const dependencyRoot = join(
    installationRoot,
    "node_modules",
    "fixture-dependency",
  );
  const cliPath = join(dist, "index.js");
  const cliContents = Buffer.from(
    'import "./chunks/runtime.js";\nimport "fixture-dependency";\n',
  );
  const chunkPath = join(dist, "chunks", "runtime.js");
  const dependencyPath = join(dependencyRoot, "index.js");
  mkdirSync(installationRoot, { recursive: true, mode: 0o700 });
  writeRegular(
    join(installationRoot, "package.json"),
    `${JSON.stringify({ private: true, dependencies: { vercel: version } })}\n`,
  );
  writeRegular(
    join(installationRoot, "package-lock.json"),
    `${JSON.stringify({ name: "fixture", lockfileVersion: 3 })}\n`,
  );
  writeRegular(cliPath, cliContents);
  writeRegular(chunkPath, "export const runtime = 'original';\n");
  writeRegular(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "vercel", version })}\n`,
  );
  writeRegular(dependencyPath, "export const dependency = 'original';\n");
  writeRegular(
    join(dependencyRoot, "package.json"),
    `${JSON.stringify({ name: "fixture-dependency", version: "1.0.0" })}\n`,
  );
  const binDirectory = join(installationRoot, "node_modules", ".bin");
  mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
  symlinkSync("../vercel/dist/index.js", join(binDirectory, "vercel"));
  return {
    installationRoot,
    packageRoot,
    cliPath,
    cliContents,
    chunkPath,
    dependencyPath,
  };
}

function capturePin(fixture, trustRoot) {
  return captureVercelCliInstallationPin({
    cliPath: fixture.cliPath,
    trustRoot,
  });
}

function resolveFixture(fixture, trustRoot, pin = capturePin(fixture, trustRoot)) {
  return resolvePinnedVercelCli({
    cliPath: fixture.cliPath,
    expectedSha256: pin.cliSha256,
    expectedInstallationSha256: pin.installationSha256,
    trustRoot,
  });
}

function assertInstallationMutationRejected(root, name, mutate) {
  const fixture = writeFixture(root, name);
  const pin = capturePin(fixture, root);
  mutate(fixture);
  assert.throws(
    () => resolveFixture(fixture, root, pin),
    /installation does not match VERCEL_CLI_INSTALLATION_SHA256|must not be group- or world-writable|symlink target must remain inside/,
  );
}

const root = realpathSync(
  mkdtempSync(join(tmpdir(), "dealflow-vercel-cli-selection-")),
);
try {
  const exitListenerCountBeforeSelection = process.listenerCount("exit");
  const pinned = writeFixture(root, "pinned", "56.2.0");
  const newerUnrelated = writeFixture(root, "newer-unrelated-cache", "99.0.0");
  const pin = capturePin(pinned, root);
  const selection = resolveFixture(pinned, root, pin);
  assert.equal(
    process.listenerCount("exit"),
    exitListenerCountBeforeSelection + 1,
  );
  assert.notEqual(selection.path, pinned.cliPath);
  assert.equal(selection.sourcePath, pinned.cliPath);
  assert.equal(selection.version, "56.2.0");
  assert.notEqual(selection.sourcePath, newerUnrelated.cliPath);
  assert.equal(selection.sha256, sha256(pinned.cliContents));
  assert.equal(selection.installationSha256, pin.installationSha256);
  assert.equal(assertPinnedVercelCliUnchanged(selection), selection);
  assert.equal(
    existsSync(
      join(
        selection.installationRoot,
        relative(pinned.installationRoot, pinned.chunkPath),
      ),
    ),
    true,
  );

  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: undefined,
        expectedSha256: pin.cliSha256,
        expectedInstallationSha256: pin.installationSha256,
        trustRoot: root,
      }),
    /VERCEL_CLI_JS is required/,
  );
  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: "relative/index.js",
        expectedSha256: pin.cliSha256,
        expectedInstallationSha256: pin.installationSha256,
        trustRoot: root,
      }),
    /absolute canonical path/,
  );
  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: pinned.cliPath,
        expectedSha256: pin.cliSha256,
        expectedInstallationSha256: undefined,
        trustRoot: root,
      }),
    /VERCEL_CLI_INSTALLATION_SHA256 must be an exact lowercase SHA-256/,
  );
  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: pinned.cliPath,
        expectedSha256: "A".repeat(64),
        expectedInstallationSha256: pin.installationSha256,
        trustRoot: root,
      }),
    /VERCEL_CLI_SHA256 must be an exact lowercase SHA-256/,
  );
  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: pinned.cliPath,
        expectedSha256: "0".repeat(64),
        expectedInstallationSha256: pin.installationSha256,
        trustRoot: root,
      }),
    /does not match VERCEL_CLI_SHA256/,
  );
  assert.throws(
    () =>
      resolvePinnedVercelCli({
        cliPath: pinned.cliPath,
        expectedSha256: pin.cliSha256,
        expectedInstallationSha256: "0".repeat(64),
        trustRoot: root,
      }),
    /does not match VERCEL_CLI_INSTALLATION_SHA256/,
  );

  const old = writeFixture(root, "old", "49.9.9");
  assert.throws(
    () => capturePin(old, root),
    /version 50 or newer/,
  );

  const wrongPackage = writeFixture(root, "wrong-package", "56.2.0");
  writeRegular(
    join(wrongPackage.packageRoot, "package.json"),
    `${JSON.stringify({ name: "not-vercel", version: "56.2.0" })}\n`,
  );
  assert.throws(() => capturePin(wrongPackage, root), /not the vercel package/);

  const malformed = writeFixture(root, "malformed", "56.2.0");
  writeRegular(join(malformed.packageRoot, "package.json"), "{");
  assert.throws(() => capturePin(malformed, root), /not valid JSON/);

  const linkedEntry = writeFixture(root, "linked-entry", "56.2.0");
  unlinkSync(linkedEntry.cliPath);
  symlinkSync("./chunks/runtime.js", linkedEntry.cliPath);
  assert.throws(
    () => capturePin(linkedEntry, root),
    /regular non-symlink file/,
  );

  const linkedAncestor = writeFixture(root, "linked-ancestor-source", "56.2.0");
  const linkedInstallation = join(root, "linked-ancestor");
  symlinkSync(linkedAncestor.installationRoot, linkedInstallation);
  const linkedAncestorCli = join(
    linkedInstallation,
    "node_modules",
    "vercel",
    "dist",
    "index.js",
  );
  assert.throws(
    () =>
      captureVercelCliInstallationPin({
        cliPath: linkedAncestorCli,
        trustRoot: root,
      }),
    /must be canonical|path must be canonical/,
  );

  const writablePackage = writeFixture(root, "writable-package", "56.2.0");
  chmodSync(join(writablePackage.packageRoot, "package.json"), 0o620);
  assert.throws(
    () => capturePin(writablePackage, root),
    /must not be group- or world-writable/,
  );

  const writableDirectory = writeFixture(root, "writable-directory", "56.2.0");
  chmodSync(dirname(writableDirectory.chunkPath), 0o720);
  assert.throws(
    () => capturePin(writableDirectory, root),
    /must not be group- or world-writable/,
  );

  assertInstallationMutationRejected(root, "mutated-chunk", (fixture) => {
    writeRegular(fixture.chunkPath, "export const runtime = 'changed';\n");
  });
  assertInstallationMutationRejected(root, "mutated-dependency", (fixture) => {
    writeRegular(
      fixture.dependencyPath,
      "export const dependency = 'changed';\n",
    );
  });
  assertInstallationMutationRejected(root, "mutated-package", (fixture) => {
    writeRegular(
      join(fixture.packageRoot, "package.json"),
      `${JSON.stringify({ name: "vercel", version: "56.2.0", changed: true })}\n`,
    );
  });
  assertInstallationMutationRejected(root, "added-file", (fixture) => {
    writeRegular(join(fixture.installationRoot, "unexpected.js"), "unexpected\n");
  });
  assertInstallationMutationRejected(root, "removed-file", (fixture) => {
    unlinkSync(fixture.dependencyPath);
  });
  assertInstallationMutationRejected(root, "mutated-symlink", (fixture) => {
    const link = join(fixture.installationRoot, "node_modules", ".bin", "vercel");
    unlinkSync(link);
    symlinkSync("../fixture-dependency/index.js", link);
  });
  assertInstallationMutationRejected(root, "mutated-mode", (fixture) => {
    chmodSync(fixture.chunkPath, 0o700);
  });

  const escapingSymlink = writeFixture(root, "escaping-symlink", "56.2.0");
  symlinkSync("../../../../outside", join(escapingSymlink.packageRoot, "escape"));
  assert.throws(
    () => capturePin(escapingSymlink, root),
    /must not be a broken symlink|must remain inside the installation root/,
  );

  const snapshotChunk = join(
    selection.installationRoot,
    relative(pinned.installationRoot, pinned.chunkPath),
  );
  chmodSync(snapshotChunk, 0o600);
  writeFileSync(snapshotChunk, "export const runtime = 'snapshot-tamper';\n");
  assert.throws(
    () => assertPinnedVercelCliUnchanged(selection),
    /must be non-writable inside the pinned snapshot|executable closure changed/,
  );
  const snapshotRoot = selection.installationRoot;
  const snapshotTrustRoot = selection.snapshotTrustRoot;
  disposePinnedVercelCli(selection);
  assert.equal(existsSync(snapshotRoot), false);
  assert.equal(existsSync(snapshotTrustRoot), false);
  assert.equal(process.listenerCount("exit"), exitListenerCountBeforeSelection);
  assert.throws(
    () => assertPinnedVercelCliUnchanged(selection),
    /managed pinned Vercel CLI selection is required/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "Vercel CLI complete executable-closure selection and immutable snapshot contract passed",
);
