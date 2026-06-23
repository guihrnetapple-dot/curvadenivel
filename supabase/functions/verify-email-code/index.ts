import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { obterUsuarioAutenticado } from "../_shared/auth.ts";
import { criarDigestCodigo } from "../_shared/otp.ts";
import { ErroHttp, criarRequestId, responderErro, responderJson, responderOptions } from "../_shared/responses.ts";
import { chamarRpc } from "../_shared/supabaseRest.ts";
import { validarCodigoOtp } from "../_shared/validation.ts";

interface ResultadoConsumo {
  ok: boolean;
  code: string;
  verified_at: string | null;
  destination: string | null;
}

function obterPurpose(valor: unknown): "signup_email" | "verify_current_email" {
  const purpose = String(valor ?? "signup_email");
  if (purpose === "signup_email" || purpose === "verify_current_email") {
    return purpose;
  }
  throw new ErroHttp("INVALID_REQUEST", "Solicitação inválida.", 400);
}

function mapearCodigo(codigo: string): ErroHttp {
  const mensagens: Record<string, [string, string, number]> = {
    OTP_INVALID: ["OTP_INVALID", "Código inválido.", 400],
    OTP_EXPIRED: ["OTP_EXPIRED", "Código expirado. Solicite um novo código.", 410],
    OTP_LOCKED: ["OTP_LOCKED", "Muitas tentativas incorretas. Solicite um novo código.", 423],
    OTP_ALREADY_USED: ["OTP_ALREADY_USED", "Este código já foi usado.", 409]
  };
  const [code, mensagem, status] = mensagens[codigo] ?? ["OTP_INVALID", "Código inválido.", 400];
  return new ErroHttp(code, mensagem, status);
}

Deno.serve(async (requisicao) => {
  const requestId = criarRequestId();
  try {
    if (requisicao.method === "OPTIONS") return responderOptions(requisicao);
    if (requisicao.method !== "POST") {
      return responderJson(requisicao, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Método não permitido.", requestId });
    }

    const usuario = await obterUsuarioAutenticado(requisicao);
    const corpo = (await requisicao.json().catch(() => ({}))) as Record<string, unknown>;
    const challengeId = String(corpo.challengeId ?? "");
    const purpose = obterPurpose(corpo.purpose);
    const codigo = validarCodigoOtp(corpo.code);

    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) {
      throw new ErroHttp("INVALID_REQUEST", "Solicitação inválida.", 400);
    }

    const codeDigest = await criarDigestCodigo(challengeId, usuario.id, purpose, codigo);
    const [resultado] = await chamarRpc<ResultadoConsumo[]>("consumir_desafio_verificacao", {
      p_challenge_id: challengeId,
      p_user_id: usuario.id,
      p_channel: "email",
      p_purpose: purpose,
      p_code_digest: codeDigest
    });

    if (!resultado?.ok) {
      throw mapearCodigo(resultado?.code ?? "OTP_INVALID");
    }

    if (!resultado.destination) {
      throw new ErroHttp("BACKEND_ERROR", "Não foi possível confirmar o e-mail.", 503);
    }

    const [conclusao] = await chamarRpc<Array<{ ok: boolean; email_verified_at: string; verified_email: string }>>(
      "concluir_desafio_verificacao_email",
      {
        p_challenge_id: challengeId,
        p_user_id: usuario.id,
        p_verified_email: resultado.destination
      }
    );

    if (!conclusao?.ok) {
      throw new ErroHttp("ACCOUNT_UPDATE_FAILED", "Não foi possível concluir a confirmação.", 503);
    }

    return responderJson(requisicao, 200, {
      ok: true,
      verifiedAt: conclusao.email_verified_at,
      verifiedEmail: conclusao.verified_email,
      requestId
    });
  } catch (erro) {
    return responderErro(requisicao, requestId, erro);
  }
});

