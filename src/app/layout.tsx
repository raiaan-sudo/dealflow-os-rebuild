import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dealflow-os.local"),
  title: {
    default: "DealFlow OS",
    template: "%s | DealFlow OS",
  },
  description:
    "DealFlow OS is the AI-powered operating system for modern real estate professionals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
