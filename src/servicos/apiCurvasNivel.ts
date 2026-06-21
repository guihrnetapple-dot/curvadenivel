import type { BboxCurvasNivel, CurvasNivelGeoJson, GeometriaProjeto } from "../tipos/altimetria";

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

export async function gerarCurvasNivel(
  bbox: BboxCurvasNivel,
  intervaloMetros = 5
): Promise<CurvasNivelGeoJson> {
  const resposta = await fetch(`${API_BASE}/api/contours`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bbox, intervaloMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta);
}

export async function gerarCurvasNivelPorGeometria(
  geometria: Extract<GeometriaProjeto, { type: "Polygon" | "Circle" }>,
  intervaloMetros = 5
): Promise<CurvasNivelGeoJson> {
  const resposta = await fetch(`${API_BASE}/api/contours`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ geometria, intervaloMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta);
}
