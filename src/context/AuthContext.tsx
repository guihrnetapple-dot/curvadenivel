import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { obterSupabase, supabaseConfigurado } from "../lib/supabaseClient";
import type { PerfilUsuario } from "../tipos/autenticacao";
import { buscarPerfilUsuario } from "../servicos/profileService";

interface EstadoAuth {
  carregando: boolean;
  configurado: boolean;
  sessao: Session | null;
  usuario: User | null;
  perfil: PerfilUsuario | null;
  perfilPendente: boolean;
  recarregarPerfil: () => Promise<void>;
}

const AuthContext = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);

  const carregarPerfil = useCallback(async (usuario: User | null) => {
    if (!usuario || !supabaseConfigurado) {
      setPerfil(null);
      return;
    }

    try {
      const perfilUsuario = await buscarPerfilUsuario(usuario.id);
      setPerfil(perfilUsuario);
    } catch {
      setPerfil(null);
    }
  }, []);

  const recarregarPerfil = useCallback(async () => {
    await carregarPerfil(sessao?.user ?? null);
  }, [carregarPerfil, sessao]);

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }

    const supabase = obterSupabase();
    let ativo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) {
        return;
      }
      setSessao(data.session);
      await carregarPerfil(data.session?.user ?? null);
      setCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      carregarPerfil(novaSessao?.user ?? null).finally(() => setCarregando(false));
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      configurado: supabaseConfigurado,
      sessao,
      usuario: sessao?.user ?? null,
      perfil,
      perfilPendente: Boolean(sessao?.user && !perfil),
      recarregarPerfil
    }),
    [carregando, perfil, recarregarPerfil, sessao]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  }
  return contexto;
}
