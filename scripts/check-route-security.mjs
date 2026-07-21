#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const middlewarePath = "src/proxy.ts";
const apiRoot = "src/app/api";
const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const routeMethodSet = new Set(routeMethods);
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const expectedPublicApiRoutes = new Map([
  ["/api/meta/data-deletion", new Set(["GET", "POST"])],
  ["/api/meta/leadgen/webhook", new Set(["GET", "POST"])],
  ["/api/integrations/meta/callback", new Set(["GET"])],
  ["/api/lead-capture", new Set(["POST"])],
  ["/api/lead-tracking/browser-pixel", new Set(["POST"])],
  ["/api/sms/twilio", new Set(["POST"])],
  ["/api/stripe/webhook", new Set(["POST"])],
  ["/api/webhooks/twilio/status", new Set(["POST"])],
  ["/api/client-errors", new Set(["POST"])],
  ["/api/access-keys/checkout", new Set(["POST"])],
  ["/api/access-keys/preclaim", new Set(["POST"])],
  ["/api/access-keys/reveal-ack", new Set(["POST"])],
  ["/api/integrations/ghl/embed-context", new Set(["GET", "POST"])],
  ["/api/integrations/ghl/webhook", new Set(["POST"])],
  ["/api/support/delivery-callback", new Set(["POST"])],
]);

const expectedPublicApiMethodGuards = new Map([
  ["/api/integrations/ghl/embed-context", new Map([
    ["GET", ["verifyGhlEmbedCapability"]],
    ["POST", ["isExactVerifiedPartnerRequestOrigin", "decryptGhlSignedUserContext"]],
  ])],
  ["/api/integrations/ghl/webhook", new Map([
    ["POST", ["resolveGhlLifecycleEnvironment", "verifyGhlWebhookSignatures"]],
  ])],
  ["/api/support/delivery-callback", new Map([
    ["POST", ["parseTextBody", "verifyAndParseSupportLifecycleCallback"]],
  ])],
]);

const expectedPrivateGetApiRoutes = new Map([
  ["/api/integrations/ghl/marketplace/connect", {
    methods: new Set(["GET"]),
    requiredCalls: ["getAuthenticatedContext", "createGhlMarketplaceConnectBinding"],
    requiredIdentifiers: ["GHL_MARKETPLACE_STATE_COOKIE"],
  }],
  ["/api/integrations/ghl/marketplace/callback", {
    methods: new Set(["GET"]),
    requiredCalls: ["getAuthenticatedContext", "completeGhlMarketplaceOAuthCallback"],
    requiredIdentifiers: ["GHL_MARKETPLACE_STATE_COOKIE"],
  }],
  ["/api/integrations/crm/marketplace/callback", {
    methods: new Set(["GET"]),
    requiredCalls: ["getAuthenticatedContext", "completeGhlMarketplaceOAuthCallback"],
    requiredIdentifiers: ["GHL_MARKETPLACE_STATE_COOKIE"],
  }],
]);

const expectedInternalApiRoutes = new Map([
  ["/api/internal/release-identity", {
    methods: new Set(["GET"]),
    requiredCalls: [
      "assertInternalSystemRequest",
      "assertHostedReleaseIdentityAuthority",
      "readExactBuildReleaseIdentity",
    ],
    requiredEnv: [],
  }],
  ["/api/internal/qa-auth-session", {
    methods: new Set(["POST"]),
    requiredCalls: ["assertInternalSystemRequest"],
    requiredEnv: ["QA_AUTH_HARNESS_ENABLED"],
  }],
  ["/api/internal/stripe-test-proof", {
    methods: new Set(["POST"]),
    requiredCalls: ["assertInternalSystemRequest"],
    requiredEnv: ["STRIPE_TEST_HARNESS_ENABLED"],
  }],
  ["/api/internal/system-jobs", {
    methods: new Set(["GET", "POST"]),
    requiredCalls: ["assertInternalSystemRequest", "runSystemJobWorkerBatch"],
    requiredEnv: [],
  }],
  ["/api/internal/ghl-form-sweep", {
    methods: new Set(["GET", "POST"]),
    requiredCalls: ["assertInternalSystemRequest", "processGhlPeriodicFormSweepFromEnvironment"],
    requiredEnv: [],
  }],
]);

