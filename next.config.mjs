// Permite embutir o app na aba do Microsoft Teams (iframe).
const TEAMS_FRAME_ANCESTORS = [
  "'self'",
  "https://teams.microsoft.com",
  "https://*.teams.microsoft.com",
  "https://*.skype.com",
  "https://teams.cloud.microsoft",
  "https://*.cloud.microsoft",
  "https://*.office.com",
].join(" ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // imagem Docker enxuta para Container Apps
  experimental: {
    // Uploads de documentos normativos podem ser grandes.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${TEAMS_FRAME_ANCESTORS};` },
        ],
      },
    ];
  },
};

export default nextConfig;
