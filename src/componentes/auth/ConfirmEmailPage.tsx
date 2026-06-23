import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  confirmarEmailComCodigo,
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
import { normalizarEmail, traduzirErroAuth, validarEmail } from "../../utilitarios/validacaoAuth";

interface Props {
  email?: string | null;
  modo?: "app" | "native";
  purpose?: PropositoEmail;
  challengeId?: string | null;
  destinationMasked?: string | null;
  avisoInicial?: string | null;
  aoEmailDefinido: (email: string) => void;
  aoConfirmado: () => void;
  aoPular?: () => void;
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
  aoPular,
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

  async function solicitarCodigoApp() {
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
      setSucesso("Enviamos um novo código para seu e-mail.");
    } catch (erro) {
      setMensagem(traduzirErroVerificacao(erro));
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
      setMensagem(traduzirErroAuth(erro));
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
      setMensagem(modo === "app" ? traduzirErroVerificacao(erro) : traduzirErroAuth(erro));
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
      setMensagem(traduzirErroAuth(erro));
    } finally {
      setCarregando(false);
    }
  }

  if (modo === "native" && !emailConfirmacao) {
    return (
      <form className="auth-formulario auth-confirmacao-email" onSubmit={definirEmailParaConfirmacao} noValidate>
        <div className="auth-formulario-topo">
          <strong>Confirme seu e-mail</strong>
          <span>Informe o e-mail usado no cadastro para receber um código de confirmação.</span>
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
          {carregando ? "Enviando..." : segundosRestantes > 0 ? `Reenviar código em ${segundosRestantes}s` : "Enviar código"}
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
            ? `Digite o código de 6 dígitos enviado para ${emailMascarado}.`
            : "Solicite um código para confirmar seu e-mail."}
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
        {carregando ? "Confirmando..." : "Confirmar e continuar"}
      </button>
      <button className="auth-botao-secundario" type="button" onClick={reenviar} disabled={carregando || (modo === "native" && segundosRestantes > 0)}>
        {modo === "native" && segundosRestantes > 0 ? `Reenviar código em ${segundosRestantes}s` : "Reenviar código"}
      </button>
      {modo === "app" && aoPular && (
        <>
          <small>Você poderá confirmar o e-mail depois nas configurações da sua conta.</small>
          <button className="auth-botao-secundario" type="button" onClick={aoPular} disabled={carregando}>
            Fazer isso depois
          </button>
        </>
      )}
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
