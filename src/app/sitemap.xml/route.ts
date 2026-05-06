const siteUrl = "https://www.agentdealflow.io";

const publicRoutes = [
  { path: "/", priority: "1.0", changeFrequency: "weekly" },
  { path: "/privacy", priority: "0.3", changeFrequency: "monthly" },
  { path: "/terms", priority: "0.3", changeFrequency: "monthly" },
  { path: "/data-deletion", priority: "0.3", changeFrequency: "monthly" },
] as const;

export const dynamic = "force-static";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const lastModified = new Date().toISOString();
  const urls = publicRoutes
    .map(
      (route) => `  <url>
    <loc>${escapeXml(`${siteUrl}${route.path}`)}</loc>
    <lastmod>${lastModified}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
