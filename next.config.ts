import path from "node:path";
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : "";

/**
 * Content Security Policy — enforced (Part 3 §6). It was report-only in Part 2;
 * CSP_REPORT_ONLY=1 switches back for debugging.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHost} ${supabaseHost.replace("https://", "wss://")}`.trim(),
  `frame-src 'self' ${supabaseHost}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com " + supabaseHost,
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@react-pdf/renderer", "unpdf", "mammoth", "postgres"],
  // The dev terminal would otherwise print every Server Action's arguments — including the
  // password typed into the login form.
  logging: { serverFunctions: false },
  experimental: {
    // CV upload goes through a Route Handler; Server Actions stay small.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    // Pin the root to this folder. Otherwise Next guesses it from lockfiles in parent folders
    // and may watch a whole drive or the home directory, which makes dev very slow.
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
