import type { BboxCurvasNivel, CurvasNivelGeoJson, FonteElevacao } from "../tipos/altimetria";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function lerRespostaJson<T>(resposta: Response): Promise<T> {
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === "object" && "erro" in corpo
        ? String((corpo as { erro: unknown }).erro)
        : "Falha ao gerar curvas de nível.";
    throw new Error(mensagem);
  }

  return corpo as T;
}

export async function gerarCurvasRaw(
  bbox: BboxCurvasNivel,
  intervaloMetros = 20,
  resolucaoMetros = 250
): Promise<CurvasNivelGeoJson> {
  return gerarCurvasNivel("raw", bbox, intervaloMetros, resolucaoMetros);
}

export async function gerarCurvasNivel(
  fonte: FonteElevacao,
  bbox: BboxCurvasNivel,
  intervaloMetros = 20,
  resolucaoMetros = 250
): Promise<CurvasNivelGeoJson> {
  const rota = fonte === "open_elevation" ? "open-elevation" : "raw";
  const resposta = await fetch(`${API_BASE}/api/contours/${rota}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bbox, intervaloMetros, resolucaoMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta);
}
