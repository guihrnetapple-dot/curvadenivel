import { obterEnvObrigatoria } from "./env.ts";

function bytesParaHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function importarChaveHmac(): Promise<CryptoKey> {
  const segredo = obterEnvObrigatoria("OTP_HMAC_SECRET");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export function gerarCodigoOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

export async function criarDigestCodigo(challengeId: string, userId: string, purpose: string, codigo: string): Promise<string> {
  const chave = await importarChaveHmac();
  const payload = `${challengeId}:${userId}:${purpose}:${codigo}`;
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return bytesParaHex(assinatura);
}

export async function criarHashDestino(destino: string): Promise<string> {
  const segredo = obterEnvObrigatoria("OTP_HMAC_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${segredo}:${destino}`));
  return bytesParaHex(digest);
}

export async function criarHashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return criarHashDestino(ip);
}

