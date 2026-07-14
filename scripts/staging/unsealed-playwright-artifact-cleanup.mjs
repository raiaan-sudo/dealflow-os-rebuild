import { existsSync, rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export const UNSEALED_PLAYWRIGHT_FAILURE_POLICY =
  "DELETE_ALL_UNSEALED_PLAYWRIGHT_ARTIFACTS_ON_FAILURE";

export function deleteRegisteredUnsealedPlaywrightArtifactDirectories({
  evidenceDir,
  registeredDirectories,
}) {
  const exactRoot = resolve(evidenceDir);
  const registered = [...new Set(registeredDirectories.map((path) => resolve(path)))];
  const failures = [];
  let deletedDirectoryCount = 0;

  for (const exactPath of registered) {
    const relativePath = relative(exactRoot, exactPath);
    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      resolve(exactRoot, relativePath) !== exactPath
    ) {
      failures.push("refused_outside_evidence_path");
      continue;
    }

    try {
      if (existsSync(exactPath)) {
        rmSync(exactPath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 50,
        });
        deletedDirectoryCount += 1;
      }
      if (existsSync(exactPath)) {
        failures.push("artifact_directory_remained_after_delete");
      }
    } catch {
      failures.push("artifact_directory_delete_failed");
    }
  }

  const remainingDirectoryCount = registered.filter((path) => existsSync(path)).length;
  if (failures.length > 0 || remainingDirectoryCount > 0) {
    throw new Error(
      `Unsealed Playwright artifact deletion remained incomplete: ${[
        ...new Set(failures),
      ].join(",")}`,
    );
  }

  return {
    status: "PASS",
    policy: UNSEALED_PLAYWRIGHT_FAILURE_POLICY,
    registeredDirectoryCount: registered.length,
    deletedDirectoryCount,
    remainingDirectoryCount: 0,
    rawReporterArtifactsRetained: false,
  };
}
