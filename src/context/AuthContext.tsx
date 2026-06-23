import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { obterSupabase, supabaseConfigurado } from "../lib/supabaseClient";
import { restaurarPerfilCadastroInicial } from "../servicos/authService";
import { loginPersistenteAtivo } from "../servicos/persistenciaLogin";
import { garantirPerfilUsuario } from "../servicos/profileService";
import type { PerfilUsuario } from "../tipos/autenticacao";

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
  erroInicializacao: string | null;
  recarregarPerfil: () => Promise<void>;
  tentarNovamente: () => void;
}

const AuthContext = createContext<EstadoAuth | null>(null);

function paginaFoiRecarregada(): boolean {
  const navegacao = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navegacao?.type === "reload";
}

function comTimeout<T>(promessa: Promise<T>, tempoMs: number, mensagem: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = window.setTimeout(() => reject(new Error(mensagem)), tempoMs);
    promessa
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(temporizador));
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [erroInicializacao, setErroInicializacao] = useState<string | null>(null);
  const [tentativaInicializacao, setTentativaInicializacao] = useState(0);

  const carregarPerfil = useCallback(async (usuario: User | null) => {
    if (!usuario || !supabaseConfigurado) {
      setPerfil(null);
      return;
    }

    try {
      const perfilUsuario = await comTimeout(
        garantirPerfilUsuario(usuario),
        12000,
        "A consulta ao perfil demorou demais. Verifique sua conexão e tente novamente."
      );
      if (perfilUsuario) {
        setPerfil(perfilUsuario);
        return;
      }

      const perfilRestaurado = await comTimeout(
        restaurarPerfilCadastroInicial(usuario),
        12000,
        "A restauração do perfil demorou demais. Verifique sua conexão e tente novamente."
      );
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

  const tentarNovamente = useCallback(() => {
    setErroInicializacao(null);
    setCarregando(true);
    setTentativaInicializacao((valor) => valor + 1);
  }, []);

  const emailAtual = sessao?.user.email?.trim().toLowerCase() ?? null;
  const emailConfirmadoNoPerfil = Boolean(
    perfil?.email_verified_at &&
      perfil.verified_email &&
      emailAtual &&
      perfil.verified_email.trim().toLowerCase() === emailAtual
  );
  const emailConfirmadoNoSupabase = Boolean(sessao?.user.email_confirmed_at);
  const emailVerificado = emailConfirmadoNoPerfil || (!perfil && emailConfirmadoNoSupabase);
  const whatsappVerificado = Boolean(
    perfil?.whatsapp_verified_at &&
      perfil.verified_whatsapp &&
      perfil.whatsapp &&
      perfil.verified_whatsapp.trim() === perfil.whatsapp.trim()
  );

  useEffect(() => {
    if (!supabaseConfigurado) {
      setErroInicializacao(null);
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
      setErroInicializacao("Não foi possível iniciar a autenticação. Tente novamente.");
      setCarregando(false);
      return;
    }

    let ativo = true;

    async function inicializarSessao() {
      try {
        setErroInicializacao(null);
        const { data } = await comTimeout(
          supabase.auth.getSession(),
          12000,
          "A autenticação demorou demais para responder. Verifique sua conexão e tente novamente."
        );

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
      } catch (erro) {
        if (import.meta.env.DEV) {
          console.error("Falha ao obter sessão do banco de dados:", erro);
        }
        if (ativo) {
          setSessao(null);
          setPerfil(null);
          setErroInicializacao(erro instanceof Error ? erro.message : "Não foi possível iniciar a autenticação.");
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    void inicializarSessao();

    let assinatura: { subscription: { unsubscribe: () => void } } | null = null;

    try {
      const retornoAssinatura = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
        setSessao(novaSessao);
        setCarregando(false);
        window.setTimeout(() => {
          void carregarPerfil(novaSessao?.user ?? null).catch((erro) => {
            if (import.meta.env.DEV) {
              console.error("Falha ao processar mudança de autenticação:", erro);
            }
            setPerfil(null);
          });
        }, 0);
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
  }, [carregarPerfil, tentativaInicializacao]);

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
      erroInicializacao,
      recarregarPerfil,
      tentarNovamente
    }),
    [carregando, emailAtual, emailVerificado, erroInicializacao, perfil, recarregarPerfil, sessao, tentarNovamente, whatsappVerificado]
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
