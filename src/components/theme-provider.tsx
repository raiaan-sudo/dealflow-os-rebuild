"use client";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
};

export function ThemeProvider({
  children,
}: ThemeProviderProps) {
  return <>{children}</>;
}
