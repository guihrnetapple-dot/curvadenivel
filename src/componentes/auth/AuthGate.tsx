import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import logoCurvaNivel from "../../assets/logo-curva-nivel.png";
import { CarregamentoInicial } from "../CarregamentoInicial";
import { CompleteProfilePage } from "./CompleteProfilePage";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { useAuth } from "../../context/AuthContext";

type TelaAuth = "login" | "cadastro" | "recuperacao" | "nova-senha";

function detectarTelaInicial(): TelaAuth {
  return window.location.hash.includes("recuperar-senha") ? "nova-senha" : "login";
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-pagina">
      <section className="auth-card">
        <div className="auth-marca">
          <img src={logoCurvaNivel} alt="Logo Curva de Nível" />
          <div>
            <strong>Curva de Nível</strong>
            <span>Topografia, irrigação e Engenharia.</span>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

function SupabasePendente() {
  return (
    <AuthShell>
      <div className="auth-configuracao">
        <strong>Autenticação não configurada</strong>
        <span>
          Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente do projeto para liberar o
          acesso.
        </span>
      </div>
    </AuthShell>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { carregando, configurado, usuario, perfilPendente } = useAuth();
  const [tela, setTela] = useState<TelaAuth>(() => detectarTelaInicial());
  const resetandoSenha = useMemo(() => tela === "nova-senha", [tela]);

  if (carregando) {
    return <CarregamentoInicial />;
  }

  if (!configurado) {
    return <SupabasePendente />;
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
      <AuthShell>
        <CompleteProfilePage />
      </AuthShell>
    );
  }

  if (usuario) {
    return <>{children}</>;
  }

  return (
    <AuthShell>
      {tela === "login" && (
        <LoginPage aoCriarConta={() => setTela("cadastro")} aoRecuperarSenha={() => setTela("recuperacao")} />
      )}
      {tela === "cadastro" && <RegisterPage aoEntrar={() => setTela("login")} />}
      {tela === "recuperacao" && <ForgotPasswordPage aoEntrar={() => setTela("login")} />}
      {tela === "nova-senha" && (
        <LoginPage aoCriarConta={() => setTela("cadastro")} aoRecuperarSenha={() => setTela("recuperacao")} />
      )}
    </AuthShell>
  );
}
