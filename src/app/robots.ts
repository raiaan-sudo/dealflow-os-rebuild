import type { MetadataRoute } from "next";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.agentdealflow.io").replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/privacy", "/terms", "/data-deletion", "/f/"],
      disallow: [
        "/admin/",
        "/api/",
        "/builder",
        "/dashboard",
        "/launch",
        "/preview",
        "/settings",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
