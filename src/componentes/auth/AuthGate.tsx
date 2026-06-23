import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import logoCurvaNivel from "../../assets/logo-curva-nivel.png";
import { useAuth } from "../../context/AuthContext";
import {
  limparConfirmacaoPendente,
  obterDesafioEmailAppPendente,
  obterEmailConfirmacaoPendente,
  sair
} from "../../servicos/authService";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuthBasica";
import { CarregamentoInicial } from "../CarregamentoInicial";
import { AuthErrorBoundary } from "./AuthErrorBoundary";
import { LoginPage } from "./LoginPage";

const AuthTerrainPanel = lazy(() => import("./AuthTerrainPanel").then((modulo) => ({ default: modulo.AuthTerrainPanel })));
const ForgotPasswordPage = lazy(() => import("./ForgotPasswordPage").then((modulo) => ({ default: modulo.ForgotPasswordPage })));
const ConfirmEmailPage = lazy(() => import("./ConfirmEmailPage").then((modulo) => ({ default: modulo.ConfirmEmailPage })));
const CompleteProfilePage = lazy(() => import("./CompleteProfilePage").then((modulo) => ({ default: modulo.CompleteProfilePage })));
const RegisterPage = lazy(() => import("./RegisterPage").then((modulo) => ({ default: modulo.RegisterPage })));
const ResetPasswordPage = lazy(() => import("./ResetPasswordPage").then((modulo) => ({ default: modulo.ResetPasswordPage })));

type TelaAuth = "login" | "cadastro" | "recuperacao" | "nova-senha" | "confirmacao-email";

const rotasPorTela: Record<TelaAuth, string> = {
  login: "/login",
  cadastro: "/cadastro",
  recuperacao: "/recuperarsenha",
  "nova-senha": "/novasenha",
  "confirmacao-email": "/confirmaremail"
};

const titulosPorRota: Record<string, string> = {
  "/login": "Login | GeoCampo",
  "/cadastro": "Cadastro | GeoCampo",
  "/confirmaremail": "Confirmar e-mail | GeoCampo",
  "/recuperarsenha": "Recuperar senha | GeoCampo",
  "/novasenha": "Nova senha | GeoCampo",
  "/completarcadastro": "Completar cadastro | GeoCampo",
  "/home": "Home | GeoCampo"
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
  return ["/home", "/completarcadastro", "/configuracoes/conta"].includes(normalizarCaminho(caminho).toLowerCase());
}

function atualizarTitulo(caminho: string) {
  document.title = titulosPorRota[normalizarCaminho(caminho).toLowerCase()] ?? "GeoCampo";
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
  return "login";
}

function detectarMensagemLogin(): string | null {
  return null;
}

function rotaConfirmacaoCadastro(): boolean {
  const caminho = caminhoAtual().toLowerCase();
  const parametros = new URLSearchParams(window.location.search);
  return caminho === "/confirmaremail" || parametros.get("cadastro") === "confirmado" || parametros.get("tipo") === "cadastro";
}

function urlTemRespostaAutenticacao(): boolean {
  const parametros = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const parametrosHash = new URLSearchParams(hash);

  return Boolean(
    parametros.get("code") ||
      parametros.get("token_hash") ||
      parametrosHash.get("access_token") ||
      parametrosHash.get("refresh_token")
  );
}

function mensagemEmailConfirmado(email?: string | null): string {
  const emailTratado = String(email ?? "").trim();
  return emailTratado
    ? `E-mail ${emailTratado} confirmado. Entre com seu e-mail e senha para acessar o sistema.`
    : "E-mail confirmado. Entre com seu e-mail e senha para acessar o sistema.";
}

