const ORIGENS_PADRAO = [
  "https://geocampo.vercel.app",
  "https://curvadenivel.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

function obterOrigensPermitidas(): string[] {
  const configuradas = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origem) => origem.trim())
    .filter(Boolean);

  return configuradas?.length ? configuradas : ORIGENS_PADRAO;
}

export function origemPermitida(origem: string): boolean {
  return obterOrigensPermitidas().includes(origem) || /^https:\/\/(?:geocampo|curvadenivel)-[a-z0-9-]+-guilherme-franklin\.vercel\.app$/.test(origem);
}

export function criarCabecalhosCors(requisicao: Request): HeadersInit {
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

