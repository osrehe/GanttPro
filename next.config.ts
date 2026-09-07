import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El engine se consume directamente desde su código TypeScript (workspace npm).
  transpilePackages: ["@ganttpro/engine"],
  // Paquetes de servidor que no deben empaquetarse (Chromium, hojas de cálculo, lectura de PDF).
  serverExternalPackages: ["puppeteer", "exceljs", "pdf-parse"],
};

export default nextConfig;
