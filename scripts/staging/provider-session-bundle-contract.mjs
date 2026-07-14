export const SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA =
  "dealflow.synthetic-staging-provider-session-bundle.v1";

export const SYNTHETIC_PROVIDER_ROLE_EMAILS = Object.freeze({
  paidDirect: "dealflow-staging-20260712@example.com",
  partnerChild: "dealflow-staging-partner-child-20260712@example.com",
  partnerChildTwo: "dealflow-staging-partner-two-child-20260712@example.com",
});

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} does not contain the exact required keys`);
  }
}

export function parseSyntheticProviderSessionBundle(raw, options) {
  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    throw new Error("Synthetic provider session bundle is not valid JSON");
  }
  const {
    projectRef,
    projectFingerprint,
    safeSuffix,
    expectedRoleEmails = SYNTHETIC_PROVIDER_ROLE_EMAILS,
    minimumRemainingLifetimeSeconds = 15 * 60,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = options;
  requireExactKeys(
    bundle,
    ["schemaVersion", "projectFingerprint", "safeSuffix", "projectRef", "roles"],
    "Synthetic provider session bundle",
  );
  if (
    bundle?.schemaVersion !== SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA ||
    bundle.projectRef !== projectRef ||
    bundle.projectFingerprint !== projectFingerprint ||
    bundle.safeSuffix !== safeSuffix ||
    !bundle.roles ||
    typeof bundle.roles !== "object" ||
    Array.isArray(bundle.roles)
  ) {
    throw new Error("Synthetic provider session bundle is not bound to the exact project");
  }
  requireExactKeys(bundle.roles, Object.keys(expectedRoleEmails), "Synthetic provider role portfolio");
  for (const [role, expectedEmail] of Object.entries(expectedRoleEmails)) {
    const session = bundle.roles[role];
    requireExactKeys(
      session,
      ["userId", "email", "accessToken", "expiresAt"],
      `Synthetic provider session ${role}`,
    );
    if (
      session.email !== expectedEmail ||
      !/^[a-f0-9-]{36}$/i.test(session.userId ?? "") ||
      typeof session.accessToken !== "string" ||
      !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.accessToken) ||
      !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt - nowSeconds < minimumRemainingLifetimeSeconds
    ) {
      throw new Error(`Synthetic provider session identity or lifetime is invalid for ${role}`);
    }
  }
  return bundle;
}
