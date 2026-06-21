import type { BboxCurvasNivel, CurvasNivelGeoJson, ModoParametrosCurvas } from "../tipos/altimetria";

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
  modoParametros: ModoParametrosCurvas = "automatico",
  intervaloMetros = 5,
  resolucaoMetros = 100
): Promise<CurvasNivelGeoJson> {
  const resposta = await fetch(`${API_BASE}/api/contours`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bbox, modoParametros, intervaloMetros, resolucaoMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta);
}
