import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer", "puppeteer-core", "@sparticuz/chromium"],
  /**
   * @sparticuz/chromium resuelve rutas relativas a `node_modules/.../bin`.
   * Sin esto, el trace de Vercel no copia `bin/` y falla en runtime.
   * @see https://github.com/Sparticuz/chromium#bundler-configuration
   */
  outputFileTracingIncludes: {
    "/api/projects/**/sat/list": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/projects/[id]/sat/list": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
