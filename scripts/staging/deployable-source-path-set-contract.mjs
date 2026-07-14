function assertSortedUniqueRelativePaths(paths, label) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error(`${label} must be a nonempty path array`);
  }
  let previous = "";
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").includes("..") ||
      path <= previous
    ) {
      throw new Error(`${label} must contain exact sorted unique relative paths`);
    }
    previous = path;
  }
}

export function assertExactDeployableSourcePathSet({
  manifestPaths,
  expectedTrackedPaths,
}) {
  assertSortedUniqueRelativePaths(manifestPaths, "Deployable manifest paths");
  assertSortedUniqueRelativePaths(expectedTrackedPaths, "Expected deployable Git paths");
  if (
    manifestPaths.length !== expectedTrackedPaths.length ||
    manifestPaths.some((path, index) => path !== expectedTrackedPaths[index])
  ) {
    const manifestSet = new Set(manifestPaths);
    const expectedSet = new Set(expectedTrackedPaths);
    const missing = expectedTrackedPaths.filter((path) => !manifestSet.has(path));
    const extra = manifestPaths.filter((path) => !expectedSet.has(path));
    throw new Error(
      `Deployable manifest path set is not exact (missing=${missing.length}, extra=${extra.length})`,
    );
  }
  return Object.freeze({
    status: "PASS",
    exactPathSet: true,
    pathCount: manifestPaths.length,
  });
}
