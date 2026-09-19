/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Proteções básicas para todas as páginas.
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // ninguém pode "embutir" o radar em outro site
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // Dados internos nunca ficam guardados em cache de ninguém.
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

module.exports = nextConfig;
