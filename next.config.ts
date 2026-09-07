import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El PDF se imprime llamando al propio servidor por loopback.
  allowedDevOrigins: ["127.0.0.1"],
  // El engine se consume directamente desde su código TypeScript (workspace npm).
  transpilePackages: ["@ganttpro/engine"],
  // Paquetes de servidor que no deben empaquetarse (Chromium, hojas de cálculo, lectura de PDF).
  serverExternalPackages: ["puppeteer", "exceljs", "pdf-parse"],
};

export default nextConfig;
