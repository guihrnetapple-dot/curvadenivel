import { ErroHttp } from "./responses.ts";

export function normalizarEmail(valor: string | null | undefined): string {
  const email = String(valor ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErroHttp("INVALID_EMAIL", "Informe um e-mail válido.", 400);
  }
  return email;
}

export function validarCodigoOtp(valor: unknown): string {
  const codigo = String(valor ?? "").trim();
  if (!/^\d{6}$/.test(codigo)) {
    throw new ErroHttp("INVALID_REQUEST", "Informe o código de 6 dígitos.", 400);
  }
  return codigo;
}

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return email;
  return `${usuario.slice(0, 2)}${"*".repeat(Math.max(usuario.length - 2, 3))}@${dominio}`;
}

export function obterIp(requisicao: Request): string | null {
  return [
    requisicao.headers.get("x-forwarded-for")?.split(",")[0],
    requisicao.headers.get("x-real-ip"),
    requisicao.headers.get("cf-connecting-ip")
  ].map((item) => item?.trim()).find(Boolean) ?? null;
}

