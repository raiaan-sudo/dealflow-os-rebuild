#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  assertExactCandidateDeployedImagePortfolioConfiguration,
  summarizeDeployedImageConfiguration,
} from "./vercel-deployed-image-config-contract.mjs";

const exactImages = Object.freeze({
  remotePatterns: [],
  domains: [],
  localPatterns: [{
    pathname:
      "^(?:\\/_next\\/static\\/media(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$",
    search: "",
  }],
  qualities: [75],
  sizes: [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  dangerouslyAllowSVG: false,
  minimumCacheTTL: 14_400,
  formats: ["image/webp"],
  contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
  contentDispositionType: "attachment",
  path: "/_next/image",
  loader: "default",
});

const proof = assertExactCandidateDeployedImagePortfolioConfiguration({
  images: exactImages,
  optimizerEligibleStaticMediaAssetCount: 0,
  sourceNextConfigLocalPatternsDenyAll: true,
  sourceNextConfigRemotePatternsDenyAll: true,
});
assert.equal(proof.status, "PASS");
assert.equal(
  proof.compiledConfigurationCompatibleWithEnumeratedPortfolioClosure,
  true,
);
assert.equal(proof.authoritativeHostedOutputInventoryProven, false);
assert.equal(proof.hostedCompiledStaticMediaNamespaceAllowed, true);
assert.equal(
  proof.manifestBoundSourcePortfolioHasZeroEligibleStaticMediaAssets,
  true,
);
assert.equal(proof.rawDeploymentMetadataPersisted, false);
assert.equal(proof.deploymentIdPersistedInThisProof, false);
assert.equal(proof.projectIdPersistedInThisProof, false);
assert.equal(proof.sanitizedShape.onlyCompiledStaticMediaLocalPattern, true);
assert.equal(proof.sanitizedShape.rawValuesPersisted, false);
assert.deepEqual(summarizeDeployedImageConfiguration(undefined), {
  rootType: "undefined",
  imageConfigurationPresent: false,
  rawValuesPersisted: false,
});

for (const [label, images, count = 0] of [
  ["absent config", undefined],
  ["remote pattern", { ...exactImages, remotePatterns: [{ hostname: "example.com" }] }],
  ["legacy domain", { ...exactImages, domains: ["example.com"] }],
  ["missing compiled local pattern", { ...exactImages, localPatterns: [] }],
  ["broad local pattern", { ...exactImages, localPatterns: [{ pathname: "/**", search: "" }] }],
  ["extra local pattern", { ...exactImages, localPatterns: [...exactImages.localPatterns, { pathname: "/logo.svg", search: "" }] }],
  ["eligible static media", exactImages, 1],
  ["wrong quality", { ...exactImages, qualities: [50, 75] }],
  ["missing probe width", { ...exactImages, sizes: [64, 128] }],
  ["duplicate width", { ...exactImages, sizes: [32, 32] }],
  ["SVG enabled", { ...exactImages, dangerouslyAllowSVG: true }],
  ["wrong cache TTL", { ...exactImages, minimumCacheTTL: 60 }],
  ["wrong format", { ...exactImages, formats: ["image/avif"] }],
  ["wrong CSP", { ...exactImages, contentSecurityPolicy: "default-src 'none'" }],
  ["inline disposition", { ...exactImages, contentDispositionType: "inline" }],
  ["unexpected path", { ...exactImages, path: "/custom/image" }],
  ["unexpected loader", { ...exactImages, loader: "custom" }],
  ["unrecognized authority key", { ...exactImages, futureImageAuthority: true }],
]) {
  assert.throws(
    () => assertExactCandidateDeployedImagePortfolioConfiguration({
      images,
      optimizerEligibleStaticMediaAssetCount: count,
      sourceNextConfigLocalPatternsDenyAll: true,
      sourceNextConfigRemotePatternsDenyAll: true,
    }),
    /Deployed|image|static-media|quality|width|SVG|optimizer/i,
    `${label} must fail closed`,
  );
}

for (const sourcePolicy of [
  {
    sourceNextConfigLocalPatternsDenyAll: false,
    sourceNextConfigRemotePatternsDenyAll: true,
  },
  {
    sourceNextConfigLocalPatternsDenyAll: true,
    sourceNextConfigRemotePatternsDenyAll: false,
  },
]) {
  assert.throws(
    () => assertExactCandidateDeployedImagePortfolioConfiguration({
      images: exactImages,
      optimizerEligibleStaticMediaAssetCount: 0,
      ...sourcePolicy,
    }),
    /manifest-bound source image pattern policy is not exact deny-all/,
  );
}

console.log(
  "Vercel deployed image config contract: PASS (configuration compatible with later enumerated-source closure, sole compiled static-media namespace, zero manifest-bound eligible assets, no unknown authority keys)",
);
