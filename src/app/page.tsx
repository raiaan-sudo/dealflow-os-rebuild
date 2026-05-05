import type { Metadata } from "next";
import { HomeCommandCenter } from "@/components/marketing/home-command-center";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agentdealflow.io"),
  title: "DealFlow OS | Inbound Deal System for Real Estate Operators",
  description:
    "DealFlow OS builds the funnel, campaign assets, lead capture, dashboard, and optimization loop for real estate acquisition teams.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DealFlow OS | Inbound Deal System for Real Estate Operators",
    description:
      "Launch a complete real estate dealflow command center with funnel, creatives, lead capture, reporting, and optimization workflows.",
    url: "/",
    siteName: "DealFlow OS",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "DealFlow OS command center for real estate inbound dealflow",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealFlow OS | Inbound Deal System for Real Estate Operators",
    description:
      "Built by ex-agency operators, DealFlow OS turns funnel, creative, routing, reporting, and optimization into owned software.",
    images: ["/opengraph-image"],
  },
};

export default function HomePage() {
  return <HomeCommandCenter />;
}
