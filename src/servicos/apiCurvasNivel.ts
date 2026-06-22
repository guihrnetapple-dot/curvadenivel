import type { BboxCurvasNivel, CurvasNivelGeoJson, GeometriaProjeto } from "../tipos/altimetria";
import { fetchApiProtegida, lerRespostaJson } from "./apiClient";

const MENSAGEM_ERRO_CURVAS = "Falha ao gerar curvas de n?vel.";

export async function gerarCurvasNivel(
  bbox: BboxCurvasNivel,
  intervaloMetros = 5
): Promise<CurvasNivelGeoJson> {
  const resposta = await fetchApiProtegida("/api/contours", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bbox, intervaloMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta, MENSAGEM_ERRO_CURVAS);
}

export async function gerarCurvasNivelPorGeometria(
  geometria: Extract<GeometriaProjeto, { type: "Polygon" | "Circle" }>,
  intervaloMetros = 5
): Promise<CurvasNivelGeoJson> {
  const resposta = await fetchApiProtegida("/api/contours", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ geometria, intervaloMetros })
  });

  return lerRespostaJson<CurvasNivelGeoJson>(resposta, MENSAGEM_ERRO_CURVAS);
}
