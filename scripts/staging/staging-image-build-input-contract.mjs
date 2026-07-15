import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { posix, resolve, sep } from "node:path";

import ts from "typescript";

const IMAGE_EXTENSION = /\.(?:apng|avif|bmp|gif|heic|ico|icns|jpe?g|jp2|jxl|png|svg|tiff?|webp)(?:[?#].*)?$/i;
const APPLICATION_SOURCE = /^(?:src\/.*\.(?:[cm]?js|jsx|tsx?|css|less|pcss|sass|scss|styl)|(?:app|components|pages|styles)\/.*\.(?:[cm]?js|jsx|tsx?|css|less|pcss|sass|scss|styl)|next\.config\.[cm]?js)$/;
const STYLE_SOURCE = /\.(?:css|less|pcss|sass|scss|styl)$/i;
const FORBIDDEN_OPTIMIZER_RESOURCE_PATHS = Object.freeze([
  "/_next/image",
  "/_vercel/image",
  "/_next/static/media",
]);
const NEXT_IMAGE_MODULES = new Set([
  "next/image",
  "next/legacy/image",
  "next/future/image",
]);
const VENDORED_IMAGE_MODULES = new Set([
  "src/client/image-component",
  "src/shared/lib/get-img-props",
  "src/shared/lib/image-blur-svg",
  "src/shared/lib/image-config",
  "src/shared/lib/image-config-context.shared-runtime",
  "src/shared/lib/image-external",
  "src/shared/lib/image-loader",
  "src/shared/lib/match-local-pattern",
  "src/shared/lib/match-remote-pattern",
]);
const EXPECTED_VENDORED_IMAGE_DEPENDENCY_COUNTS = new Map([
  ["src/client/image-component.tsx\0../shared/lib/get-img-props", 2],
  ["src/client/image-component.tsx\0../shared/lib/image-config", 2],
  ["src/client/image-component.tsx\0../shared/lib/image-config-context.shared-runtime", 1],
  ["src/client/image-component.tsx\0next/dist/shared/lib/image-loader", 1],
  ["src/shared/lib/image-external.tsx\0./image-config", 1],
  ["src/shared/lib/image-external.tsx\0./get-img-props", 2],
  ["src/shared/lib/image-external.tsx\0../../client/image-component", 1],
  ["src/shared/lib/image-external.tsx\0next/dist/shared/lib/image-loader", 1],
  ["src/shared/lib/get-img-props.ts\0./image-blur-svg", 1],
  ["src/shared/lib/get-img-props.ts\0./image-config", 2],
  ["src/shared/lib/image-config-context.shared-runtime.ts\0./image-config", 2],
  ["src/shared/lib/image-loader.ts\0./image-config", 1],
  ["src/shared/lib/image-loader.ts\0./match-local-pattern", 2],
  ["src/shared/lib/image-loader.ts\0./match-remote-pattern", 2],
  ["src/shared/lib/match-local-pattern.ts\0./image-config", 1],
  ["src/shared/lib/match-remote-pattern.ts\0./image-config", 1],
]);

export const APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS = Object.freeze([
  Object.freeze({
    path: "public/favicon.ico",
    resourcePath: "/favicon.ico",
    contentType: "image/x-icon",
    bodyBytes: 1150,
    bodySha256: "86ec6b7627602d55faf7bf792d30d07479814ec6debb4879816f9520d89263bf",
  }),
  Object.freeze({
    path: "public/file.svg",
    resourcePath: "/file.svg",
    contentType: "image/svg+xml",
    bodyBytes: 391,
    bodySha256: "2b67812c325c199a02536cdbeea0c593a72f707d323b72ee3e08dbab06753bd4",
  }),
  Object.freeze({
    path: "public/globe.svg",
    resourcePath: "/globe.svg",
    contentType: "image/svg+xml",
    bodyBytes: 1035,
    bodySha256: "b614b9bf183925957661ac851498fe1d8029fd43a62fbfed86f9e2624a57e7cf",
  }),
  Object.freeze({
    path: "public/logo-icon.svg",
    resourcePath: "/logo-icon.svg",
    contentType: "image/svg+xml",
    bodyBytes: 1146,
    bodySha256: "ba4f77e1153124a9163a1a47a4a239b2acfc7e0e3b7585db16747a03a135c0ad",
  }),
  Object.freeze({
    path: "public/logo.svg",
    resourcePath: "/logo.svg",
    contentType: "image/svg+xml",
    bodyBytes: 3472,
    bodySha256: "3a3a19379014f26a3e6734c27b371b9e508b2e4fb41294321b8474a4a4ebf62f",
  }),
  Object.freeze({
    path: "public/next.svg",
    resourcePath: "/next.svg",
    contentType: "image/svg+xml",
    bodyBytes: 1375,
    bodySha256: "55995dfad6ecb4945a1e856ddca03c5e16aa5bf13fd21b4df6a74ae79357bcfc",
  }),
  Object.freeze({
    path: "public/vercel.svg",
    resourcePath: "/vercel.svg",
    contentType: "image/svg+xml",
    bodyBytes: 128,
    bodySha256: "f081337b2fee635b455b63275406a3e7f39d6a014e25ad90dab5a67e62a12ac4",
  }),
  Object.freeze({
    path: "public/window.svg",
    resourcePath: "/window.svg",
    contentType: "image/svg+xml",
    bodyBytes: 385,
    bodySha256: "644768c4aaeb4767bce293344eeb0c125fb804a94d801440424072202d85e3a1",
  }),
]);

export const EXACT_DYNAMIC_IMAGE_SOURCE_INVENTORY = Object.freeze([
  Object.freeze({
    path: "src/app/opengraph-image.tsx",
    routeClass: "PUBLIC_DYNAMIC_DIRECT_IMAGE",
    resourcePath: "/opengraph-image",
  }),
  Object.freeze({
    path: "src/app/staging-private-image-gate-proof-v2/[commit]/route.ts",
    routeClass: "RELEASE_BOUND_STAGING_PRIVATE_IMAGE",
    resourcePath: "/staging-private-image-gate-proof-v2/<commit>.png",
  }),
  Object.freeze({
    path: "src/app/api/provider-media/higgsfield-source/[assetId]/route.ts",
    routeClass: "SIGNED_PROVIDER_MEDIA_IMAGE",
    resourcePath: "/api/provider-media/higgsfield-source/<signed-asset-id>",
  }),
]);

const APPROVED_RESOURCE_PATHS = new Set(
  APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.map(({ resourcePath }) => resourcePath),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeAbsolute(root, path) {
  if (
    typeof path !== "string" ||
    path === "" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error("Staging image inventory received an unsafe deployable path");
  }
  const rootReal = realpathSync(root);
  const absolute = resolve(rootReal, path);
  if (!absolute.startsWith(`${rootReal}${sep}`)) {
    throw new Error("Staging image inventory path escaped the release root");
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Staging image build input is not a regular file: ${path}`);
  }
  return { absolute, stat };
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

function staticallyConcatenatedText(node) {
  const literal = literalText(node);
  if (literal !== null) return literal;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticallyConcatenatedText(node.left);
    const right = staticallyConcatenatedText(node.right);
    return left === null || right === null ? null : `${left}${right}`;
  }
  return null;
}

function containsForbiddenOptimizerResourcePath(value) {
  return (
    typeof value === "string" &&
    FORBIDDEN_OPTIMIZER_RESOURCE_PATHS.some((path) => value.includes(path))
  );
}

function isImageLiteral(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return IMAGE_EXTENSION.test(normalized) && !/^\.[a-z0-9]+$/i.test(normalized);
}

function isNextImageModule(value) {
  return (
    NEXT_IMAGE_MODULES.has(value) ||
    /^next\/(?:legacy\/|future\/)?image\.js$/.test(value)
  );
}

function removeModuleExtension(value) {
  return value.replace(/\.(?:[cm]?js|jsx|tsx?)$/i, "");
}

function classifyImageEmitterModuleReference(importerPath, value) {
  if (
    /^next\/dist\/(?:.*\/)?(?:image(?:[-/.].*)?|get-img-props(?:[-/.].*)?|match-(?:local|remote)-pattern(?:[-/.].*)?)$/i.test(
      value,
    )
  ) {
    return "NEXT_DIST_IMAGE_EMITTER";
  }
  const target = removeModuleExtension(posix.normalize(
    value.startsWith("@/")
      ? `src/${value.slice(2)}`
      : value.startsWith("src/")
        ? value
        : value.startsWith(".")
          ? posix.join(posix.dirname(importerPath), value)
          : "",
  ));
  return VENDORED_IMAGE_MODULES.has(target)
    ? "VENDORED_IMAGE_EMITTER"
    : null;
}

function isModuleSpecifier(node) {
  return (
    (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
    node.parent.moduleSpecifier === node
  );
}

function isRequireOrDynamicImportArgument(node) {
  const parent = node.parent;
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node) return false;
  return (
    parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(parent.expression) && parent.expression.text === "require")
  );
}

function isNewUrlAssetArgument(node) {
  const parent = node.parent;
  return (
    ts.isNewExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    parent.expression.text === "URL" &&
    parent.arguments?.[0] === node
  );
}

function isAllowedControlImageLiteral(path, value) {
  return (
    path === "src/proxy.ts" &&
    value === "/staging-image-optimizer-proof.png"
  );
}

function isExactNonResourceImageExample(path, node, value) {
  return (
    path === "src/app/(app)/onboarding/page.tsx" &&
    value === "https://example.com/logo.png" &&
    ts.isJsxAttribute(node.parent) &&
    node.parent.initializer === node &&
    node.parent.name.text === "placeholder"
  );
}

function isExactVendoredOptimizerDefaultDefinition(path, node, value) {
  return (
    path === "src/shared/lib/image-config.ts" &&
    value === "/_next/image" &&
    ts.isPropertyAssignment(node.parent) &&
    ((ts.isIdentifier(node.parent.name) && node.parent.name.text === "path") ||
      (ts.isStringLiteral(node.parent.name) && node.parent.name.text === "path")) &&
    node.parent.initializer === node
  );
}

function assertNextImageBindingUsage({ path, sourceFile, importDeclaration }) {
  const binding = importDeclaration.importClause?.name;
  if (!binding || importDeclaration.importClause?.namedBindings) {
    throw new Error(`${path} must use only a default Next Image import`);
  }
  const bindingName = binding.text;
  let jsxCount = 0;
  let bindingReferenceCount = 0;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === bindingName) {
      if (node === binding) {
        ts.forEachChild(node, visit);
        return;
      }
      bindingReferenceCount += 1;
      const parent = node.parent;
      if (
        !(
          (ts.isJsxSelfClosingElement(parent) || ts.isJsxOpeningElement(parent)) &&
          parent.tagName === node
        )
      ) {
        throw new Error(`${path} aliases or calls its Next Image binding`);
      }
      jsxCount += 1;
      const attributes = parent.attributes.properties;
      if (attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute))) {
        throw new Error(`${path} Next Image JSX uses spread attributes`);
      }
      const unoptimized = attributes.filter(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.text === "unoptimized",
      );
      if (unoptimized.length !== 1) {
        throw new Error(`${path} Next Image JSX must declare unoptimized exactly once`);
      }
      const initializer = unoptimized[0].initializer;
      if (
        initializer !== undefined &&
        !(
          ts.isJsxExpression(initializer) &&
          initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
        )
      ) {
        throw new Error(`${path} Next Image unoptimized must be bare or literal true`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (jsxCount === 0 || bindingReferenceCount !== jsxCount) {
    throw new Error(`${path} has an unused or unaccounted Next Image binding`);
  }
  return jsxCount;
}

export function assertStaticImageBuildSourceSafety({ path, source }) {
  assertStyleSourceSafety(path, source);
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : path.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  let nextImageModuleReferenceCount = 0;
  let nextImageJsxCount = 0;
  let optimizerControlReferenceCount = 0;
  let vendoredOptimizerDefinitionReferenceCount = 0;
  const vendoredImageDependencyReferences = [];
  const nextImageImports = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      )
    ) {
      const moduleSpecifier = node.arguments[0];
      if (!moduleSpecifier || literalText(moduleSpecifier) === null) {
        throw new Error(
          `${path} contains a nonliteral runtime import or require module specifier that can bypass image build controls`,
        );
      }
    }
    if (ts.isTemplateExpression(node)) {
      const templateSource = node.getText(sourceFile);
      if (containsForbiddenOptimizerResourcePath(templateSource)) {
        throw new Error(`${path} constructs a provider optimizer or static-media path`);
      }
      if (
        /\.(?:apng|avif|bmp|gif|heic|ico|icns|jpe?g|jp2|jxl|png|svg|tiff?|webp)(?:[?#][^`]*)?`$/i.test(
          templateSource,
        ) &&
        (isRequireOrDynamicImportArgument(node) || isNewUrlAssetArgument(node))
      ) {
        throw new Error(`${path} constructs a static image module or new URL asset`);
      }
    }
    if (ts.isBinaryExpression(node)) {
      const concatenated = staticallyConcatenatedText(node);
      if (containsForbiddenOptimizerResourcePath(concatenated)) {
        throw new Error(
          `${path} concatenates a provider optimizer or static-media path`,
        );
      }
    }
    const value = literalText(node);
    if (value !== null) {
      const imageEmitterClass = classifyImageEmitterModuleReference(path, value);
      if (imageEmitterClass) {
        const edge = `${path}\0${value}`;
        if (!EXPECTED_VENDORED_IMAGE_DEPENDENCY_COUNTS.has(edge)) {
          throw new Error(
            `${path} imports, requires, dynamically loads, or re-exports a forbidden ${imageEmitterClass.toLowerCase()}`,
          );
        }
        vendoredImageDependencyReferences.push(edge);
      }
      if (isNextImageModule(value)) {
        nextImageModuleReferenceCount += 1;
        if (
          value !== "next/image" ||
          !ts.isImportDeclaration(node.parent) ||
          node.parent.moduleSpecifier !== node ||
          !node.parent.importClause?.name ||
          node.parent.importClause.namedBindings
        ) {
          throw new Error(`${path} contains an alternate, named, dynamic, required, or re-exported Next Image module`);
        }
        nextImageImports.push(node.parent);
      }
      if (
        value.includes("/_next/image") ||
        value.includes("/_vercel/image")
      ) {
        if (isExactVendoredOptimizerDefaultDefinition(path, node, value)) {
          vendoredOptimizerDefinitionReferenceCount += 1;
        } else {
          optimizerControlReferenceCount += 1;
          throw new Error(`${path} constructs or aliases a provider image optimizer`);
        }
      }
      if (value.includes("/_next/static/media")) {
        throw new Error(`${path} references optimizer-eligible Next static media`);
      }
      if (isImageLiteral(value)) {
        if (
          isModuleSpecifier(node) ||
          isRequireOrDynamicImportArgument(node) ||
          isNewUrlAssetArgument(node)
        ) {
          throw new Error(`${path} contains a static image import, require, dynamic import, re-export, or new URL asset`);
        }
        if (
          !APPROVED_RESOURCE_PATHS.has(value) &&
          !isAllowedControlImageLiteral(path, value) &&
          !isExactNonResourceImageExample(path, node, value)
        ) {
          throw new Error(`${path} contains an unapproved application image literal`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const importDeclaration of nextImageImports) {
    nextImageJsxCount += assertNextImageBindingUsage({
      path,
      sourceFile,
      importDeclaration,
    });
  }
  return Object.freeze({
    path,
    nextImageModuleReferenceCount,
    nextImageJsxCount,
    optimizerControlReferenceCount,
    vendoredOptimizerDefinitionReferenceCount,
    vendoredImageDependencyReferences,
  });
}

function assertStyleSourceSafety(path, source) {
  const references = source.matchAll(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi);
  for (const match of references) {
    const value = match[2];
    if (
      isImageLiteral(value) ||
      containsForbiddenOptimizerResourcePath(value)
    ) {
      throw new Error(`${path} contains an optimizer-eligible CSS url() image reference`);
    }
  }
}

export function isPotentialDynamicImageSource({ path, source }) {
  if (!path.startsWith("src/app/")) return false;
  return (
    /from\s+["']next\/og["']/.test(source) ||
    /["']content-type["']\s*:\s*["']image\//i.test(source) ||
    /["']content-type["']\s*:\s*[^,\n}]*(?:contentType|\.contentType)/i.test(source) ||
    /\.set\(\s*["']content-type["']\s*,\s*(?:["']image\/|[^,)\n]*(?:contentType|\.contentType))/i.test(
      source,
    )
  );
}

function discoverDynamicImageSourcePaths(sourcePortfolio) {
  return sourcePortfolio
    .filter(isPotentialDynamicImageSource)
    .map(({ path }) => path)
    .sort();
}

export function assertExactStagingImageBuildInputInventory({
  root,
  deployablePaths,
}) {
  const rootReal = realpathSync(root);
  if (
    !Array.isArray(deployablePaths) ||
    deployablePaths.length === 0 ||
    deployablePaths.some((path, index) =>
      typeof path !== "string" ||
      (index > 0 && deployablePaths[index - 1] >= path)
    )
  ) {
    throw new Error("Staging image inventory requires the exact sorted deployable path set");
  }
  const deployableSet = new Set(deployablePaths);
  const approvedAssetPaths = APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS
    .map(({ path }) => path)
    .sort();
  const discoveredImageAssetPaths = deployablePaths
    .filter((path) => IMAGE_EXTENSION.test(path))
    .sort();
  if (JSON.stringify(discoveredImageAssetPaths) !== JSON.stringify(approvedAssetPaths)) {
    throw new Error("Deployable image assets are not the exact approved public direct-asset portfolio");
  }

  const assetDigest = createHash("sha256");
  for (const asset of APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS) {
    if (!deployableSet.has(asset.path)) {
      throw new Error(`Approved direct image asset is absent: ${asset.path}`);
    }
    const { absolute, stat } = safeAbsolute(rootReal, asset.path);
    const body = readFileSync(absolute);
    if (
      stat.size !== asset.bodyBytes ||
      body.length !== asset.bodyBytes ||
      sha256(body) !== asset.bodySha256
    ) {
      throw new Error(`Approved direct image asset identity changed: ${asset.path}`);
    }
    assetDigest.update(`${asset.path}\0${asset.bodyBytes}\0${asset.bodySha256}\0`);
  }

  const sourcePortfolio = deployablePaths
    .filter((path) => APPLICATION_SOURCE.test(path))
    .map((path) => {
      const { absolute } = safeAbsolute(rootReal, path);
      return { path, source: readFileSync(absolute, "utf8") };
    });
  const nextConfigSource = sourcePortfolio.find(
    ({ path }) => path === "next.config.mjs",
  )?.source;
  if (
    typeof nextConfigSource !== "string" ||
    (nextConfigSource.match(/localPatterns:\s*\[\s*\]/g) ?? []).length !== 1 ||
    (nextConfigSource.match(/remotePatterns:\s*\[\s*\]/g) ?? []).length !== 1
  ) {
    throw new Error(
      "Exact staging source config does not declare deny-all local and remote image patterns",
    );
  }
  let nextImageModuleReferenceCount = 0;
  let nextImageJsxCount = 0;
  let optimizerControlReferenceCount = 0;
  let vendoredOptimizerDefinitionReferenceCount = 0;
  const vendoredImageDependencyCounts = new Map();
  const nextImageImporterPaths = [];
  for (const entry of sourcePortfolio) {
    if (STYLE_SOURCE.test(entry.path)) {
      assertStyleSourceSafety(entry.path, entry.source);
      continue;
    }
    const result = assertStaticImageBuildSourceSafety(entry);
    nextImageModuleReferenceCount += result.nextImageModuleReferenceCount;
    nextImageJsxCount += result.nextImageJsxCount;
    optimizerControlReferenceCount += result.optimizerControlReferenceCount;
    vendoredOptimizerDefinitionReferenceCount +=
      result.vendoredOptimizerDefinitionReferenceCount;
    for (const edge of result.vendoredImageDependencyReferences) {
      vendoredImageDependencyCounts.set(
        edge,
        (vendoredImageDependencyCounts.get(edge) ?? 0) + 1,
      );
    }
    if (result.nextImageModuleReferenceCount > 0) {
      nextImageImporterPaths.push(result.path);
    }
  }
  const expectedImporters = [
    "src/components/campaign/static-ad-composed-preview.tsx",
    "src/components/funnel/funnel-preview.tsx",
    "src/components/funnels/canonical-funnel-renderer.tsx",
    "src/components/ui/logo.tsx",
  ];
  nextImageImporterPaths.sort();
  if (
    nextImageModuleReferenceCount !== 4 ||
    nextImageJsxCount !== 6 ||
    optimizerControlReferenceCount !== 0 ||
    vendoredOptimizerDefinitionReferenceCount !== 1 ||
    JSON.stringify(nextImageImporterPaths) !== JSON.stringify(expectedImporters)
  ) {
    throw new Error("Next Image source inventory is not exact");
  }
  if (
    vendoredImageDependencyCounts.size !==
      EXPECTED_VENDORED_IMAGE_DEPENDENCY_COUNTS.size ||
    [...EXPECTED_VENDORED_IMAGE_DEPENDENCY_COUNTS].some(
      ([edge, expectedCount]) =>
        vendoredImageDependencyCounts.get(edge) !== expectedCount,
    )
  ) {
    throw new Error("Vendored image-emitter dependency graph is not exact");
  }

  const discoveredDynamicImageSources = discoverDynamicImageSourcePaths(sourcePortfolio);
  const expectedDynamicImageSources = EXACT_DYNAMIC_IMAGE_SOURCE_INVENTORY
    .map(({ path }) => path)
    .sort();
  if (
    JSON.stringify(discoveredDynamicImageSources) !==
    JSON.stringify(expectedDynamicImageSources)
  ) {
    throw new Error("Dynamic image-producing route inventory is not exact");
  }

  return Object.freeze({
    schemaVersion: "dealflow.staging-image-build-input-inventory.v1",
    status: "PASS",
    deployablePathCount: deployablePaths.length,
    applicationBuildSourceCount: sourcePortfolio.length,
    approvedDirectPublicAssetCount: APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.length,
    approvedDirectPublicAssetPortfolioSha256: assetDigest.digest("hex"),
    deployableImageAssetCount: discoveredImageAssetPaths.length,
    optimizerEligibleStaticMediaAssetCount: 0,
    sourceNextConfigLocalPatternsDenyAll: true,
    sourceNextConfigRemotePatternsDenyAll: true,
    vercelNativeOptimizerConstructionReferenceCount: 0,
    staticImageImportRequireReexportNewUrlCount: 0,
    cssImageUrlReferenceCount: 0,
    alternateNextImageModuleReferenceCount: 0,
    nextImageModuleReferenceCount,
    nextImageJsxCount,
    nextImageBindingAliasOrCallCount: 0,
    optimizerControlReferenceCount,
    vendoredOptimizerDefinitionReferenceCount,
    vendoredImageEmitterDependencyReferenceCount:
      [...vendoredImageDependencyCounts.values()].reduce(
        (total, count) => total + count,
        0,
      ),
    externalVendoredOrNextDistImageEmitterReferenceCount: 0,
    dynamicImageSourceCount: discoveredDynamicImageSources.length,
    pathNamesPersistedToEvidence: false,
    sourceContentsPersistedToEvidence: false,
  });
}