const ownershipCalls = new Set([
  "getAuthenticatedContext",
  "getCampaignById",
  "updateCampaignPublishState",
  "deleteCreativeAssetById",
  "getCreativeAssetById",
  "listCampaignCreativeAssets",
  "uploadManualCreativeAsset",
  "assertMetaLaunchBillingAccess",
  "assertInternalOperatorAccess",
  "getSystemJob",
  "getSystemJobLogs",
]);
const ownershipPropertyPaths = new Set(["auth.userId", "auth.organizationId"]);
const ownershipFilterFields = new Set(["organization_id", "user_id"]);

let failures = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  failures += 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function routePathFromFile(filePath) {
  const relative = path.relative(path.join(root, apiRoot), filePath);
  const withoutRoute = relative.replace(/\/route\.ts$/, "");
  return `/api/${withoutRoute.replace(/\/index$/, "").replaceAll(path.sep, "/")}`;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function propertyPath(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = propertyPath(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    const parent = propertyPath(expression.expression);
    return parent ? `${parent}.${expression.argumentExpression.text}` : expression.argumentExpression.text;
  }
  return null;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return null;
}

function emptyFacts() {
  return {
    calls: new Set(),
    env: new Set(),
    identifiers: new Set(),
    propertyPaths: new Set(),
    filterFields: new Set(),
  };
}

export function analyzeRouteSource(text, fileName = "route.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const localDeclarations = new Map();
  const exportedHandlers = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      localDeclarations.set(statement.name.text, statement);
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword) && routeMethodSet.has(statement.name.text)) {
        exportedHandlers.set(statement.name.text, statement);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }
        localDeclarations.set(declaration.name.text, declaration.initializer);
        if (isExported && routeMethodSet.has(declaration.name.text)) {
          exportedHandlers.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exportedName = element.name.text;
        if (!routeMethodSet.has(exportedName)) {
          continue;
        }
        const localName = element.propertyName?.text ?? exportedName;
        exportedHandlers.set(exportedName, localDeclarations.get(localName) ?? null);
      }
    }
  }

  function factsForNode(startNode) {
    const facts = emptyFacts();
    const visitedLocalFunctions = new Set();

    function visit(node) {
      if (ts.isIdentifier(node)) {
        facts.identifiers.add(node.text);
      }

      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const fullPath = propertyPath(node);
        if (fullPath) {
          facts.propertyPaths.add(fullPath);
          const envMatch = fullPath.match(/^process\.env\.([A-Z0-9_]+)$/);
          if (envMatch) {
            facts.env.add(envMatch[1]);
          }
        }
      }

      if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        if (name) {
          facts.calls.add(name);
          if (
            ["eq", "match", "filter"].includes(name) &&
            node.arguments[0] &&
            ts.isStringLiteralLike(node.arguments[0])
          ) {
            facts.filterFields.add(node.arguments[0].text);
          }

          const localFunction = localDeclarations.get(name);
          if (localFunction && !visitedLocalFunctions.has(name)) {
            visitedLocalFunctions.add(name);
            visit(localFunction);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    if (startNode) {
      visit(startNode);
    }
    return facts;
  }

  const handlerFacts = new Map();
  for (const [method, node] of exportedHandlers) {
    handlerFacts.set(method, factsForNode(node));
  }

  return {
    methods: new Set(exportedHandlers.keys()),
    handlerFacts,
    factsForFunction(name) {
      return factsForNode(localDeclarations.get(name));
    },
    sourceFacts: factsForNode(sourceFile),
  };
}

export function parsePublicApiAllowlistSource(text) {
  const sourceFile = ts.createSourceFile(
    middlewarePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "PUBLIC_API_PATHS" ||
        !declaration.initializer ||
        !ts.isNewExpression(declaration.initializer)
      ) {
        continue;
      }
      const setName = propertyPath(declaration.initializer.expression);
      const values = declaration.initializer.arguments?.[0];
      if (setName !== "Set" || !values || !ts.isArrayLiteralExpression(values)) {
        return null;
      }
      const routes = values.elements
        .filter((element) => ts.isStringLiteralLike(element))
        .map((element) => element.text);
      return new Set(routes);
    }
  }

  return null;
}

