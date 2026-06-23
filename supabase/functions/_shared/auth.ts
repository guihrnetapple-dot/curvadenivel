import { obterServiceRoleKey, obterSupabaseUrl } from "./env.ts";
import { ErroHttp } from "./responses.ts";

export interface UsuarioAutenticado {
  id: string;
  email: string | null;
}

export function extrairBearer(requisicao: Request): string {
  const valor = requisicao.headers.get("authorization") ?? "";
  const partes = valor.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
    throw new ErroHttp("AUTH_REQUIRED", "Entre novamente para continuar.", 401);
  }
  return partes[1];
}

export async function obterUsuarioAutenticado(requisicao: Request): Promise<UsuarioAutenticado> {
  const token = extrairBearer(requisicao);
  const chaveServico = obterServiceRoleKey();
  const resposta = await fetch(`${obterSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: chaveServico,
      Authorization: `Bearer ${token}`
    }
  });

  if (!resposta.ok) {
    throw new ErroHttp("AUTH_REQUIRED", "Entre novamente para continuar.", 401);
  }

  const usuario = await resposta.json().catch(() => null);
  if (!usuario || typeof usuario.id !== "string") {
    throw new ErroHttp("AUTH_REQUIRED", "Entre novamente para continuar.", 401);
  }

  return {
    id: usuario.id,
    email: typeof usuario.email === "string" ? usuario.email : null
  };
}

