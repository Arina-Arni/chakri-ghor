import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import { Suspense } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { ServerNowSeed } from "@/components/providers/server-now";
import { t } from "@/i18n";
import "./globals.css";

const hind = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "bn_BD", siteName: t("brand.name") },
  title: { default: `${t("brand.name")} — ${t("brand.tagline")}`, template: `%s · ${t("brand.name")}` },
  description: t("landing.heroSub"),
  applicationName: t("brand.name"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3a5a7c" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1b2e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="bn" className={`${hind.variable} ${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-[70] rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("common.skipToContent")}
        </a>
        <AppProviders>{children}</AppProviders>
        <Suspense fallback={null}>
          <ServerNowSeed />
        </Suspense>
      </body>
    </html>
  );
}
