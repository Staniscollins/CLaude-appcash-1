import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 relies on Node-specific modules (cookie jar, fetch shims):
  // keep it out of the server bundle and load it with the native require.
  serverExternalPackages: ["yahoo-finance2"],
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
