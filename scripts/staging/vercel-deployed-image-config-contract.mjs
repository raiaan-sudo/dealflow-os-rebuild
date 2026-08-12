const EXACT_COMPILED_STATIC_MEDIA_LOCAL_PATTERNS = Object.freeze([
  Object.freeze({
    pathname:
      "^(?:\\/_next\\/static\\/media(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$",
    search: "",
  }),
  Object.freeze({
    pathname:
      "^(?:\\/_next\\/static\\/immutable\\/media(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$",
    search: "",
  }),
]);
const EXACT_IMAGE_SIZES = Object.freeze([
  32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
]);
const EXACT_IMAGE_CONTENT_SECURITY_POLICY =
  "script-src 'none'; frame-src 'none'; sandbox;";
const RECOGNIZED_DEPLOYED_IMAGE_CONFIG_KEYS = Object.freeze([
  "remotePatterns",
  "domains",
  "localPatterns",
  "qualities",
  "sizes",
  "dangerouslyAllowSVG",
  "minimumCacheTTL",
  "formats",
  "contentSecurityPolicy",
  "contentDispositionType",
  "path",
  "loader",
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function summarizeDeployedImageConfiguration(images) {
  if (!isPlainObject(images)) {
    return Object.freeze({
      rootType: Array.isArray(images) ? "array" : typeof images,
      imageConfigurationPresent: false,
      rawValuesPersisted: false,
    });
  }
  const localPatterns = Array.isArray(images.localPatterns)
    ? images.localPatterns
    : [];
  const recognizedKeys = new Set(RECOGNIZED_DEPLOYED_IMAGE_CONFIG_KEYS);
  return Object.freeze({
    rootType: "plain_object",
    imageConfigurationPresent: true,
    keyCount: Object.keys(images).length,
    unrecognizedKeyCount: Object.keys(images).filter(
      (key) => !recognizedKeys.has(key),
    ).length,
    expectedKeyPresence: Object.freeze(Object.fromEntries(
      [...recognizedKeys].map((key) => [key, Object.hasOwn(images, key)]),
    )),
    remotePatternCount: Array.isArray(images.remotePatterns)
      ? images.remotePatterns.length
      : null,
    domainCount: Array.isArray(images.domains) ? images.domains.length : null,
    localPatternCount: Array.isArray(images.localPatterns)
      ? images.localPatterns.length
      : null,
    onlyCompiledStaticMediaLocalPatterns:
      JSON.stringify(localPatterns) ===
      JSON.stringify(EXACT_COMPILED_STATIC_MEDIA_LOCAL_PATTERNS),
    exactQualityPortfolio:
      JSON.stringify(images.qualities) === JSON.stringify([75]),
    exactSizePortfolio:
      JSON.stringify(images.sizes) === JSON.stringify(EXACT_IMAGE_SIZES),
    dangerouslyAllowSvgFalse: images.dangerouslyAllowSVG === false,
    minimumCacheTtlExact: images.minimumCacheTTL === 14_400,
    formatPortfolioExact:
      JSON.stringify(images.formats) === JSON.stringify(["image/webp"]),
    contentSecurityPolicyExact:
      images.contentSecurityPolicy === EXACT_IMAGE_CONTENT_SECURITY_POLICY,
    contentDispositionTypeExact:
      images.contentDispositionType === "attachment",
    configuredOptimizerPathExact:
      images.path === undefined || images.path === "/_next/image",
    configuredLoaderExact:
      images.loader === undefined || images.loader === "default",
    rawValuesPersisted: false,
  });
}

export function assertExactCandidateDeployedImagePortfolioConfiguration({
  images,
  optimizerEligibleStaticMediaAssetCount,
  sourceNextConfigLocalPatternsDenyAll,
  sourceNextConfigRemotePatternsDenyAll,
}) {
  if (!isPlainObject(images)) {
    throw new Error("Deployed Vercel image configuration is absent or malformed");
  }
  const remotePatterns = images.remotePatterns;
  const domains = images.domains ?? [];
  const localPatterns = images.localPatterns;
  const qualities = images.qualities;
  const sizes = images.sizes;
  const unrecognizedKeys = Object.keys(images).filter(
    (key) => !RECOGNIZED_DEPLOYED_IMAGE_CONFIG_KEYS.includes(key),
  );
  if (unrecognizedKeys.length !== 0) {
    throw new Error(
      "Deployed image configuration contains an unrecognized authority key",
    );
  }
  if (!Array.isArray(remotePatterns) || remotePatterns.length !== 0) {
    throw new Error("Deployed image configuration permits a remote source");
  }
  if (!Array.isArray(domains) || domains.length !== 0) {
    throw new Error("Deployed image configuration permits a domain source");
  }
  if (
    !Array.isArray(localPatterns) ||
    JSON.stringify(localPatterns) !==
      JSON.stringify(EXACT_COMPILED_STATIC_MEDIA_LOCAL_PATTERNS)
  ) {
    throw new Error(
      "Deployed image configuration is not limited to Vercel's compiled static-media path",
    );
  }
  if (optimizerEligibleStaticMediaAssetCount !== 0) {
    throw new Error("The exact candidate contains an optimizer-eligible static-media asset");
  }
  if (
    sourceNextConfigLocalPatternsDenyAll !== true ||
    sourceNextConfigRemotePatternsDenyAll !== true
  ) {
    throw new Error(
      "The manifest-bound source image pattern policy is not exact deny-all",
    );
  }
  if (JSON.stringify(qualities) !== JSON.stringify([75])) {
    throw new Error("Deployed image configuration quality authority is not exact");
  }
  if (
    !Array.isArray(sizes) ||
    JSON.stringify(sizes) !== JSON.stringify(EXACT_IMAGE_SIZES)
  ) {
    throw new Error("Deployed image configuration width authority is not exact");
  }
  if (images.dangerouslyAllowSVG !== false) {
    throw new Error("Deployed image configuration does not explicitly reject SVG optimization");
  }
  if (images.minimumCacheTTL !== 14_400) {
    throw new Error("Deployed image configuration cache authority is not exact");
  }
  if (JSON.stringify(images.formats) !== JSON.stringify(["image/webp"])) {
    throw new Error("Deployed image configuration format authority is not exact");
  }
  if (images.contentSecurityPolicy !== EXACT_IMAGE_CONTENT_SECURITY_POLICY) {
    throw new Error("Deployed image configuration CSP authority is not exact");
  }
  if (images.contentDispositionType !== "attachment") {
    throw new Error("Deployed image configuration disposition authority is not exact");
  }
  if (images.path !== undefined && images.path !== "/_next/image") {
    throw new Error("Deployed image configuration uses an unexpected optimizer path");
  }
  if (images.loader !== undefined && images.loader !== "default") {
    throw new Error("Deployed image configuration uses an unexpected optimizer loader");
  }

  return Object.freeze({
    schemaVersion: "dealflow.vercel-deployed-image-exact-candidate-portfolio.v1",
    status: "PASS",
    deployedImageConfigurationPresent: true,
    remotePatternCount: 0,
    domainCount: 0,
    localPatternCount: 2,
    onlyCompiledStaticMediaLocalPatterns: true,
    optimizerEligibleStaticMediaAssetCount: 0,
    exactQualityPortfolio: [75],
    exactSizePortfolio: [...EXACT_IMAGE_SIZES],
    width32ProbeAllowed: true,
    dangerouslyAllowSvg: false,
    minimumCacheTtlSeconds: 14_400,
    exactFormatPortfolio: ["image/webp"],
    contentSecurityPolicyExact: true,
    contentDispositionType: "attachment",
    configuredOptimizerPathExact:
      images.path === undefined || images.path === "/_next/image",
    configuredLoaderExact:
      images.loader === undefined || images.loader === "default",
    sourceNextConfigLocalPatternsDenyAll: true,
    sourceNextConfigRemotePatternsDenyAll: true,
    hostedCompiledStaticMediaNamespaceAllowed: true,
    manifestBoundSourcePortfolioHasZeroEligibleStaticMediaAssets: true,
    compiledConfigurationCompatibleWithEnumeratedPortfolioClosure: true,
    authoritativeHostedOutputInventoryProven: false,
    rawDeploymentMetadataPersisted: false,
    deploymentIdPersistedInThisProof: false,
    projectIdPersistedInThisProof: false,
    sanitizedShape: summarizeDeployedImageConfiguration(images),
  });
}
