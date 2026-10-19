import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a production build run beside a dev server without sharing its folder
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
}

export default nextConfig
