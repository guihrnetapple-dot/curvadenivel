import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { obterUsuarioAutenticado } from "../_shared/auth.ts";
import { enviarCodigoEmail } from "../_shared/emailProvider.ts";
import { obterNumeroEnv } from "../_shared/env.ts";
import { gerarCodigoOtp, criarDigestCodigo, criarHashDestino, criarHashIp } from "../_shared/otp.ts";
import { ErroHttp, criarRequestId, responderErro, responderJson, responderOptions } from "../_shared/responses.ts";
import { chamarRpc } from "../_shared/supabaseRest.ts";
import { mascararEmail, normalizarEmail, obterIp } from "../_shared/validation.ts";

interface DesafioCriado {
  id: string;
  expires_at: string;
  resend_available_at: string;
}

function obterPurpose(corpo: Record<string, unknown>): "signup_email" | "verify_current_email" {
  const purpose = String(corpo.purpose ?? "signup_email");
  if (purpose === "signup_email" || purpose === "verify_current_email") {
    return purpose;
  }
  throw new ErroHttp("INVALID_REQUEST", "Solicitação inválida.", 400);
}

Deno.serve(async (requisicao) => {
  const requestId = criarRequestId();
  try {
    if (requisicao.method === "OPTIONS") return responderOptions(requisicao);
    if (requisicao.method !== "POST") {
      return responderJson(requisicao, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Método não permitido.", requestId });
    }

    const usuario = await obterUsuarioAutenticado(requisicao);
    const email = normalizarEmail(usuario.email);
    const corpo = (await requisicao.json().catch(() => ({}))) as Record<string, unknown>;
    const purpose = obterPurpose(corpo);
    const codigo = gerarCodigoOtp();
    const ttlSeconds = obterNumeroEnv("OTP_TTL_SECONDS", 600);
    const resendSeconds = obterNumeroEnv("OTP_RESEND_SECONDS", 60);
    const maxAttempts = obterNumeroEnv("OTP_MAX_ATTEMPTS", 5);
    const destinationHash = await criarHashDestino(email);
    const requestIpHash = await criarHashIp(obterIp(requisicao));
    const challengeId = crypto.randomUUID();
    const codeDigest = await criarDigestCodigo(challengeId, usuario.id, purpose, codigo);

    const [desafio] = await chamarRpc<DesafioCriado[]>("criar_desafio_verificacao_email", {
      p_challenge_id: challengeId,
      p_user_id: usuario.id,
      p_purpose: purpose,
      p_destination: email,
      p_destination_hash: destinationHash,
      p_code_digest: codeDigest,
      p_ttl_seconds: ttlSeconds,
      p_resend_seconds: resendSeconds,
      p_max_attempts: maxAttempts,
      p_request_ip_hash: requestIpHash,
      p_user_agent: requisicao.headers.get("user-agent")
    });

    if (!desafio?.id) {
      throw new ErroHttp("BACKEND_ERROR", "Não foi possível gerar o código.", 503);
    }

    const idDesafio = desafio.id;
    let providerMessageId: string | null = null;
    try {
      providerMessageId = await enviarCodigoEmail({ destino: email, codigo });
    } catch (erro) {
      await chamarRpc("atualizar_entrega_desafio_verificacao", {
        p_challenge_id: idDesafio,
        p_user_id: usuario.id,
        p_status: "failed",
        p_provider_message_id: null
      }).catch(() => undefined);
      throw erro;
    }

    await chamarRpc("atualizar_entrega_desafio_verificacao", {
      p_challenge_id: idDesafio,
      p_user_id: usuario.id,
      p_status: "delivered",
      p_provider_message_id: providerMessageId
    });

    return responderJson(requisicao, 200, {
      ok: true,
      challengeId: idDesafio,
      destinationMasked: mascararEmail(email),
      expiresInSeconds: ttlSeconds,
      resendAvailableInSeconds: resendSeconds,
      requestId
    });
  } catch (erro) {
    return responderErro(requisicao, requestId, erro);
  }
});
