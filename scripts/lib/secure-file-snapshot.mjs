import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";

export function readSecureFileSnapshot(path, options = {}) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("secure_file_snapshot_no_follow_unavailable");
  }
  let descriptor = null;
  try {
    // codeql[js/insecure-temporary-file]
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new Error("secure_file_snapshot_not_regular");
    if (Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0 && stat.size > options.maxBytes) {
      throw new Error("secure_file_snapshot_too_large");
    }
    const contents = readFileSync(
      descriptor,
      options.encoding ? { encoding: options.encoding } : undefined,
    );
    const observedBytes =
      typeof contents === "string" ? Buffer.byteLength(contents) : contents.length;
    if (observedBytes !== stat.size) {
      throw new Error("secure_file_snapshot_changed_during_read");
    }
    return Object.freeze({ contents, stat });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}
