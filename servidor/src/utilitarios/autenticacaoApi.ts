import type { NextFunction, Request, Response } from "express";

import { executarComContextoApi } from "./contextoRequisicaoApi";
import { ErroAplicacao } from "./erros";

export interface UsuarioApiAutenticado {
  id: string;
  email?: string;
}

export type RequisicaoAutenticada = Request & {
  usuarioApi?: UsuarioApiAutenticado;
  tokenApi?: string;
};

function obterConfiguracaoSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !chave) {
    throw new ErroAplicacao("Autenticação da API não configurada.", 503);
  }

  return { url: url.replace(/\/+$/, ""), chave };
}

function extrairBearer(requisicao: Request): string {
  const valor = requisicao.headers.authorization;
  if (!valor) {
    throw new ErroAplicacao("Autenticação obrigatória.", 401);
  }

  const partes = valor.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
    throw new ErroAplicacao("Autenticação inválida.", 401);
  }

  return partes[1];
}

async function validarTokenSupabase(token: string): Promise<UsuarioApiAutenticado> {
  const { url, chave } = obterConfiguracaoSupabase();
  const resposta = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: chave,
      Authorization: `Bearer ${token}`
    }
  });

  if (!resposta.ok) {
    throw new ErroAplicacao("Autenticação inválida.", 401);
  }

  const usuario = (await resposta.json().catch(() => null)) as { id?: unknown; email?: unknown } | null;
  if (!usuario || typeof usuario.id !== "string" || !usuario.id) {
    throw new ErroAplicacao("Autenticação inválida.", 401);
  }

  return {
    id: usuario.id,
    email: typeof usuario.email === "string" ? usuario.email : undefined
  };
}

export async function exigirAutenticacaoApi(
  requisicao: RequisicaoAutenticada,
  _resposta: Response,
  proximo: NextFunction
) {
  try {
    const token = extrairBearer(requisicao);
    requisicao.usuarioApi = await validarTokenSupabase(token);
    requisicao.tokenApi = token;
    executarComContextoApi({ tokenUsuario: token }, proximo);
  } catch (erro) {
    proximo(erro);
  }
}
