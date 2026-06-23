import type { GeometriaProjeto, PerfilElevacao, ResultadoAltitude, StatusApi } from "../tipos/altimetria";
import { fetchApiProtegida, lerRespostaJson } from "./apiClient";

const MENSAGEM_ERRO_ALTITUDE = "Falha ao consultar a API de altimetria.";

export async function consultarStatusApi(): Promise<StatusApi> {
  const resposta = await fetchApiProtegida("/api/status");
  const dados = await lerRespostaJson<Omit<StatusApi, "carregando">>(resposta, MENSAGEM_ERRO_ALTITUDE);

  return {
    carregando: false,
    ...dados
  };
}

export async function consultarAltitude(latitude: number, longitude: number): Promise<ResultadoAltitude> {
  const parametros = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude)
  });
  const resposta = await fetchApiProtegida("/api/elevation?" + parametros.toString());
  return lerRespostaJson<ResultadoAltitude>(resposta, MENSAGEM_ERRO_ALTITUDE);
}

export async function consultarPerfilElevacao(
  geometria: GeometriaProjeto,
  intervaloMetros = 50
): Promise<PerfilElevacao> {
  const resposta = await fetchApiProtegida("/api/elevation/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ geometria, intervaloMetros })
  });
  return lerRespostaJson<PerfilElevacao>(resposta, MENSAGEM_ERRO_ALTITUDE);
}
