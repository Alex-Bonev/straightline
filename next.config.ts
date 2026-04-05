import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // COEP/COOP needed for SharedArrayBuffer (3D splat viewer)
        // but must NOT apply to /agents — it embeds cross-origin iframes
        source: '/((?!agents).*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },
};

export default nextConfig;
