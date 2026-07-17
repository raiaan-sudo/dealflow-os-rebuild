import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { ProductLocaleProvider } from "@/components/i18n/product-locale-provider";
import { parseProductLocalePathname } from "@/lib/i18n/routing";
import { shouldRenderVercelAnalytics } from "@/lib/telemetry/vercel-analytics-gate";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agentdealflow.io"),
  title: {
    default: "DealFlow OS — Build, launch, and optimize campaigns",
    template: "%s | DealFlow OS",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [requestHeaders, renderVercelAnalytics] = await Promise.all([
    headers(),
    shouldRenderVercelAnalytics(),
  ]);
  const locale = parseProductLocalePathname(
    requestHeaders.get("x-pathname") ?? "/",
  ).locale;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="dark min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <div className="df-atmosphere" />
          <ProductLocaleProvider locale={locale}>
            <div className="min-h-screen">
              {children}
            </div>
          </ProductLocaleProvider>
        </ThemeProvider>
        {renderVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
