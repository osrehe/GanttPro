import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/** Tipografía de la interfaz: geométrica y de trazo abierto, cómoda en tablas densas. */
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Monoespaciada para códigos WBS, fechas y cifras alineadas. */
const mono = JetBrains_Mono({
  variable: "--font-mono-app",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GanttPro",
  description: "Planificación de proyectos con cartas Gantt",
};

/**
 * next-themes reescribe la clase de <html> al aplicar el tema, así que las variables de fuente van
 * en el cuerpo: si estuvieran en la raíz, se perderían al cambiar de tema.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CL" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
