import { createClient } from "@supabase/supabase-js";

import { loginPersistenteAtivo } from "../servicos/persistenciaLogin";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const credenciaisSupabasePresentes = Boolean(supabaseUrl && supabaseAnonKey);

function obterStorageSessao(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function obterStorageLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storageAutenticacao = {
  getItem(chave: string) {
    const storage = loginPersistenteAtivo() ? obterStorageLocal() : obterStorageSessao();
    return storage?.getItem(chave) ?? null;
  },
  setItem(chave: string, valor: string) {
    const storage = loginPersistenteAtivo() ? obterStorageLocal() : obterStorageSessao();
    storage?.setItem(chave, valor);
  },
  removeItem(chave: string) {
    obterStorageLocal()?.removeItem(chave);
    obterStorageSessao()?.removeItem(chave);
  }
};

function criarClienteSupabase() {
  if (!credenciaisSupabasePresentes) {
    return null;
  }

  try {
    return createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: storageAutenticacao,
        flowType: "pkce"
      }
    });
  } catch (erro) {
    if (import.meta.env.DEV) {
      console.error("Configuração do Supabase inválida:", erro);
    }
    return null;
  }
}

export const supabase = criarClienteSupabase();
export const supabaseConfigurado = Boolean(supabase);

export function obterSupabase() {
  if (!supabase) {
    throw new Error("Serviço de autenticação não configurado.");
  }
  return supabase;
}
