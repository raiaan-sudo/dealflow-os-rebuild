export const SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA =
  "dealflow.synthetic-staging-browser-session-bundle.v1";
export const SYNTHETIC_STAGING_ROLE_EMAILS = Object.freeze({
  newDirect: "dealflow-staging-new-direct-20260712@example.com",
  paidDirect: "dealflow-staging-20260712@example.com",
  legacy: "dealflow-staging-legacy-20260712@example.com",
  partnerAdmin: "dealflow-staging-partner-admin-20260712@example.com",
  partnerChild: "dealflow-staging-partner-child-20260712@example.com",
  partnerAdminTwo: "dealflow-staging-partner-two-admin-20260712@example.com",
  partnerChildTwo: "dealflow-staging-partner-two-child-20260712@example.com",
  operator: "dealflow-staging-operator-20260712@example.com",
  attacker: "dealflow-staging-attacker-20260712@example.com",
  deletion: "dealflow-staging-deletion-20260712@example.com",
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} does not contain the exact required keys`);
  }
}

export function validateSyntheticBrowserCookieChunks(cookies, projectRef) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("Synthetic browser session has no SSR auth cookies");
  }
  const baseName = `sb-${projectRef}-auth-token`;
  const namePattern = new RegExp(`^${escapeRegExp(baseName)}(?:\\.(0|[1-9]\\d*))?$`);
  const names = new Set();
  const chunks = [];
  let baseCookie = null;
  for (const cookie of cookies) {
    requireExactKeys(cookie, ["name", "value"], "Synthetic browser auth cookie");
    if (
      !cookie ||
      typeof cookie.name !== "string" ||
      typeof cookie.value !== "string" ||
      cookie.value.length === 0 ||
      cookie.value.length > 3_180
    ) {
      throw new Error("Synthetic browser session contains an invalid SSR auth cookie");
    }
    const match = namePattern.exec(cookie.name);
    if (!match || names.has(cookie.name)) {
      throw new Error("Synthetic browser session contains an unexpected or duplicate cookie");
    }
    names.add(cookie.name);
    if (match[1] == null) baseCookie = cookie.value;
    else chunks.push([Number(match[1]), cookie.value]);
  }
  if (baseCookie !== null && chunks.length > 0) {
    throw new Error("Synthetic browser session mixes base and chunked auth cookies");
  }
  if (baseCookie === null) {
    chunks.sort((left, right) => left[0] - right[0]);
    if (
      chunks.length === 0 ||
      chunks.some(([index], position) => index !== position)
    ) {
      throw new Error("Synthetic browser session cookie chunks are not contiguous from zero");
    }
  }
  const encoded = baseCookie ?? chunks.map(([, value]) => value).join("");
  if (!/^base64-[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("Synthetic browser session cookie payload is not official base64url SSR data");
  }
  return cookies.map(({ name, value }) => ({ name, value }));
}

export function parseSyntheticBrowserSessionBundle(raw, options) {
  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    throw new Error("Synthetic browser session bundle is not valid JSON");
  }
  const {
    projectRef,
    projectFingerprint,
    safeSuffix,
    expectedRoleEmails,
    minimumRemainingLifetimeSeconds = 15 * 60,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = options;
  requireExactKeys(
    bundle,
    ["schemaVersion", "projectFingerprint", "safeSuffix", "projectRef", "roles"],
    "Synthetic browser session bundle",
  );
  if (
    bundle?.schemaVersion !== SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA ||
    bundle.projectRef !== projectRef ||
    bundle.projectFingerprint !== projectFingerprint ||
    bundle.safeSuffix !== safeSuffix ||
    !bundle.roles ||
    typeof bundle.roles !== "object" ||
    Array.isArray(bundle.roles)
  ) {
    throw new Error("Synthetic browser session bundle is not bound to the exact project");
  }
  requireExactKeys(bundle.roles, Object.keys(expectedRoleEmails), "Synthetic browser role portfolio");
  for (const [role, expectedEmail] of Object.entries(expectedRoleEmails)) {
    const session = bundle.roles[role];
    requireExactKeys(
      session,
      ["userId", "email", "expiresAt", "cookies"],
      `Synthetic browser session ${role}`,
    );
    if (
      session?.email !== expectedEmail ||
      !/^[a-f0-9-]{36}$/i.test(session.userId ?? "") ||
      !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt - nowSeconds < minimumRemainingLifetimeSeconds
    ) {
      throw new Error(`Synthetic browser session identity or lifetime is invalid for ${role}`);
    }
    validateSyntheticBrowserCookieChunks(session.cookies, projectRef);
  }
  return bundle;
}

export function browserCookiesForOrigin(session, origin, projectRef) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.pathname !== "/") {
    throw new Error("Synthetic browser cookies require an exact HTTPS origin");
  }
  return validateSyntheticBrowserCookieChunks(session.cookies, projectRef).map((cookie) => ({
    ...cookie,
    url: parsedOrigin.origin,
    httpOnly: false,
    secure: true,
    sameSite: /** @type {"None"} */ ("None"),
    expires: session.expiresAt,
  }));
}

export function isAllowedStagingTurnstileRequest(rawUrl, method, enabled) {
  if (!enabled) return false;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (
    url.origin !== "https://challenges.cloudflare.com" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return false;
  }
  const normalizedMethod = String(method).toUpperCase();
  if (url.protocol === "blob:") {
    let embedded;
    try {
      embedded = new URL(url.pathname);
    } catch {
      return false;
    }
    return (
      normalizedMethod === "GET" &&
      url.search === "" &&
      url.hash === "" &&
      embedded.origin === "https://challenges.cloudflare.com" &&
      embedded.username === "" &&
      embedded.password === "" &&
      url.href === `blob:${embedded.href}` &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        embedded.pathname.slice(1),
      ) &&
      embedded.search === "" &&
      embedded.hash === ""
    );
  }
  if (
    url.pathname === "/turnstile/v0/api.js" &&
    ["GET", "HEAD"].includes(normalizedMethod)
  ) {
    return true;
  }
  if (
    /^\/turnstile\/v0\/b\/[a-f0-9]{12,64}\/api\.js$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === "" &&
    ["GET", "HEAD"].includes(normalizedMethod)
  ) {
    return true;
  }
  return (
    url.pathname.startsWith("/cdn-cgi/challenge-platform/") &&
    ["GET", "HEAD", "OPTIONS", "POST"].includes(normalizedMethod)
  );
}
