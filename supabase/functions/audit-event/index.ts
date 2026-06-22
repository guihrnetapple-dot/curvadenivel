const ORIGENS_PERMITIDAS = new Set([
  "https://curvadenivel-fbhse7xcb-guilherme-franklin.vercel.app",
  "https://curvadenivel-git-security-auth-open-e-b8bccc-guilherme-franklin.vercel.app",
  "https://curvadenivel.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function origemPermitida(origem: string) {
  return ORIGENS_PERMITIDAS.has(origem) || /^https:\/\/curvadenivel-[a-z0-9-]+-guilherme-franklin\.vercel\.app$/.test(origem);
}

function criarCabecalhosCors(requisicao: Request): HeadersInit {
  const origem = requisicao.headers.get("origin") ?? "";
  const cabecalhos: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin"
  };

  if (origemPermitida(origem)) {
    cabecalhos["Access-Control-Allow-Origin"] = origem;
  }

  return cabecalhos;
}

const CABECALHOS_JSON = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store"
};
const NOME_CHAVE_SERVICO = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");

class ErroAplicacao extends Error {
  status: number;

  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

function responder(requisicao: Request, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CABECALHOS_JSON,
      ...criarCabecalhosCors(requisicao)
    }
  });
}

function obterVariavelObrigatoria(nome: string): string {
  const valor = Deno.env.get(nome)?.trim();
  if (!valor) {
    throw new ErroAplicacao(`${nome} não configurado.`, 503);
  }
  return valor;
}

function normalizarTexto(valor: unknown, limite = 500): string | null {
  const texto = String(valor ?? "").trim();
  return texto ? texto.slice(0, limite) : null;
}

function normalizarEmail(valor: unknown): string | null {
  const email = normalizarTexto(valor, 320)?.toLowerCase() ?? null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function obterIp(requisicao: Request): string | null {
  const cabecalhos = [
    requisicao.headers.get("x-forwarded-for")?.split(",")[0],
    requisicao.headers.get("x-real-ip"),
    requisicao.headers.get("cf-connecting-ip")
  ];

  return cabecalhos.map((item) => item?.trim()).find(Boolean) ?? null;
}

async function obterUsuario(token: string | null) {
  if (!token) return null;

  const supabaseUrl = obterVariavelObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
  const chaveServico = obterVariavelObrigatoria(NOME_CHAVE_SERVICO);
  const resposta = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: chaveServico,
      Authorization: `Bearer ${token}`
    }
  });

  if (!resposta.ok) return null;
  const usuario = await resposta.json().catch(() => null);
  return usuario && typeof usuario.id === "string" ? usuario as { id: string; email?: string } : null;
}

function extrairBearer(requisicao: Request): string | null {
  const valor = requisicao.headers.get("authorization") ?? "";
  const partes = valor.trim().split(/\s+/);
  return partes.length === 2 && partes[0] === "Bearer" && partes[1] ? partes[1] : null;
}

function normalizarObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
}

function normalizarListaTexto(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => normalizarTexto(item, 50)).filter((item): item is string => Boolean(item)).slice(0, 10);
}

async function salvarEvento(requisicao: Request, corpo: Record<string, unknown>, usuario: { id: string; email?: string } | null) {
  const supabaseUrl = obterVariavelObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
  const chaveServico = obterVariavelObrigatoria(NOME_CHAVE_SERVICO);
  const tipoEvento = normalizarTexto(corpo.event_type, 80);
  if (!tipoEvento) {
    throw new ErroAplicacao("Tipo de evento obrigatório.");
  }

  const payload = {
    user_id: usuario?.id ?? null,
    email: usuario?.email ?? normalizarEmail(corpo.email),
    event_type: tipoEvento,
    ip: obterIp(requisicao),
    user_agent: requisicao.headers.get("user-agent"),
    origin: requisicao.headers.get("origin"),
    referer: requisicao.headers.get("referer"),
    path: normalizarTexto(corpo.path, 300),
    timezone: normalizarTexto(corpo.timezone, 80),
    language: normalizarTexto(corpo.language, 40),
    languages: normalizarListaTexto(corpo.languages),
    platform: normalizarTexto(corpo.platform, 100),
    screen: normalizarObjeto(corpo.screen),
    viewport: normalizarObjeto(corpo.viewport),
    user_agent_data: normalizarObjeto(corpo.user_agent_data),
    metadata: normalizarObjeto(corpo.metadata)
  };

  const resposta = await fetch(`${supabaseUrl}/rest/v1/audit_events`, {
    method: "POST",
    headers: {
      apikey: chaveServico,
      Authorization: `Bearer ${chaveServico}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!resposta.ok) {
    throw new ErroAplicacao("Não foi possível registrar auditoria.", 503);
  }
}

Deno.serve(async (requisicao) => {
  try {
    if (requisicao.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: criarCabecalhosCors(requisicao)
      });
    }

    if (requisicao.method !== "POST") {
      return responder(requisicao, 405, { erro: "Método não permitido." });
    }

    const corpo = normalizarObjeto(await requisicao.json().catch(() => null));
    const usuario = await obterUsuario(extrairBearer(requisicao));
    await salvarEvento(requisicao, corpo, usuario);
    return responder(requisicao, 200, { ok: true });
  } catch (erro) {
    const status = erro instanceof ErroAplicacao ? erro.status : 500;
    if (!(erro instanceof ErroAplicacao)) {
      console.error("Erro inesperado ao registrar auditoria:", erro);
    }
    return responder(requisicao, status, { erro: erro instanceof ErroAplicacao ? erro.message : "Erro interno ao registrar auditoria." });
  }
});
