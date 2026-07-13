/**
 * DealFlow's single Meta platform contract.
 *
 * Graph API v23.0 is the repository-proven version already used by the
 * Conversions API path at the canonical production commit. All Meta OAuth,
 * discovery, read, and write requests must use this module so versions cannot
 * drift and credentials cannot be placed in URLs.
 */
export const META_GRAPH_API_VERSION = "v23.0" as const;
export const META_GRAPH_ORIGIN = "https://graph.facebook.com" as const;
export const META_OAUTH_ORIGIN = "https://www.facebook.com" as const;
export const META_LIVE_WRITE_ENV = "ALLOW_META_LIVE_LAUNCH" as const;
export const META_CAPI_WRITE_ENV = "ALLOW_META_CAPI_EVENTS" as const;
export const META_OPTIMIZATION_WRITE_ENV = "ALLOW_META_SANDBOX_OPTIMIZATION" as const;
export const META_PRODUCTION_OPTIMIZATION_WRITE_ENV = "ALLOW_META_PRODUCTION_OPTIMIZATION" as const;

const URL_CREDENTIAL_KEYS = new Set([
  "access_token",
  "fb_exchange_token",
  "client_secret",
  "code",
]);

type MetaUrlParam = string | number | boolean | null | undefined;

type MetaOAuthDialogParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string | string[];
};

type MetaCodeExchange = {
  kind: "authorization_code";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
};

type MetaLongLivedExchange = {
  kind: "long_lived_token";
  clientId: string;
  clientSecret: string;
  accessToken: string;
};

export type MetaTokenExchange = MetaCodeExchange | MetaLongLivedExchange;

function normalizeMetaPath(path: string) {
  const normalized = path.trim().replace(/^\/+/, "");

  if (!normalized || normalized.includes("://") || normalized.startsWith("//")) {
    throw new Error("Meta request path must be a non-empty relative path.");
  }

  return normalized;
}

export function assertMetaUrlHasNoCredentials(input: string | URL) {
  const url = input instanceof URL ? input : new URL(input);

  for (const key of url.searchParams.keys()) {
    if (URL_CREDENTIAL_KEYS.has(key.toLowerCase())) {
      throw new Error(`Meta credentials must not be placed in URL query parameter '${key}'.`);
    }
  }

  return url;
}

export function buildMetaGraphUrl(
  path: string,
  params: Record<string, MetaUrlParam> = {},
) {
  const url = new URL(
    `${META_GRAPH_ORIGIN}/${META_GRAPH_API_VERSION}/${normalizeMetaPath(path)}`,
  );

  for (const [key, value] of Object.entries(params)) {
    if (URL_CREDENTIAL_KEYS.has(key.toLowerCase())) {
      throw new Error(`Meta credentials must not be placed in URL query parameter '${key}'.`);
    }

    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return assertMetaUrlHasNoCredentials(url);
}

export function buildMetaOAuthDialogUrl(params: MetaOAuthDialogParams) {
  const url = new URL(
    `${META_OAUTH_ORIGIN}/${META_GRAPH_API_VERSION}/dialog/oauth`,
  );
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set(
    "scope",
    Array.isArray(params.scopes) ? params.scopes.join(",") : params.scopes,
  );
  url.searchParams.set("response_type", "code");

  return assertMetaUrlHasNoCredentials(url);
}

/**
 * Meta's token endpoint accepts form-encoded POST requests. Keeping the
 * authorization code, app secret, and long-lived-token input in the body
 * preserves the OAuth exchange while ensuring credentials never enter URLs,
 * proxy logs, or retry diagnostics.
 */
export function buildMetaTokenExchangeRequest(exchange: MetaTokenExchange) {
  const body = new URLSearchParams({
    client_id: exchange.clientId,
    client_secret: exchange.clientSecret,
  });

  if (exchange.kind === "authorization_code") {
    body.set("redirect_uri", exchange.redirectUri);
    body.set("code", exchange.code);
  } else {
    body.set("grant_type", "fb_exchange_token");
    body.set("fb_exchange_token", exchange.accessToken);
  }

  return {
    url: buildMetaGraphUrl("oauth/access_token"),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    } satisfies RequestInit,
  };
}

export function withMetaBearerToken(
  accessToken: string,
  init: RequestInit = {},
): RequestInit {
  if (!accessToken.trim()) {
    throw new Error("Meta access token is required for an authenticated request.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return {
    ...init,
    headers,
  };
}

export function resolveMetaReturnUrl(
  returnTo: string | null | undefined,
  appUrl: string,
  fallbackPath = "/launch",
) {
  const appOrigin = new URL(appUrl).origin;
  const fallback = new URL(fallbackPath, appOrigin);

  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return fallback;
  }

  const resolved = new URL(returnTo, appOrigin);
  return resolved.origin === appOrigin ? resolved : fallback;
}

export function isMetaLiveWriteAllowed(
  env: Record<string, string | undefined> = process.env,
) {
  return env[META_LIVE_WRITE_ENV] === "true";
}

export function isMetaCapiWriteAllowed(
  env: Record<string, string | undefined> = process.env,
) {
  return env[META_CAPI_WRITE_ENV] === "true";
}

export function isMetaOptimizationWriteAllowed(
  env: Record<string, string | undefined> = process.env,
) {
  return env[META_OPTIMIZATION_WRITE_ENV] === "true" ||
    env[META_PRODUCTION_OPTIMIZATION_WRITE_ENV] === "true";
}
