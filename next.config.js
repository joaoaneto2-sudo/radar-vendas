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
      {
        // Fotos do catálogo em PDF já redimensionadas: ficam um dia neste navegador (esta regra vem depois da de cima e vale no lugar dela).
        source: "/api/catalogo-imagem",
        headers: [{ key: "Cache-Control", value: "private, max-age=86400" }],
      },
    ];
  },
};

module.exports = nextConfig;
