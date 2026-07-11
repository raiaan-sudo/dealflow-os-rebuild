import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agentdealflow.io"),
  title: {
    default: "DealFlow OS — Build, launch, and optimize campaigns",
    template: "%s | DealFlow OS",
  },
};

const shouldRenderVercelAnalytics = process.env.VERCEL === "1";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="dark min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <div className="df-atmosphere" />
          <div className="min-h-screen">
            {children}
          </div>
        </ThemeProvider>
        {shouldRenderVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
