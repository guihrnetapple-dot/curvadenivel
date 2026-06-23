import { obterSupabase } from "../lib/supabaseClient";

export type PropositoEmail = "signup_email" | "verify_current_email";

export interface ResultadoSolicitacaoEmail {
  challengeId: string;
  destinationMasked: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export interface ResultadoVerificacaoEmail {
  verifiedAt: string;
  verifiedEmail: string;
}

interface RespostaErroVerificacao {
  code?: string;
  message?: string;
}

const mensagensPorCodigo: Record<string, string> = {
  AUTH_REQUIRED: "Entre novamente para continuar.",
  INVALID_REQUEST: "Revise os dados informados e tente novamente.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  OTP_COOLDOWN: "Aguarde um pouco antes de solicitar outro código.",
  OTP_RATE_LIMITED: "Muitas solicitações em pouco tempo. Tente novamente mais tarde.",
  OTP_INVALID: "Código inválido.",
  OTP_EXPIRED: "Código expirado. Solicite um novo código.",
  OTP_LOCKED: "Muitas tentativas incorretas. Solicite um novo código.",
  OTP_ALREADY_USED: "Este código já foi usado. Solicite um novo código se necessário.",
  DELIVERY_FAILED: "Não foi possível enviar o código agora. Tente novamente mais tarde.",
  PROVIDER_UNAVAILABLE: "Serviço de envio temporariamente indisponível.",
  ACCOUNT_UPDATE_FAILED: "Não foi possível atualizar sua conta agora."
};

export function traduzirErroVerificacao(erro: unknown): string {
  const contexto = erro as { context?: { json?: () => Promise<RespostaErroVerificacao> }; message?: string; code?: string };
  const codigo = String(contexto?.code ?? "").trim();
  if (codigo && mensagensPorCodigo[codigo]) return mensagensPorCodigo[codigo];
  return "Não foi possível concluir a verificação. Tente novamente.";
}

async function extrairErroFuncao(erro: unknown): Promise<Error> {
  const respostaErro = erro as { context?: { json?: () => Promise<RespostaErroVerificacao> } };
  const corpo = await respostaErro.context?.json?.().catch(() => null);
  const codigo = corpo?.code;
  const mensagem = codigo && mensagensPorCodigo[codigo] ? mensagensPorCodigo[codigo] : corpo?.message;
  const erroTratado = new Error(mensagem || "Não foi possível concluir a verificação.");
  (erroTratado as Error & { code?: string }).code = codigo;
  return erroTratado;
}

export async function solicitarCodigoEmailAtual(purpose: PropositoEmail = "signup_email"): Promise<ResultadoSolicitacaoEmail> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.functions.invoke("request-email-verification", {
    body: { purpose }
  });

  if (error) {
    throw await extrairErroFuncao(error);
  }

  const resposta = data as ResultadoSolicitacaoEmail | null;
  if (!resposta?.challengeId) {
    throw new Error("Não foi possível solicitar o código.");
  }
  return resposta;
}

export async function validarCodigoEmail(challengeId: string, code: string, purpose: PropositoEmail = "signup_email"): Promise<ResultadoVerificacaoEmail> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.functions.invoke("verify-email-code", {
    body: { challengeId, code, purpose }
  });

  if (error) {
    throw await extrairErroFuncao(error);
  }

  const resposta = data as ResultadoVerificacaoEmail | null;
  if (!resposta?.verifiedAt || !resposta.verifiedEmail) {
    throw new Error("Não foi possível confirmar o e-mail.");
  }
  return resposta;
}

