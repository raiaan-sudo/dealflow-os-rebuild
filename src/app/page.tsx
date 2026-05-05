import type { Metadata } from "next";
import { HomeCommandCenter } from "@/components/marketing/home-command-center";

export const metadata: Metadata = {
  title: "DealFlow OS | Inbound Deal System for Real Estate Operators",
  description:
    "DealFlow OS builds the funnel, campaign assets, lead capture, dashboard, and optimization loop for real estate acquisition teams.",
  alternates: {
    canonical: "https://www.agentdealflow.io",
  },
  openGraph: {
    title: "DealFlow OS | Inbound Deal System for Real Estate Operators",
    description:
      "Launch a complete real estate dealflow command center with funnel, creatives, lead capture, reporting, and optimization workflows.",
    url: "https://www.agentdealflow.io",
    siteName: "DealFlow OS",
    type: "website",
  },
};

export default function HomePage() {
  return <HomeCommandCenter />;
}
