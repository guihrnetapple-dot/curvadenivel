import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { obterSupabase, supabaseConfigurado } from "../lib/supabaseClient";
import type { PerfilUsuario } from "../tipos/autenticacao";
import { garantirPerfilUsuario } from "../servicos/profileService";
import { restaurarPerfilCadastroInicial } from "../servicos/authService";
import { loginPersistenteAtivo } from "../servicos/persistenciaLogin";

interface EstadoAuth {
  carregando: boolean;
  configurado: boolean;
  sessao: Session | null;
  usuario: User | null;
  perfil: PerfilUsuario | null;
  perfilPendente: boolean;
  emailAtual: string | null;
  emailVerificado: boolean;
  whatsappVerificado: boolean;
  recarregarPerfil: () => Promise<void>;
}

const AuthContext = createContext<EstadoAuth | null>(null);

function paginaFoiRecarregada(): boolean {
  const navegacao = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navegacao?.type === "reload";
}

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
      const perfilUsuario = await garantirPerfilUsuario(usuario);
      if (perfilUsuario) {
        setPerfil(perfilUsuario);
        return;
      }

      const perfilRestaurado = await restaurarPerfilCadastroInicial(usuario);
      setPerfil(perfilRestaurado);
    } catch (erro) {
      if (import.meta.env.DEV) {
        console.error("Falha ao buscar perfil do usuário:", erro);
      }
      setPerfil(null);
    }
  }, []);

  const recarregarPerfil = useCallback(async () => {
    try {
      await carregarPerfil(sessao?.user ?? null);
    } catch (erro) {
      if (import.meta.env.DEV) {
        console.error("Falha ao recarregar perfil do usuário:", erro);
      }
    }
  }, [carregarPerfil, sessao]);

  const emailAtual = sessao?.user.email?.trim().toLowerCase() ?? null;
  const emailVerificado = Boolean(
    perfil?.email_verified_at &&
      perfil.verified_email &&
      emailAtual &&
      perfil.verified_email.trim().toLowerCase() === emailAtual
  );
  const whatsappVerificado = Boolean(
    perfil?.whatsapp_verified_at &&
      perfil.verified_whatsapp &&
      perfil.whatsapp &&
      perfil.verified_whatsapp.trim() === perfil.whatsapp.trim()
  );

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }

    let supabase: SupabaseClient;
    try {
      supabase = obterSupabase();
    } catch (erro) {
      if (import.meta.env.DEV) {
        console.error("Falha ao inicializar banco de dados:", erro);
      }
      setCarregando(false);
      return;
    }

    let ativo = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!ativo) {
          return;
        }

        if (data.session && paginaFoiRecarregada() && !loginPersistenteAtivo()) {
          await supabase.auth.signOut().catch((erro) => {
            if (import.meta.env.DEV) {
              console.error("Falha ao limpar sessão não persistente:", erro);
            }
          });
          setSessao(null);
          setPerfil(null);
          return;
        }

        setSessao(data.session);
        await carregarPerfil(data.session?.user ?? null);
      })
      .catch((erro) => {
        if (import.meta.env.DEV) {
          console.error("Falha ao obter sessão do banco de dados:", erro);
        }
        if (ativo) {
          setSessao(null);
          setPerfil(null);
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });

    let assinatura: { subscription: { unsubscribe: () => void } } | null = null;

    try {
      const retornoAssinatura = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
        void (async () => {
          try {
            setSessao(novaSessao);
            await carregarPerfil(novaSessao?.user ?? null);
          } catch (erro) {
            if (import.meta.env.DEV) {
              console.error("Falha ao processar mudança de autenticação:", erro);
            }
            setPerfil(null);
          } finally {
            setCarregando(false);
          }
        })();
      });
      assinatura = retornoAssinatura.data;
    } catch (erro) {
      if (import.meta.env.DEV) {
        console.error("Falha ao assinar mudanças de autenticação:", erro);
      }
      setCarregando(false);
    }

    return () => {
      ativo = false;
      assinatura?.subscription.unsubscribe();
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
      emailAtual,
      emailVerificado,
      whatsappVerificado,
      recarregarPerfil
    }),
    [carregando, emailAtual, emailVerificado, perfil, recarregarPerfil, sessao, whatsappVerificado]
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
