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
  const chaveServico = obterVariavelObrigatoria(NOME_CHAVE_SERVICO);
  const resposta = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: chaveServico,
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

async function consumirCota(userId: string, quantidade: number) {
  const supabaseUrl = obterVariavelObrigatoria("SUPABASE_URL").replace(/\/+$/, "");
  const chaveServico = obterVariavelObrigatoria(NOME_CHAVE_SERVICO);
  const limite = Number(Deno.env.get("OPEN_ELEVATION_QUOTA_PER_HOUR") ?? 2000);

  const resposta = await fetch(`${supabaseUrl}/rest/v1/rpc/consumir_cota_api`, {
    method: "POST",
    headers: {
      apikey: chaveServico,
      Authorization: `Bearer ${chaveServico}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_recurso: "open_elevation",
      p_quantidade: quantidade,
      p_limite: limite,
      p_janela_minutos: 60
    })
  });

  if (!resposta.ok) {
    throw new ErroAplicacao("Não foi possível validar a cota de uso.", 503);
  }

  const [resultado] = (await resposta.json().catch(() => [])) as Array<{ permitido?: boolean; restante?: number; reset_at?: string }>;
  if (!resultado?.permitido) {
    throw new ErroAplicacao("Limite de uso atingido. Tente novamente mais tarde.", 429);
  }
}

function validarCoordenadas(corpo: unknown) {
  const locations = (corpo as { locations?: unknown })?.locations;
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new ErroAplicacao("Envie uma lista no campo locations.");
  }

  const limiteLote = Number(Deno.env.get("OPEN_ELEVATION_BATCH_LIMIT") ?? 400);
  if (locations.length > limiteLote) {
    throw new ErroAplicacao(`A consulta aceita até ${limiteLote} pontos por requisição.`, 413);
  }

  return locations.map((item) => {
    const latitude = Number((item as { latitude?: unknown; lat?: unknown })?.latitude ?? (item as { lat?: unknown })?.lat);
    const longitude = Number((item as { longitude?: unknown; lng?: unknown })?.longitude ?? (item as { lng?: unknown })?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
    }
    if (latitude < -90 || latitude > 90) {
      throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
    }
    if (longitude < -180 || longitude > 180) {
      throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
    }
    return { latitude, longitude };
  });
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

    const token = extrairBearer(requisicao);
    const usuario = await obterUsuario(token);
    const corpo = await requisicao.json().catch(() => null);
    const locations = validarCoordenadas(corpo);
    await consumirCota(usuario.id, locations.length);

    const upstream = obterVariavelObrigatoria("OPEN_ELEVATION_API_URL");
    const resposta = await fetch(upstream, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ locations })
    });

    const respostaTexto = await resposta.text();
    return new Response(respostaTexto, {
      status: resposta.status,
      headers: {
        ...CABECALHOS_JSON,
        ...criarCabecalhosCors(requisicao)
      }
    });
  } catch (erro) {
    const status = erro instanceof ErroAplicacao ? erro.status : 500;
    if (!(erro instanceof ErroAplicacao)) {
      console.error("Erro inesperado no proxy de altitude:", erro);
    }
    return responder(requisicao, status, { erro: erro instanceof ErroAplicacao ? erro.message : "Erro interno no proxy de altitude." });
  }
});
