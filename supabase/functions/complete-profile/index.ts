const CABECALHOS_JSON = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store"
};

class ErroAplicacao extends Error {
  status: number;

  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

function responder(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: CABECALHOS_JSON
  });
}

function obterVariavelObrigatoria(nome: string): string {
  const valor = Deno.env.get(nome)?.trim();
  if (!valor) {
    throw new ErroAplicacao(`${nome} não configurado.`, 503);
  }
  return valor;
}

function extrairBearer(requisicao: Request): string {
  const valor = requisicao.headers.get("authorization") ?? "";
  const partes = valor.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
    throw new ErroAplicacao("Autenticação obrigatória.", 401);
  }
  return partes[1];
}

async function obterUsuario(token: string) {
  const supabaseUrl = obterVariavelObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = obterVariavelObrigatoria("SUPABASE_SERVICE_ROLE_KEY");
  const resposta = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!resposta.ok) {
    throw new ErroAplicacao("Autenticação inválida.", 401);
  }

  const usuario = await resposta.json().catch(() => null);
  if (!usuario || typeof usuario.id !== "string" || !usuario.id) {
    throw new ErroAplicacao("Autenticação inválida.", 401);
  }

  return usuario as { id: string };
}

function textoObrigatorio(corpo: Record<string, unknown>, chave: string): string {
  const valor = String(corpo[chave] ?? "").trim();
  if (!valor) {
    throw new ErroAplicacao("Preencha todos os campos obrigatórios.");
  }
  return valor;
}

function textoOpcional(corpo: Record<string, unknown>, chave: string): string | null {
  const valor = String(corpo[chave] ?? "").trim();
  return valor || null;
}

function validarPerfil(corpo: unknown) {
  if (!corpo || typeof corpo !== "object") {
    throw new ErroAplicacao("Dados de perfil inválidos.");
  }

  const registro = corpo as Record<string, unknown>;
  const whatsapp = textoObrigatorio(registro, "whatsapp").replace(/\D/g, "");
  if (!/^[0-9]{10,15}$/.test(whatsapp)) {
    throw new ErroAplicacao("Informe um WhatsApp válido.");
  }

  return {
    full_name: textoObrigatorio(registro, "full_name"),
    profession: textoObrigatorio(registro, "profession"),
    work_area: textoObrigatorio(registro, "work_area"),
    company_name: textoObrigatorio(registro, "company_name"),
    whatsapp,
    city: textoObrigatorio(registro, "city"),
    state: textoObrigatorio(registro, "state"),
    country: textoObrigatorio(registro, "country"),
    communication_consent_email: registro.communication_consent_email === true,
    communication_consent_whatsapp: registro.communication_consent_whatsapp === true,
    communication_consent_ip: textoOpcional(registro, "communication_consent_ip"),
    communication_consent_user_agent: textoOpcional(registro, "communication_consent_user_agent")
  };
}

async function chamarSupabase(caminho: string, opcoes: RequestInit = {}) {
  const supabaseUrl = obterVariavelObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = obterVariavelObrigatoria("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${supabaseUrl}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(opcoes.headers ?? {})
    }
  });
}

async function salvarPerfil(userId: string, perfil: ReturnType<typeof validarPerfil>) {
  const agora = new Date().toISOString();
  const resposta = await chamarSupabase("/rest/v1/profiles?on_conflict=id&select=*", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      id: userId,
      ...perfil,
      accepted_terms_at: agora,
      accepted_privacy_policy_at: agora,
      accepted_cookies_at: agora,
      accepted_free_use_communication_terms_at: agora
    })
  });

  if (!resposta.ok) {
    throw new ErroAplicacao("Não foi possível salvar o perfil.", 503);
  }

  const [registro] = await resposta.json().catch(() => []);
  if (!registro?.id) {
    throw new ErroAplicacao("Resposta inesperada ao salvar o perfil.", 502);
  }
  return registro;
}

async function registrarConsentimentos(userId: string, perfil: ReturnType<typeof validarPerfil>) {
  const eventos = [
    ["terms", true],
    ["privacy_policy", true],
    ["cookies", true],
    ["free_use_communication_terms", true],
    ["communication_email", perfil.communication_consent_email],
    ["communication_whatsapp", perfil.communication_consent_whatsapp]
  ] as const;

  const respostas = await Promise.all(
    eventos.map(([tipo, aceito]) =>
      chamarSupabase("/rest/v1/rpc/registrar_evento_consentimento", {
        method: "POST",
        body: JSON.stringify({
          p_user_id: userId,
          p_tipo_evento: tipo,
          p_aceito: aceito,
          p_ip: perfil.communication_consent_ip,
          p_user_agent: perfil.communication_consent_user_agent,
          p_metadados: {}
        })
      })
    )
  );

  if (respostas.some((resposta) => !resposta.ok)) {
    throw new ErroAplicacao("Não foi possível registrar os consentimentos.", 503);
  }
}

Deno.serve(async (requisicao) => {
  try {
    if (requisicao.method !== "POST") {
      return responder(405, { erro: "Método não permitido." });
    }

    const token = extrairBearer(requisicao);
    const usuario = await obterUsuario(token);
    const corpo = await requisicao.json().catch(() => null);
    const perfilValidado = validarPerfil(corpo);

    const perfil = await salvarPerfil(usuario.id, perfilValidado);
    await registrarConsentimentos(usuario.id, perfilValidado);

    return responder(200, { perfil });
  } catch (erro) {
    const status = erro instanceof ErroAplicacao ? erro.status : 500;
    if (!(erro instanceof ErroAplicacao)) {
      console.error("Erro inesperado ao completar perfil:", erro);
    }
    return responder(status, { erro: erro instanceof Error ? erro.message : "Erro interno ao completar perfil." });
  }
});
