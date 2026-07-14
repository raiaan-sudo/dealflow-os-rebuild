const configuredBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? "1", 10);
const buildCpus = Number.isFinite(configuredBuildCpus) && configuredBuildCpus > 0 ? configuredBuildCpus : 1;

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
};

export default nextConfig;
