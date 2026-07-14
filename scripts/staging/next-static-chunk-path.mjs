export function findExactNextStaticChunkPath(html, baseUrl) {
  if (typeof html !== "string") {
    throw new TypeError("Next.js asset discovery requires HTML text");
  }
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username !== "" ||
    base.password !== "" ||
    base.port !== "" ||
    base.pathname !== "/" ||
    base.search !== "" ||
    base.hash !== ""
  ) {
    throw new Error("Next.js asset discovery requires an exact HTTPS origin");
  }

  for (const match of html.matchAll(/(?:src|href)\s*=\s*(["'])([^"']+)\1/gi)) {
    let asset;
    try {
      asset = new URL(match[2], base);
    } catch {
      continue;
    }
    if (
      asset.origin === base.origin &&
      asset.username === "" &&
      asset.password === "" &&
      asset.pathname.startsWith("/_next/static/") &&
      asset.pathname.endsWith(".js")
    ) {
      return asset.pathname;
    }
  }
  return null;
}
