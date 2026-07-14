import { createHash } from "node:crypto";

const configuredBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? "1", 10);
const buildCpus = Number.isFinite(configuredBuildCpus) && configuredBuildCpus > 0 ? configuredBuildCpus : 1;
const ISOLATED_STAGING_HOST_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1";
const ISOLATED_STAGING_PROJECT_ID_SHA256 =
  "d0fa02eaf7e533f2a17a0b87c039c6a1686e5467840d2b8c2f2dca2758d95fde";
const DISABLED_STAGING_IMAGE_OPTIMIZER_PATH =
  "/_dealflow-staging-image-optimizer-disabled";

export function resolveIsolatedStagingImageConfig(environment = process.env) {
  const deploymentTarget =
    environment.DEALFLOW_DEPLOYMENT_TARGET?.trim().toLowerCase() ?? "";
  if (deploymentTarget !== "staging") return undefined;

  const vercelProjectId = environment.VERCEL_PROJECT_ID?.trim() ?? "";
  const expectedStagingProjectId =
    environment.DEALFLOW_STAGING_VERCEL_PROJECT_ID?.trim() ?? "";
  const exactStagingAuthority =
    environment.VERCEL_ENV?.trim().toLowerCase() === "production" &&
    /^prj_[A-Za-z0-9]+$/.test(vercelProjectId) &&
    vercelProjectId === expectedStagingProjectId &&
    createHash("sha256").update(vercelProjectId).digest("hex") ===
      ISOLATED_STAGING_PROJECT_ID_SHA256 &&
    environment.DEALFLOW_STAGING_HOST_ATTESTATION?.trim() ===
      ISOLATED_STAGING_HOST_ATTESTATION;

  if (!exactStagingAuthority) {
    throw new Error(
      "Refused to build a staging target without exact isolated-staging Vercel authority",
    );
  }

  return {
    // Next's optimizer performs a fresh internal source fetch without
    // forwarding the caller's staging credential. Every current Next Image is
    // explicitly unoptimized, and the source-inventory contract rejects future
    // exceptions. `unoptimized` plus the application proxy's exact optimizer
    // closure are the primary controls. The dedicated path and narrow declared
    // patterns are defense in depth only; production receives no override.
    unoptimized: true,
    path: DISABLED_STAGING_IMAGE_OPTIMIZER_PATH,
    remotePatterns: [],
    localPatterns: [
      {
        pathname: "/__dealflow-disabled-image-optimizer__/**",
        search: "",
      },
    ],
  };
}

const isolatedStagingImageConfig = resolveIsolatedStagingImageConfig();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cpus: buildCpus,
  },
  outputFileTracingIncludes: {
    "/api/internal/release-identity": [
      "./public/.well-known/dealflow-hosted-build-identity.json",
    ],
  },
  ...(isolatedStagingImageConfig
    ? { images: isolatedStagingImageConfig }
    : {}),
};

export default nextConfig;
