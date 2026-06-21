import type { GeometriaProjeto, PerfilElevacao, ResultadoAltitude, StatusApi } from "../tipos/altimetria";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function lerRespostaJson<T>(resposta: Response): Promise<T> {
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === "object" && "erro" in corpo
        ? String((corpo as { erro: unknown }).erro)
        : "Falha ao consultar a API de altimetria.";
    throw new Error(mensagem);
  }

  return corpo as T;
}

export async function consultarStatusApi(): Promise<StatusApi> {
  const resposta = await fetch(`${API_BASE}/api/status`);
  const dados = await lerRespostaJson<{
    backendOnline: boolean;
    altitude: {
      arquivoCarregado: boolean;
      caminhoArquivo: string;
      tamanhoEsperado: number;
      tamanhoCarregado: number;
      erro: string | null;
    };
  }>(resposta);

  return {
    carregando: false,
    backendOnline: dados.backendOnline,
    arquivoCarregado: dados.altitude.arquivoCarregado,
    caminhoArquivo: dados.altitude.caminhoArquivo,
    tamanhoEsperado: dados.altitude.tamanhoEsperado,
    tamanhoCarregado: dados.altitude.tamanhoCarregado,
    erro: dados.altitude.erro
  };
}

export async function consultarAltitude(latitude: number, longitude: number): Promise<ResultadoAltitude> {
  const parametros = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude)
  });
  const resposta = await fetch(`${API_BASE}/api/elevation?${parametros.toString()}`);
  return lerRespostaJson<ResultadoAltitude>(resposta);
}

export async function consultarPerfilElevacao(
  geometria: GeometriaProjeto,
  intervaloMetros = 1200
): Promise<PerfilElevacao> {
  const resposta = await fetch(`${API_BASE}/api/elevation/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ geometria, intervaloMetros })
  });
  return lerRespostaJson<PerfilElevacao>(resposta);
}
