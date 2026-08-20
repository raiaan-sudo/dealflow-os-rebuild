import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";

export function readSecureFileSnapshot(path, options = {}) {
  let descriptor = null;
  try {
    descriptor = openSync(path, "r");
    const stat = fstatSync(descriptor);
    const pathStat = lstatSync(path);
    if (
      !stat.isFile() ||
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.dev !== stat.dev ||
      pathStat.ino !== stat.ino
    ) throw new Error("secure_file_snapshot_not_regular");
    if (Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0 && stat.size > options.maxBytes) {
      throw new Error("secure_file_snapshot_too_large");
    }
    const contents = readFileSync(
      descriptor,
      options.encoding ? { encoding: options.encoding } : undefined,
    );
    const observedBytes =
      typeof contents === "string" ? Buffer.byteLength(contents) : contents.length;
    const after = fstatSync(descriptor);
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
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}
