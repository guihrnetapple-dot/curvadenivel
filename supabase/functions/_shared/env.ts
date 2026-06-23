import { ErroHttp } from "./responses.ts";

const NOME_CHAVE_SERVICO = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");

export function obterEnvObrigatoria(nome: string): string {
  const valor = Deno.env.get(nome)?.trim();
  if (!valor) {
    throw new ErroHttp("CONFIG_MISSING", "Configuração de envio pendente.", 503);
  }
  return valor;
}

export function obterSupabaseUrl(): string {
  return obterEnvObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
}

export function obterServiceRoleKey(): string {
  return obterEnvObrigatoria(NOME_CHAVE_SERVICO);
}

export function obterNumeroEnv(nome: string, padrao: number): number {
  const numero = Number(Deno.env.get(nome) ?? padrao);
  return Number.isFinite(numero) && numero > 0 ? numero : padrao;
}

