export function deriveSupabaseProjectRef(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim();

  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const hasUnexpectedUrlComponents =
    Boolean(url.username) ||
    Boolean(url.password) ||
    url.pathname !== "/" ||
    Boolean(url.search) ||
    Boolean(url.hash);

  if (hasUnexpectedUrlComponents) {
    return null;
  }

  if (
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]") &&
    (url.protocol === "http:" || url.protocol === "https:")
  ) {
    return "local";
  }

  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    !hostname.endsWith(".supabase.co")
  ) {
    return null;
  }

  const projectRef = hostname.slice(0, -".supabase.co".length);
  return /^[a-z0-9][a-z0-9-]{3,62}$/.test(projectRef) ? projectRef : null;
}

export function isExactIsolatedSupabaseProject(params: {
  supabaseUrl: string | null | undefined;
  expectedProjectRef: string | null | undefined;
}) {
  const expected = params.expectedProjectRef?.trim().toLowerCase() ?? "";
  const actual = deriveSupabaseProjectRef(params.supabaseUrl);

  return expected.length >= 4 && actual !== null && actual === expected;
}
