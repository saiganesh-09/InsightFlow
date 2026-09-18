import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "InsightFlow — Real-time Product Analytics",
  description: "AI-powered real-time product analytics & intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: browser extensions (e.g. the WICG focus-visible
  // polyfill) inject js-focus-visible attributes into <html> before hydration.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
