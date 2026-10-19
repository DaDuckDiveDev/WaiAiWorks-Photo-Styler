import type { NextConfig } from "next";

// Images only ever come from Replicate's CDN, and they arrive through
// /api/download rather than <Image>, so the policy can stay tight.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Replicate serves outputs from both replicate.delivery and its subdomains;
  // a "*." wildcard alone doesn't cover the bare host.
  "img-src 'self' data: blob: https://replicate.delivery https://*.replicate.delivery",
  "connect-src 'self'",
  // Archivo is bundled with the app, so no third-party font host is needed.
  "font-src 'self' data:",
  // Next injects an inline bootstrap script; Tailwind and framer-motion write
  // inline styles. Both need the 'unsafe-inline' escape hatch.
  "script-src 'self' 'unsafe-inline'" +
    (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
