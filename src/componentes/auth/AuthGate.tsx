import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import logoCurvaNivel from "../../assets/logo-curva-nivel.png";
import { useAuth } from "../../context/AuthContext";
import { limparConfirmacaoPendente, obterEmailConfirmacaoPendente } from "../../servicos/authService";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuth";
import { CarregamentoInicial } from "../CarregamentoInicial";
import { AuthTerrainPanel } from "./AuthTerrainPanel";
import { AuthErrorBoundary } from "./AuthErrorBoundary";
import { CompleteProfilePage } from "./CompleteProfilePage";
import { ConfirmEmailPage } from "./ConfirmEmailPage";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { ResetPasswordPage } from "./ResetPasswordPage";

type TelaAuth = "login" | "cadastro" | "recuperacao" | "nova-senha" | "confirmacao-email";

const rotasPorTela: Record<TelaAuth, string> = {
  login: "/login",
  cadastro: "/cadastro",
  recuperacao: "/recuperarsenha",
  "nova-senha": "/novasenha",
  "confirmacao-email": "/confirmaremail"
};

const titulosPorRota: Record<string, string> = {
  "/login": "Login | Curva de Nível",
  "/cadastro": "Cadastro | Curva de Nível",
  "/confirmaremail": "Confirmar e-mail | Curva de Nível",
  "/recuperarsenha": "Recuperar senha | Curva de Nível",
  "/novasenha": "Nova senha | Curva de Nível",
  "/completarcadastro": "Completar cadastro | Curva de Nível",
  "/home": "Home | Curva de Nível"
};

function normalizarCaminho(caminho: string): string {
  const semBarraFinal = caminho.replace(/\/+$/, "");
  return semBarraFinal || "/";
}

function obterTelaPorCaminho(caminho: string): TelaAuth | null {
  const normalizado = normalizarCaminho(caminho).toLowerCase();
  const entrada = Object.entries(rotasPorTela).find(([, rota]) => rota === normalizado);
  return (entrada?.[0] as TelaAuth | undefined) ?? null;
}

function caminhoAtual(): string {
  return normalizarCaminho(window.location.pathname);
}

function atualizarUrl(caminho: string, substituir = false) {
  const urlAtual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const destino = caminho;
  if (urlAtual === destino) return;

  const metodo = substituir ? "replaceState" : "pushState";
  window.history[metodo](null, "", destino);
}

function caminhoProtegido(caminho: string): boolean {
  return ["/home", "/completarcadastro"].includes(normalizarCaminho(caminho).toLowerCase());
}

function atualizarTitulo(caminho: string) {
  document.title = titulosPorRota[normalizarCaminho(caminho).toLowerCase()] ?? "Curva de Nível";
}

