import type { BboxCurvasNivel, CurvasNivelGeoJson } from "../tipos/altimetria";

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
  const resposta = await fetch(`${API_BASE}/api/contours/raw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bbox, intervaloMetros, resolucaoMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta);
}
