import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const credenciaisSupabasePresentes = Boolean(supabaseUrl && supabaseAnonKey);

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
