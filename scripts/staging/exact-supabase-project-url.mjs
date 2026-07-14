export function parseExactHostedSupabaseProjectUrl(rawUrl) {
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length === 0 ||
    rawUrl.trim() !== rawUrl
  ) {
    throw new Error("Supabase project URL must be an exact hosted HTTPS origin");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Supabase project URL must be an exact hosted HTTPS origin");
  }
  const hostname = url.hostname.toLowerCase();
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(hostname);
  if (
    !match ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Supabase project URL must be an exact hosted HTTPS origin");
  }

  return Object.freeze({
    projectRef: match[1],
    url: `https://${hostname}`,
  });
}