function parsePublicApiAllowlist() {
  const routes = parsePublicApiAllowlistSource(read(middlewarePath));
  if (!routes) {
    fail("Middleware public API allowlist", "PUBLIC_API_PATHS Set literal was not found");
    return new Set();
  }
  return routes;
}

function compareMethodSurface(label, route, actual, expected) {
  const missingMethods = [...expected].filter((method) => !actual.has(method));
  const unexpectedMethods = [...actual].filter((method) => !expected.has(method));
  if (missingMethods.length > 0 || unexpectedMethods.length > 0) {
    fail(
      label,
      `${route} expected ${[...expected].join(", ") || "none"}, found ${[...actual].join(", ") || "none"}`,
    );
    return;
  }
  pass(label, `${route} exports ${[...actual].join(", ")}`);
}

function checkPublicAllowlist(publicApiRoutes, routeAnalyses) {
  for (const route of expectedPublicApiRoutes.keys()) {
    if (!publicApiRoutes.has(route)) {
      fail("Expected public API route", `${route} is missing from middleware allowlist`);
    }
  }

  for (const route of publicApiRoutes) {
    if (!expectedPublicApiRoutes.has(route)) {
      fail("Unexpected public API route", `${route} is public but not documented in check-route-security`);
      continue;
    }

    const analysis = routeAnalyses.get(route);
    if (!analysis) {
      fail("Public API route file", `${route} is allowlisted but no route.ts exists`);
      continue;
    }

    compareMethodSurface("Public API method surface", route, analysis.methods, expectedPublicApiRoutes.get(route));

    const guardedMethods = expectedPublicApiMethodGuards.get(route);
    for (const [method, requiredCalls] of guardedMethods ?? []) {
      const facts = analysis.handlerFacts.get(method) ?? emptyFacts();
      const missingCalls = requiredCalls.filter((name) => !facts.calls.has(name));
      if (missingCalls.length === 0) {
        pass("Public API route guard", `${route} ${method} reaches ${requiredCalls.join(", ")}`);
      } else {
        fail("Public API route guard", `${route} ${method} missing ${missingCalls.join(", ")}`);
      }
    }
  }

  const unexpectedAllowlistedRoutes = [...publicApiRoutes].filter((route) => !expectedPublicApiRoutes.has(route));
  const missingExpectedRoutes = [...expectedPublicApiRoutes.keys()].filter((route) => !publicApiRoutes.has(route));
  if (unexpectedAllowlistedRoutes.length === 0 && missingExpectedRoutes.length === 0) {
    pass("Middleware public API allowlist", "only documented public API routes are exposed");
  }
}

function hasSameOriginGuard(facts) {
  return facts.calls.has("assertSameOriginRequest") || facts.calls.has("assertInternalSystemRequest");
}

function checkPrivateGetApiGuards(routeAnalyses, publicApiRoutes) {
  for (const [route, expected] of expectedPrivateGetApiRoutes) {
    if (publicApiRoutes.has(route)) {
      fail("Private GET public exposure", `${route} must not be in PUBLIC_API_PATHS`);
    }

    const analysis = routeAnalyses.get(route);
    if (!analysis) {
      fail("Private GET route file", `${route} route.ts was not found`);
      continue;
    }

    compareMethodSurface("Private GET method surface", route, analysis.methods, expected.methods);

    for (const method of expected.methods) {
      const facts = analysis.handlerFacts.get(method) ?? emptyFacts();
      const missingCalls = expected.requiredCalls.filter((name) => !facts.calls.has(name));
      const missingIdentifiers = expected.requiredIdentifiers.filter((name) => !facts.identifiers.has(name));
      if (missingCalls.length === 0 && missingIdentifiers.length === 0) {
        pass(
          "Private GET route guard",
          `${route} ${method} reaches authenticated context and one-time state binding`,
        );
      } else {
        fail(
          "Private GET route guard",
          `${route} ${method} missing ${[...missingCalls, ...missingIdentifiers].join(", ")}`,
        );
      }
    }
  }
}

