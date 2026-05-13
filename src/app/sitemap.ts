import type { MetadataRoute } from "next";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.agentdealflow.io").replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return [
    "",
    "/login",
    "/privacy",
    "/terms",
    "/data-deletion",
    "/f/raiaan-broker-toronto-on-ccbfbfce",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: path.startsWith("/f/") ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/f/") ? 0.9 : 0.5,
  }));
}
