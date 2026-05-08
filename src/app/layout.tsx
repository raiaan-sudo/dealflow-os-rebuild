import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClientErrorListener } from "@/components/telemetry/client-error-listener";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "DealFlow OS",
    template: "%s | DealFlow OS",
  },
  description:
    "Build, preview, launch, and monitor real estate campaigns from one guided operating system.",
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
