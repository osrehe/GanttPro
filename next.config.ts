import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Política de seguridad de contenido (ADR-012). Next inyecta scripts en línea para hidratar y para
 * el arranque del enrutador, así que `script-src` necesita `'unsafe-inline'`; en desarrollo, además,
 * Turbopack evalúa código (`'unsafe-eval'`). Los estilos van en línea (Tailwind v4 y los estilos
 * calculados del Gantt). `img-src` admite `data:` (la exportación PNG y el logo incrustado) y
 * `https:` (un logo alojado fuera, configurable en Configuración).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Imagen de producción: servidor autónomo con sus dependencias mínimas (ADR-012).
  output: "standalone",
  // El PDF se imprime llamando al propio servidor por loopback.
  allowedDevOrigins: ["127.0.0.1"],
  // El engine se consume directamente desde su código TypeScript (workspace npm).
  transpilePackages: ["@ganttpro/engine"],
  // Paquetes de servidor que no deben empaquetarse (Chromium, hojas de cálculo, lectura de PDF).
  serverExternalPackages: ["puppeteer", "exceljs", "pdf-parse"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          // HSTS solo en producción: en desarrollo se sirve por HTTP.
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
