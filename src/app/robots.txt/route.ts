const siteUrl = "https://www.agentdealflow.io";

export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Allow: /privacy",
    "Allow: /terms",
    "Allow: /data-deletion",
    "Allow: /opengraph-image",
    "Disallow: /dashboard",
    "Disallow: /builder",
    "Disallow: /preview",
    "Disallow: /launch",
    "Disallow: /settings",
    "Disallow: /paywall",
    "Disallow: /admin",
    "Disallow: /api",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
