import type { Metadata } from "next";
import { HomeCommandCenter } from "@/components/marketing/home-command-center";

export const metadata: Metadata = {
  title: "DealFlow | Inbound Deal System for Real Estate Operators",
  description:
    "DealFlow builds the funnel, campaign assets, lead capture, dashboard, and optimization loop for real estate acquisition teams.",
  alternates: {
    canonical: "https://www.agentdealflow.io",
  },
  openGraph: {
    title: "DealFlow | Inbound Deal System for Real Estate Operators",
    description:
      "Launch a complete real estate dealflow command center with funnel, creatives, lead capture, reporting, and optimization workflows.",
    url: "https://www.agentdealflow.io",
    siteName: "DealFlow",
    type: "website",
  },
};

export default function HomePage() {
  return <HomeCommandCenter />;
}