function AuthShell({ children, cadastro, aoClicarMarca }: { children: ReactNode; cadastro?: boolean; aoClicarMarca?: () => void }) {
  const conteudoMarca = (
    <>
      <img src={logoCurvaNivel} alt="Logo GeoCampo" />
      <div>
        <strong>GeoCampo</strong>
        <span>Topografia, irrigação e engenharia.</span>
      </div>
    </>
  );

  return (
    <main className="auth-pagina">
      <section className={cadastro ? "auth-card auth-card-cadastro" : "auth-card"}>
        {aoClicarMarca ? (
          <button type="button" className="auth-marca auth-marca-botao" onClick={aoClicarMarca} aria-label="Voltar para o login">
            {conteudoMarca}
          </button>
        ) : (
          <div className="auth-marca">{conteudoMarca}</div>
        )}
        <div className="auth-layout">
          <section className="auth-painel-formulario">{children}</section>
          <Suspense fallback={null}>
            <AuthTerrainPanel />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function CarregandoTelaAuth() {
  return <div className="auth-feedback">Carregando...</div>;
}

function AutenticacaoIndisponivel() {
  return (
    <AuthShell>
      <div className="auth-configuracao">
        <strong>Configuração pendente</strong>
        <span>Configure as credenciais do banco de dados para liberar o acesso.</span>
      </div>
    </AuthShell>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { carregando, configurado, usuario, emailVerificado, perfilPendente, erroInicializacao, recarregarPerfil, tentarNovamente } = useAuth();
  const [tela, setTela] = useState<TelaAuth>(() => detectarTelaInicial());
  const [mensagemUrl, setMensagemUrl] = useState<string | null>(() => detectarErroUrl());
  const [avisoLogin, setAvisoLogin] = useState<string | null>(() => mensagemUrl ? null : detectarMensagemLogin());
  const [emailConfirmacao, setEmailConfirmacao] = useState<string | null>(() => obterEmailConfirmacaoPendente());
  const [modoConfirmacao, setModoConfirmacao] = useState<"app" | "native">(() => obterDesafioEmailAppPendente() ? "app" : "native");
  const [desafioEmailApp, setDesafioEmailApp] = useState(() => obterDesafioEmailAppPendente());
  const [avisoConfirmacao, setAvisoConfirmacao] = useState<string | null>(null);
  const [finalizandoConfirmacaoEmail, setFinalizandoConfirmacaoEmail] = useState(false);
  const resetandoSenha = useMemo(() => tela === "nova-senha", [tela]);
  const navegarAuth = useCallback((proximaTela: TelaAuth, substituir = false) => {
    setTela(proximaTela);
    atualizarUrl(rotasPorTela[proximaTela], substituir);
    atualizarTitulo(rotasPorTela[proximaTela]);
  }, []);
  const voltarParaLogin = useCallback(() => {
    setMensagemUrl(null);
    setAvisoLogin(null);
    if (usuario) {
      void sair()
        .catch(() => undefined)
        .finally(() => navegarAuth("login", true));
      return;
    }
    navegarAuth("login");
  }, [navegarAuth, usuario]);

  useEffect(() => {
    const aoVoltar = () => {
      const erroUrl = detectarErroUrl();
      const telaUrl = detectarTelaInicial();
      setTela(telaUrl);
      setMensagemUrl(erroUrl);
      setAvisoLogin(erroUrl ? null : detectarMensagemLogin());
      setEmailConfirmacao(obterEmailConfirmacaoPendente());
      setDesafioEmailApp(obterDesafioEmailAppPendente());
      atualizarTitulo(window.location.pathname);
    };

    window.addEventListener("popstate", aoVoltar);
    atualizarTitulo(window.location.pathname);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    if (carregando || !configurado) return;

    const caminho = caminhoAtual().toLowerCase();
    const rotaConfirmacao = rotaConfirmacaoCadastro();
    const confirmacaoEmail = rotaConfirmacao && urlTemRespostaAutenticacao();

    if (usuario && resetandoSenha) {
      atualizarUrl(rotasPorTela["nova-senha"], true);
      atualizarTitulo(rotasPorTela["nova-senha"]);
      return;
    }

    if (usuario && confirmacaoEmail) {
      setFinalizandoConfirmacaoEmail(true);
      limparConfirmacaoPendente();
      void sair().finally(() => {
        setFinalizandoConfirmacaoEmail(false);
        setTela("login");
        setMensagemUrl(null);
        setAvisoLogin(mensagemEmailConfirmado(usuario.email));
        atualizarUrl("/login", true);
        atualizarTitulo("/login");
      });
      return;
    }

    if (!usuario && rotaConfirmacao && urlTemRespostaAutenticacao()) {
      setAvisoLogin(null);
      if (!mensagemUrl) {
        setMensagemUrl("Não foi possível confirmar este e-mail automaticamente. Use o código recebido por e-mail ou solicite um novo código.");
      }
      setTela("confirmacao-email");
      atualizarUrl("/confirmaremail", true);
      atualizarTitulo("/confirmaremail");
      return;
    }

    if (usuario && !emailVerificado && !resetandoSenha) {
      setTela("confirmacao-email");
      setEmailConfirmacao(usuario.email ?? obterEmailConfirmacaoPendente());
      setModoConfirmacao("app");
      if (!avisoConfirmacao) {
        setAvisoConfirmacao("Seu e-mail ainda não foi confirmado. Digite o código enviado para ativar sua conta.");
      }
      atualizarUrl("/confirmaremail", true);
      atualizarTitulo("/confirmaremail");
      return;
    }

    if (usuario && caminho === "/confirmaremail") {
      setTela("confirmacao-email");
      atualizarTitulo("/confirmaremail");
      return;
    }

    if (usuario) {
      atualizarUrl("/home", true);
      atualizarTitulo("/home");
      return;
    }

    if (caminho === "/confirmaremail") {
      setTela("confirmacao-email");
      atualizarTitulo("/confirmaremail");
      return;
    }

    if (caminho === "/" || caminhoProtegido(caminho)) {
      navegarAuth("login", true);
    }
  }, [avisoConfirmacao, carregando, configurado, emailVerificado, mensagemUrl, navegarAuth, resetandoSenha, usuario]);

  if (carregando || finalizandoConfirmacaoEmail) {
    return <CarregamentoInicial />;
  }

  if (erroInicializacao) {
    return (
      <AuthShell aoClicarMarca={voltarParaLogin}>
        <div className="auth-configuracao">
          <strong>Não foi possível iniciar o aplicativo</strong>
          <span>{erroInicializacao}</span>
          <button type="button" onClick={tentarNovamente}>Tentar novamente</button>
        </div>
      </AuthShell>
    );
  }

  if (!configurado) {
    return <AutenticacaoIndisponivel />;
  }

  if (usuario && resetandoSenha) {
    return (
      <AuthShell aoClicarMarca={voltarParaLogin}>
        <Suspense fallback={<CarregandoTelaAuth />}>
          <ResetPasswordPage aoConcluir={() => navegarAuth("login", true)} />
        </Suspense>
      </AuthShell>
    );
  }

  if (usuario && !emailVerificado && !resetandoSenha) {
    return (
      <AuthShell cadastro aoClicarMarca={voltarParaLogin}>
        <Suspense fallback={<CarregandoTelaAuth />}>
          <ConfirmEmailPage
            email={emailConfirmacao ?? usuario.email ?? desafioEmailApp?.email ?? null}
            modo="app"
            purpose={desafioEmailApp?.purpose ?? "signup_email"}
            challengeId={desafioEmailApp?.challengeId ?? null}
            destinationMasked={desafioEmailApp?.destinationMasked ?? null}
            avisoInicial={avisoConfirmacao ?? "Seu e-mail ainda não foi confirmado. Digite o código enviado para ativar sua conta."}
            aoEmailDefinido={(email) => setEmailConfirmacao(email)}
            aoConfirmado={() => {
              limparConfirmacaoPendente();
              setDesafioEmailApp(null);
              setAvisoConfirmacao(null);
              void recarregarPerfil().finally(() => {
                atualizarUrl("/home", true);
                atualizarTitulo("/home");
                setTela("login");
              });
            }}
            aoVoltarCadastro={() => navegarAuth("cadastro")}
          />
        </Suspense>
      </AuthShell>
    );
  }

  if (usuario && tela === "confirmacao-email") {
    return (
      <AuthShell cadastro aoClicarMarca={voltarParaLogin}>
        <Suspense fallback={<CarregandoTelaAuth />}>
          <ConfirmEmailPage
            email={emailConfirmacao ?? usuario.email ?? desafioEmailApp?.email ?? null}
            modo={modoConfirmacao}
            purpose={desafioEmailApp?.purpose ?? "signup_email"}
            challengeId={desafioEmailApp?.challengeId ?? null}
            destinationMasked={desafioEmailApp?.destinationMasked ?? null}
            avisoInicial={avisoConfirmacao}
            aoEmailDefinido={(email) => setEmailConfirmacao(email)}
            aoConfirmado={() => {
              limparConfirmacaoPendente();
              setDesafioEmailApp(null);
              setAvisoConfirmacao(null);
              void recarregarPerfil().finally(() => {
                atualizarUrl("/home", true);
                atualizarTitulo("/home");
                setTela("login");
              });
            }}
            aoVoltarCadastro={() => navegarAuth("cadastro")}
          />
        </Suspense>
      </AuthShell>
    );
  }

  if (usuario && emailVerificado && perfilPendente) {
    return (
      <AuthShell cadastro aoClicarMarca={voltarParaLogin}>
        <Suspense fallback={<CarregandoTelaAuth />}>
          <CompleteProfilePage />
        </Suspense>
      </AuthShell>
    );
  }

  if (usuario) {
    return <AuthErrorBoundary>{children}</AuthErrorBoundary>;
  }

  return (
    <AuthShell cadastro={tela === "cadastro" || tela === "confirmacao-email"} aoClicarMarca={voltarParaLogin}>
      {mensagemUrl && (
        <div className="auth-feedback erro" role="alert">
          {mensagemUrl}
        </div>
      )}
      {tela === "login" && (
        <LoginPage
          aviso={avisoLogin}
          aoCriarConta={() => {
            setMensagemUrl(null);
            setAvisoLogin(null);
            navegarAuth("cadastro");
          }}
          aoRecuperarSenha={() => navegarAuth("recuperacao")}
        />
      )}
      {tela !== "login" && (
        <Suspense fallback={<CarregandoTelaAuth />}>
          {tela === "cadastro" && (
            <RegisterPage
              aoEntrar={() => navegarAuth("login")}
              aoConfirmacaoNecessaria={(email, dados) => {
                setEmailConfirmacao(email);
                setModoConfirmacao(dados?.modo ?? "native");
                setDesafioEmailApp(dados?.modo === "app" ? {
                  email,
                  challengeId: dados.challengeId ?? null,
                  destinationMasked: dados.destinationMasked ?? null,
                  purpose: "signup_email",
                  criadoEm: Date.now()
                } : null);
                setAvisoConfirmacao(dados?.envioErro ?? null);
                setMensagemUrl(null);
                setAvisoLogin(null);
                navegarAuth("confirmacao-email");
              }}
            />
          )}
          {tela === "confirmacao-email" && (
            <ConfirmEmailPage
              email={emailConfirmacao}
              modo={modoConfirmacao}
              purpose={desafioEmailApp?.purpose ?? "signup_email"}
              challengeId={desafioEmailApp?.challengeId ?? null}
              destinationMasked={desafioEmailApp?.destinationMasked ?? null}
              avisoInicial={avisoConfirmacao}
              aoEmailDefinido={(email) => setEmailConfirmacao(email)}
              aoConfirmado={() => {
                const emailConfirmado = emailConfirmacao;
                setFinalizandoConfirmacaoEmail(true);
                limparConfirmacaoPendente();
                setEmailConfirmacao(null);
                void sair()
                  .catch(() => undefined)
                  .finally(() => {
                    setFinalizandoConfirmacaoEmail(false);
                    setMensagemUrl(null);
                    setAvisoLogin(mensagemEmailConfirmado(emailConfirmado));
                    navegarAuth("login", true);
                  });
              }}
              aoVoltarCadastro={() => navegarAuth("cadastro")}
            />
          )}
          {tela === "recuperacao" && <ForgotPasswordPage aoEntrar={() => navegarAuth("login")} />}
          {tela === "nova-senha" && (
            <LoginPage aoCriarConta={() => navegarAuth("cadastro")} aoRecuperarSenha={() => navegarAuth("recuperacao")} />
          )}
        </Suspense>
      )}
    </AuthShell>
  );
}
