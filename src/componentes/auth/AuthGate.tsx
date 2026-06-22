import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const pendente = obterEmailConfirmacaoPendente();
    if (pendente) {
      setEmailConfirmacao(pendente);
    }
  }, [tela]);

  if (carregando) {
    return <CarregamentoInicial />;
  }

  if (!configurado) {
    return <AutenticacaoIndisponivel />;
  }

  if (usuario && resetandoSenha) {
    return (
      <AuthShell>
        <ResetPasswordPage aoConcluir={() => setTela("login")} />
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
            setTela("cadastro");
          }}
          aoRecuperarSenha={() => setTela("recuperacao")}
        />
      )}
      {tela === "cadastro" && (
        <RegisterPage
          aoEntrar={() => setTela("login")}
          aoConfirmacaoNecessaria={(email) => {
            setEmailConfirmacao(email);
            setTela("confirmacao-email");
          }}
        />
      )}
      {tela === "confirmacao-email" && emailConfirmacao && (
        <ConfirmEmailPage
          email={emailConfirmacao}
          aoConfirmado={async () => {
            limparConfirmacaoPendente();
            await recarregarPerfil();
          }}
          aoVoltarCadastro={() => {
            limparConfirmacaoPendente();
            setEmailConfirmacao(null);
            setTela("cadastro");
          }}
        />
      )}
      {tela === "recuperacao" && <ForgotPasswordPage aoEntrar={() => setTela("login")} />}
      {tela === "nova-senha" && (
        <LoginPage aoCriarConta={() => setTela("cadastro")} aoRecuperarSenha={() => setTela("recuperacao")} />
      )}
    </AuthShell>
  );
}
