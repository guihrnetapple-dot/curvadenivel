import { obterSupabase } from "../lib/supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface OpcoesApiProtegida extends RequestInit {
  repetirAposRenovar?: boolean;
}

async function obterAccessToken(): Promise<string> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error("Entre na sua conta para continuar.");
  }

  return token;
}

async function renovarAccessToken(): Promise<string | null> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }
  return data.session?.access_token ?? null;
}

function montarUrlApi(caminho: string): string {
  const caminhoNormalizado = caminho.startsWith("/") ? caminho : "/" + caminho;
  return API_BASE + caminhoNormalizado;
}

function montarHeaders(headers: HeadersInit | undefined, token: string): Headers {
  const saida = new Headers(headers);
  saida.set("Authorization", "Bearer " + token);
  return saida;
}

export async function fetchApiProtegida(caminho: string, opcoes: OpcoesApiProtegida = {}): Promise<Response> {
  const { repetirAposRenovar = true, ...requestInit } = opcoes;
  const token = await obterAccessToken();
  const resposta = await fetch(montarUrlApi(caminho), {
    ...requestInit,
    headers: montarHeaders(requestInit.headers, token)
  });

  if (resposta.status !== 401 || !repetirAposRenovar) {
    return resposta;
  }

  const tokenRenovado = await renovarAccessToken();
  if (!tokenRenovado) {
    return resposta;
  }

  return fetch(montarUrlApi(caminho), {
    ...requestInit,
    headers: montarHeaders(requestInit.headers, tokenRenovado)
  });
}

export async function lerRespostaJson<T>(resposta: Response, mensagemPadrao: string): Promise<T> {
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === "object" && "erro" in corpo
        ? String((corpo as { erro: unknown }).erro)
        : mensagemPadrao;
    throw new Error(mensagem);
  }

  return corpo as T;
}
