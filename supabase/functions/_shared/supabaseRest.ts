import { obterServiceRoleKey, obterSupabaseUrl } from "./env.ts";
import { ErroHttp } from "./responses.ts";

export async function chamarRpc<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const chaveServico = obterServiceRoleKey();
  const resposta = await fetch(`${obterSupabaseUrl()}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: chaveServico,
      Authorization: `Bearer ${chaveServico}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(corpo)
  });

  const texto = await resposta.text();
  const json = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const codigo = typeof json?.message === "string" && json.message.startsWith("OTP_") ? json.message : "BACKEND_ERROR";
    throw new ErroHttp(codigo, "Não foi possível concluir a verificação.", resposta.status >= 500 ? 503 : 400);
  }

  return json as T;
}

