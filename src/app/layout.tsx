import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClientErrorListener } from "@/components/telemetry/client-error-listener";

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
