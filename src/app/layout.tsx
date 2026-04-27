import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="dark min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(109,184,255,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%)]" />
          <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