function checkPrivateMutationGuards(routeAnalyses, publicApiRoutes) {
  for (const [route, analysis] of routeAnalyses) {
    if (publicApiRoutes.has(route)) {
      continue;
    }

    for (const method of analysis.methods) {
      if (!mutatingMethods.has(method)) {
        continue;
      }
      const facts = analysis.handlerFacts.get(method) ?? emptyFacts();
      if (hasSameOriginGuard(facts)) {
        pass("Private mutation same-origin guard", `${route} ${method}`);
      } else {
        fail("Private mutation same-origin guard", `${route} ${method} has no reachable same-origin/internal guard call`);
      }
    }
  }
}

function checkInternalApiGuards(publicApiRoutes, routeAnalyses) {
  const middlewareAnalysis = analyzeRouteSource(read(middlewarePath), middlewarePath);
  const proxyFacts = middlewareAnalysis.factsForFunction("proxy");

  if (proxyFacts.calls.has("isInternalApiRequest") && proxyFacts.calls.has("isAuthorizedInternalRequest")) {
    pass("Internal API middleware guard", "/api/internal/* reaches the bearer-secret authorization branch");
  } else {
    fail("Internal API middleware guard", "exported proxy does not reach the internal authorization branch");
  }

  for (const [route, expected] of expectedInternalApiRoutes) {
    if (publicApiRoutes.has(route)) {
      fail("Internal API public exposure", `${route} must not be in PUBLIC_API_PATHS`);
    }

    const analysis = routeAnalyses.get(route);
    if (!analysis) {
      fail("Internal API route file", `${route} route.ts was not found`);
      continue;
    }

    compareMethodSurface("Internal API method surface", route, analysis.methods, expected.methods);

    for (const method of expected.methods) {
      const facts = analysis.handlerFacts.get(method) ?? emptyFacts();
      const missingCalls = expected.requiredCalls.filter((name) => !facts.calls.has(name));
      const missingEnv = expected.requiredEnv.filter((name) => !facts.env.has(name));
      if (missingCalls.length === 0 && missingEnv.length === 0) {
        pass("Internal API route guard", `${route} ${method} reaches required guard and env-gate logic`);
      } else {
        fail(
          "Internal API route guard",
          `${route} ${method} missing ${[...missingCalls, ...missingEnv].join(", ")}`,
        );
      }
    }
  }
}

function ownershipEvidence(facts) {
  for (const call of ownershipCalls) {
    if (facts.calls.has(call)) {
      return `reachable call ${call}`;
    }
  }
  for (const property of ownershipPropertyPaths) {
    if (facts.propertyPaths.has(property)) {
      return `property access ${property}`;
    }
  }
  for (const field of ownershipFilterFields) {
    if (facts.filterFields.has(field)) {
      return `query filter ${field}`;
    }
  }
  return null;
}

function checkDynamicOwnershipMarkers(routeAnalyses, publicApiRoutes) {
  for (const [route, analysis] of routeAnalyses) {
    if (publicApiRoutes.has(route) || !route.includes("[")) {
      continue;
    }

    for (const method of analysis.methods) {
      const evidence = ownershipEvidence(analysis.handlerFacts.get(method) ?? emptyFacts());
      if (evidence) {
        pass("Dynamic route ownership evidence", `${route} ${method} uses ${evidence}`);
      } else {
        fail("Dynamic route ownership evidence", `${route} ${method} has no reachable tenant/auth ownership evidence`);
      }
    }
  }
}

function main() {
  failures = 0;
  const publicApiRoutes = parsePublicApiAllowlist();
  const routeFiles = walk(path.join(root, apiRoot));
  const routeAnalyses = new Map(
    routeFiles.map((file) => {
      const route = routePathFromFile(file);
      return [route, analyzeRouteSource(fs.readFileSync(file, "utf8"), path.relative(root, file))];
    }),
  );

  checkPublicAllowlist(publicApiRoutes, routeAnalyses);
  checkInternalApiGuards(publicApiRoutes, routeAnalyses);
  checkPrivateGetApiGuards(routeAnalyses, publicApiRoutes);
  checkPrivateMutationGuards(routeAnalyses, publicApiRoutes);
  checkDynamicOwnershipMarkers(routeAnalyses, publicApiRoutes);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main();
}
