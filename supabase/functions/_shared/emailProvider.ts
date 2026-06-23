import { obterEnvObrigatoria } from "./env.ts";
import { ErroHttp } from "./responses.ts";

interface EnviarCodigoEmailParams {
  destino: string;
  codigo: string;
}

function criarHtml(codigo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#0f1822;color:#f8fafc;font-family:Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px">
      <h1 style="margin:0 0 12px;font-size:24px">Confirme seu e-mail</h1>
      <p style="margin:0 0 20px;color:#cfe3f5">Use o código abaixo para confirmar seu e-mail no GeoCampo.</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#6ee7b7">${codigo}</p>
      <p style="margin:0;color:#cfe3f5">O código expira em 10 minutos e pode ser usado uma única vez.</p>
      <p style="margin:16px 0 0;color:#9fb4c7">Se você não solicitou esta ação, ignore esta mensagem.</p>
    </div>
  </body>
</html>`;
}

function criarTexto(codigo: string): string {
  return [
    "Confirme seu e-mail",
    "",
    "Use o código abaixo para confirmar seu e-mail no GeoCampo:",
    "",
    codigo,
    "",
    "O código expira em 10 minutos e pode ser usado uma única vez.",
    "Se você não solicitou esta ação, ignore esta mensagem."
  ].join("\n");
}

export async function enviarCodigoEmail({ destino, codigo }: EnviarCodigoEmailParams): Promise<string | null> {
  const provedor = Deno.env.get("EMAIL_PROVIDER")?.trim().toLowerCase();
  if (provedor !== "resend") {
    throw new ErroHttp("DELIVERY_FAILED", "Envio de e-mail ainda não configurado.", 503);
  }

  const apiKey = obterEnvObrigatoria("RESEND_API_KEY");
  const from = obterEnvObrigatoria("EMAIL_FROM");
  const fromName = Deno.env.get("EMAIL_FROM_NAME")?.trim() || "GeoCampo";
  const replyTo = Deno.env.get("EMAIL_REPLY_TO")?.trim();

  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `${fromName} <${from}>`,
      to: [destino],
      reply_to: replyTo || undefined,
      subject: "Seu código de confirmação - GeoCampo",
      html: criarHtml(codigo),
      text: criarTexto(codigo)
    })
  });

  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroHttp("DELIVERY_FAILED", "Não foi possível enviar o código agora.", 503);
  }

  return typeof json?.id === "string" ? json.id : null;
}

