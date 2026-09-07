/**
 * Tokens firmados (HMAC-SHA256 con WebCrypto) que autorizan a Puppeteer a abrir `/print/gantt` sin
 * sesión. Se firman con `AUTH_SECRET`, llevan proyecto, usuario y expiración, y duran 5 minutos.
 * Usa `crypto.subtle` para funcionar también en el runtime edge del middleware.
 */

export interface PrintTokenPayload {
  readonly projectId: string;
  readonly userId: string;
  /** Expiración en milisegundos desde época Unix. */
  readonly exp: number;
}

export const PRINT_TOKEN_TTL_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("Falta AUTH_SECRET para firmar los tokens de impresión");
  return value;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const padded = text
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Firma un token para el proyecto y usuario indicados. */
export async function signPrintToken(payload: PrintTokenPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Token con expiración por defecto (5 minutos). */
export function newPrintToken(projectId: string, userId: string): Promise<string> {
  return signPrintToken({ projectId, userId, exp: Date.now() + PRINT_TOKEN_TTL_MS });
}

/** Devuelve el contenido del token si la firma es válida y no ha expirado; si no, `null`. */
export async function verifyPrintToken(token: string): Promise<PrintTokenPayload | null> {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;
  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      signatureBytes as BufferSource,
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bodyBytes)) as Partial<PrintTokenPayload>;
    if (
      typeof parsed.projectId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Date.now()) return null;
    return { projectId: parsed.projectId, userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}
