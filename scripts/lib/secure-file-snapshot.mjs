import {
  constants,
  lstatSync,
  readFileSync,
} from "node:fs";

export function readSecureFileSnapshot(path, options = {}) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("secure_file_snapshot_no_follow_unavailable");
  }
  const contents = readFileSync(path, {
    encoding: options.encoding,
    flag: constants.O_RDONLY | constants.O_NOFOLLOW,
  });
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("secure_file_snapshot_not_regular");
  }
  const observedBytes =
    typeof contents === "string" ? Buffer.byteLength(contents) : contents.length;
  if (Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0 && observedBytes > options.maxBytes) {
    throw new Error("secure_file_snapshot_too_large");
  }
  const after = lstatSync(path);
  if (
    observedBytes !== stat.size ||
    after.dev !== stat.dev ||
    after.ino !== stat.ino ||
    after.size !== stat.size ||
    after.mtimeMs !== stat.mtimeMs ||
    after.ctimeMs !== stat.ctimeMs
  ) {
    throw new Error("secure_file_snapshot_changed_during_read");
  }
  return Object.freeze({ contents, stat });
}
