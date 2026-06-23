import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  confirmarEmailComCodigo,
  marcarUltimoReenvioConfirmacao,
  obterUltimoReenvioConfirmacao,
  reenviarCodigoConfirmacao,
  salvarConfirmacaoPendente,
  salvarDesafioEmailAppPendente
} from "../../servicos/authService";
import {
  type PropositoEmail,
  solicitarCodigoEmailAtual,
  traduzirErroVerificacao,
  validarCodigoEmail
} from "../../servicos/verificationService";
import { normalizarEmail, traduzirErroAuth, validarEmail } from "../../utilitarios/validacaoAuthBasica";

interface Props {
  email?: string | null;
  modo?: "app" | "native";
  purpose?: PropositoEmail;
  challengeId?: string | null;
  destinationMasked?: string | null;
  avisoInicial?: string | null;
  aoEmailDefinido: (email: string) => void;
  aoConfirmado: () => void;
  aoVoltarCadastro: () => void;
}

function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return email;
  const inicio = usuario.slice(0, 2);
  return `${inicio}${"*".repeat(Math.max(usuario.length - 2, 3))}@${dominio}`;
}

export function ConfirmEmailPage({
  email,
  modo = "native",
  purpose = "signup_email",
  challengeId,
  destinationMasked,
  avisoInicial,
  aoEmailDefinido,
  aoConfirmado,
  aoVoltarCadastro
}: Props) {
  const [emailDigitado, setEmailDigitado] = useState(email ?? "");
  const [emailConfirmacao, setEmailConfirmacao] = useState(email ?? "");
  const [desafioId, setDesafioId] = useState(challengeId ?? null);
  const [destinoMascarado, setDestinoMascarado] = useState(destinationMasked ?? null);
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(avisoInicial ?? null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const emailMascarado = useMemo(
    () => destinoMascarado || (emailConfirmacao ? mascararEmail(emailConfirmacao) : ""),
    [destinoMascarado, emailConfirmacao]
  );
  const segundosRestantes = Math.max(0, Math.ceil((obterUltimoReenvioConfirmacao() + 60000 - agora) / 1000));

  useEffect(() => {
    if (!email) return;
    setEmailDigitado(email);
    setEmailConfirmacao(email);
  }, [email]);

  useEffect(() => {
    setDesafioId(challengeId ?? null);
  }, [challengeId]);

  useEffect(() => {
    setDestinoMascarado(destinationMasked ?? null);
  }, [destinationMasked]);

  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);

  function alterarCodigo(valor: string) {
    setCodigo(valor.replace(/\D/g, "").slice(0, 6));
  }

  function traduzirErroCodigo(erro: unknown): string {
    const registro = erro as { code?: string; status?: number; message?: string };
    const codigoErro = String(registro?.code ?? "").toLowerCase();
    const mensagemErro = String(registro?.message ?? "").toLowerCase();

    if (registro?.status === 429 || codigoErro.includes("rate") || mensagemErro.includes("rate") || mensagemErro.includes("too many")) {
      return "Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.";
    }
    if (codigoErro.includes("expired") || mensagemErro.includes("expired") || mensagemErro.includes("expir")) {
      return "Código expirado. Solicite um novo código e tente novamente.";
    }
    if (codigoErro.includes("invalid") || mensagemErro.includes("invalid") || mensagemErro.includes("inválido") || mensagemErro.includes("invalido")) {
      return "Código inválido. Verifique os 6 dígitos enviados por e-mail e tente novamente.";
    }

    return modo === "app" ? traduzirErroVerificacao(erro) : traduzirErroAuth(erro);
  }

  async function solicitarCodigoApp() {
    if (segundosRestantes > 0) {
      setMensagem(`Aguarde ${segundosRestantes}s para solicitar outro código.`);
      return;
    }

    setMensagem(null);
    setSucesso(null);
    setCarregando(true);
    try {
      const resultado = await solicitarCodigoEmailAtual(purpose);
      setDesafioId(resultado.challengeId);
      setDestinoMascarado(resultado.destinationMasked);
      if (emailConfirmacao) {
        salvarDesafioEmailAppPendente(emailConfirmacao, resultado.challengeId, resultado.destinationMasked, purpose);
      }
      marcarUltimoReenvioConfirmacao();
      setAgora(Date.now());
      setSucesso("Enviamos um novo código para seu e-mail.");
    } catch (erro) {
      setMensagem(traduzirErroCodigo(erro));
    } finally {
      setCarregando(false);
    }
  }

  async function definirEmailParaConfirmacao(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    setSucesso(null);

    const emailNormalizado = normalizarEmail(emailDigitado);
    const erroEmail = validarEmail(emailNormalizado);
    if (erroEmail) {
      setMensagem(erroEmail);
      return;
    }

    if (segundosRestantes > 0) {
      setMensagem(`Aguarde ${segundosRestantes}s para solicitar outro código.`);
      return;
    }

    setCarregando(true);
    try {
      await reenviarCodigoConfirmacao(emailNormalizado);
      salvarConfirmacaoPendente(emailNormalizado);
      setEmailConfirmacao(emailNormalizado);
      aoEmailDefinido(emailNormalizado);
      setAgora(Date.now());
      setSucesso("Enviamos um código de confirmação para seu e-mail.");
    } catch (erro) {
      setMensagem(traduzirErroCodigo(erro));
    } finally {
      setCarregando(false);
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    setSucesso(null);

    if (modo === "native" && !emailConfirmacao) {
      await definirEmailParaConfirmacao(evento);
      return;
    }

    if (codigo.length !== 6) {
      setMensagem("Informe o código de 6 dígitos.");
      return;
    }

    if (modo === "app" && !desafioId) {
      setMensagem("Solicite um novo código antes de continuar.");
      return;
    }

    setCarregando(true);
    try {
      if (modo === "app") {
        await validarCodigoEmail(desafioId!, codigo, purpose);
      } else {
        await confirmarEmailComCodigo(emailConfirmacao, codigo);
      }
      aoConfirmado();
    } catch (erro) {
      setMensagem(traduzirErroCodigo(erro));
    } finally {
      setCarregando(false);
    }
  }

  async function reenviar() {
    if (modo === "app") {
      await solicitarCodigoApp();
      return;
    }

    if (!emailConfirmacao || segundosRestantes > 0) return;
    setMensagem(null);
    setSucesso(null);
    setCarregando(true);
    try {
      await reenviarCodigoConfirmacao(emailConfirmacao);
      setAgora(Date.now());
      setSucesso("Enviamos um novo código para seu e-mail.");
    } catch (erro) {
      setMensagem(traduzirErroCodigo(erro));
    } finally {
      setCarregando(false);
    }
  }

  if (modo === "native" && !emailConfirmacao) {
    return (
      <form className="auth-formulario auth-confirmacao-email" onSubmit={definirEmailParaConfirmacao} noValidate>
        <div className="auth-formulario-topo">
          <strong>Confirme seu e-mail</strong>
          <span>Enviamos um código de confirmação para seu e-mail. Digite o código abaixo para ativar sua conta.</span>
        </div>

        {mensagem && <div className="auth-feedback erro" role="alert">{mensagem}</div>}
        {sucesso && <div className="auth-feedback sucesso" role="status">{sucesso}</div>}

        <label>
          E-mail cadastrado
          <input
            value={emailDigitado}
            onChange={(evento) => setEmailDigitado(evento.target.value)}
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(mensagem)}
          />
        </label>

        <button type="submit" disabled={carregando || segundosRestantes > 0}>
          {carregando ? "Enviando..." : segundosRestantes > 0 ? `Reenviar código em ${segundosRestantes}s` : "Reenviar código"}
        </button>
        <button className="auth-botao-secundario" type="button" onClick={aoVoltarCadastro} disabled={carregando}>
          Voltar ao cadastro
        </button>
      </form>
    );
  }

  return (
    <form className="auth-formulario auth-confirmacao-email" onSubmit={enviar} noValidate>
      <div className="auth-formulario-topo">
        <strong>Confirme seu e-mail</strong>
        <span>
          {emailMascarado
            ? `Enviamos um código de confirmação para ${emailMascarado}. Digite o código abaixo para ativar sua conta.`
            : "Enviamos um código de confirmação para seu e-mail. Digite o código abaixo para ativar sua conta."}
        </span>
      </div>

      {mensagem && <div className="auth-feedback erro" role="alert">{mensagem}</div>}
      {sucesso && <div className="auth-feedback sucesso" role="status">{sucesso}</div>}

      <label>
        Código de confirmação
        <input
          className="auth-codigo-otp"
          value={codigo}
          onChange={(evento) => alterarCodigo(evento.target.value)}
          onPaste={(evento) => {
            evento.preventDefault();
            alterarCodigo(evento.clipboardData.getData("text"));
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-invalid={Boolean(mensagem)}
        />
      </label>

      <button type="submit" disabled={carregando || (modo === "app" && !desafioId)}>
        {carregando ? "Confirmando..." : "Confirmar código"}
      </button>
      <button className="auth-botao-secundario" type="button" onClick={reenviar} disabled={carregando || segundosRestantes > 0}>
        {segundosRestantes > 0 ? `Reenviar código em ${segundosRestantes}s` : "Reenviar código"}
      </button>
      {modo === "native" && (
        <button
          className="auth-botao-secundario"
          type="button"
          onClick={() => {
            setEmailConfirmacao("");
            setCodigo("");
            setMensagem(null);
            setSucesso(null);
          }}
          disabled={carregando}
        >
          Usar outro e-mail
        </button>
      )}
    </form>
  );
}