function detectarErroUrl(): string | null {
  const parametros = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const parametrosHash = new URLSearchParams(hash);
  const codigo =
    parametros.get("error_code") ??
    parametrosHash.get("error_code") ??
    parametros.get("error") ??
    parametrosHash.get("error");

  if (!codigo) {
    return null;
  }

  const url = new URL(window.location.href);
  ["error", "error_code", "error_description"].forEach((chave) => url.searchParams.delete(chave));
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${window.location.hash.includes("recuperar-senha") ? "#recuperar-senha" : ""}`
  );
  return traduzirErroAuth({ code: codigo });
}

function detectarTelaInicial(): TelaAuth {
  const telaUrl = obterTelaPorCaminho(window.location.pathname);
  if (telaUrl) return telaUrl;
  if (window.location.hash.includes("recuperar-senha")) return "nova-senha";
  if (obterEmailConfirmacaoPendente()) return "confirmacao-email";
  return "login";
}

function AuthShell({ children, cadastro }: { children: ReactNode; cadastro?: boolean }) {
  return (
    <main className="auth-pagina">
      <section className={cadastro ? "auth-card auth-card-cadastro" : "auth-card"}>
        <div className="auth-marca">
          <img src={logoCurvaNivel} alt="Logo Curva de Nível" />
          <div>
            <strong>Curva de Nível</strong>
            <span>Topografia, irrigação e engenharia.</span>
          </div>
        </div>
        <div className="auth-layout">
          <section className="auth-painel-formulario">{children}</section>
          <AuthTerrainPanel />
        </div>
      </section>
    </main>
  );
}

function AutenticacaoIndisponivel() {
  return (
    <AuthShell>
      <div className="auth-configuracao">
        <strong>Configuração pendente</strong>
        <span>Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para liberar o acesso.</span>
      </div>
    </AuthShell>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { carregando, configurado, usuario, perfilPendente, recarregarPerfil } = useAuth();
  const [tela, setTela] = useState<TelaAuth>(() => detectarTelaInicial());
  const [emailConfirmacao, setEmailConfirmacao] = useState<string | null>(() => obterEmailConfirmacaoPendente());
  const [mensagemUrl, setMensagemUrl] = useState<string | null>(() => detectarErroUrl());
  const resetandoSenha = useMemo(() => tela === "nova-senha", [tela]);
  const navegarAuth = useCallback((proximaTela: TelaAuth, substituir = false) => {
    setTela(proximaTela);
    atualizarUrl(rotasPorTela[proximaTela], substituir);
    atualizarTitulo(rotasPorTela[proximaTela]);
  }, []);

  useEffect(() => {
    const pendente = obterEmailConfirmacaoPendente();
    if (pendente) {
      setEmailConfirmacao(pendente);
    }
  }, [tela]);

  useEffect(() => {
    const aoVoltar = () => {
      const telaUrl = detectarTelaInicial();
      setTela(telaUrl);
      atualizarTitulo(window.location.pathname);
    };

    window.addEventListener("popstate", aoVoltar);
    atualizarTitulo(window.location.pathname);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    if (carregando || !configurado) return;

    const caminho = caminhoAtual().toLowerCase();

    if (usuario && resetandoSenha) {
      atualizarUrl(rotasPorTela["nova-senha"], true);
      atualizarTitulo(rotasPorTela["nova-senha"]);
      return;
    }

    if (usuario && perfilPendente) {
      atualizarUrl("/completarcadastro", true);
      atualizarTitulo("/completarcadastro");
      return;
    }

    if (usuario) {
      atualizarUrl("/home", true);
      atualizarTitulo("/home");
      return;
    }

    if (caminho === "/" || caminhoProtegido(caminho)) {
      navegarAuth("login", true);
    }
  }, [carregando, configurado, navegarAuth, perfilPendente, resetandoSenha, usuario]);

  if (carregando) {
    return <CarregamentoInicial />;
  }

  if (!configurado) {
    return <AutenticacaoIndisponivel />;
  }

  if (usuario && resetandoSenha) {
    return (
      <AuthShell>
        <ResetPasswordPage aoConcluir={() => navegarAuth("login", true)} />
      </AuthShell>
    );
  }

  if (usuario && perfilPendente) {
    return (
      <AuthShell cadastro>
        <CompleteProfilePage />
      </AuthShell>
    );
  }

  if (usuario) {
    return <AuthErrorBoundary>{children}</AuthErrorBoundary>;
  }

  return (
    <AuthShell cadastro={tela === "cadastro" || tela === "confirmacao-email"}>
      {mensagemUrl && (
        <div className="auth-feedback erro" role="alert">
          {mensagemUrl}
        </div>
      )}
      {tela === "login" && (
        <LoginPage
          aoCriarConta={() => {
            setMensagemUrl(null);
            navegarAuth("cadastro");
          }}
          aoRecuperarSenha={() => navegarAuth("recuperacao")}
        />
      )}
      {tela === "cadastro" && (
        <RegisterPage
          aoEntrar={() => navegarAuth("login")}
          aoConfirmacaoNecessaria={(email) => {
            setEmailConfirmacao(email);
            navegarAuth("confirmacao-email");
          }}
        />
      )}
      {tela === "confirmacao-email" && emailConfirmacao && (
        <ConfirmEmailPage
          email={emailConfirmacao}
          aoConfirmado={async () => {
            await recarregarPerfil();
          }}
          aoVoltarCadastro={() => {
            limparConfirmacaoPendente();
            setEmailConfirmacao(null);
            navegarAuth("cadastro");
          }}
        />
      )}
      {tela === "recuperacao" && <ForgotPasswordPage aoEntrar={() => navegarAuth("login")} />}
      {tela === "nova-senha" && (
        <LoginPage aoCriarConta={() => navegarAuth("cadastro")} aoRecuperarSenha={() => navegarAuth("recuperacao")} />
      )}
    </AuthShell>
  );
}
