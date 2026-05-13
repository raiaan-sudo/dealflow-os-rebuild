import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClientErrorListener } from "@/components/telemetry/client-error-listener";
import type { Metadata } from "next";

function getMetadataBase() {
  return new URL((process.env.NEXT_PUBLIC_APP_URL || "https://www.agentdealflow.io").replace(/\/$/, ""));
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "DealFlow OS",
    template: "%s | DealFlow OS",
  },
  description:
    "Build, preview, launch, and monitor real estate campaigns from one guided operating system.",
  openGraph: {
    title: "DealFlow OS",
    description:
      "Build, preview, launch, and monitor real estate campaigns from one guided operating system.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "DealFlow OS",
    description:
      "Build, preview, launch, and monitor real estate campaigns from one guided operating system.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="dark min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <ClientErrorListener />
          <div className="df-atmosphere" />
          <div className="min-h-screen">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
