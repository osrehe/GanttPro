import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Verificación de vida de la aplicación. No requiere autenticación. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ganttpro",
    timestamp: new Date().toISOString(),
  });
}
