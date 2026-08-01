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
    serverActions: {
      // Uploads de documentos normativos podem ser grandes.
      bodySizeLimit: "25mb",
      // Teste local do SSO do Teams passa pelo devtunnel (Origin do browser é o
      // host do túnel, não localhost) — sem isso, toda Server Action nessa
      // origem falha com "Invalid Server Actions request".
      allowedOrigins: ["5dbc181s-3000.brs.devtunnels.ms"],
    },
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
