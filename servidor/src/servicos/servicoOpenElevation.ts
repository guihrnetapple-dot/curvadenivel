import type { Coordenada, ResultadoAltitude } from "../tipos";
import { ErroAplicacao } from "../utilitarios/erros";

export interface ResultadoOpenElevation extends Coordenada {
  altitude: number | null;
}

interface RespostaOpenElevation {
  results?: Array<{
    latitude?: number;
    longitude?: number;
    elevation?: number;
  }>;
}

const URL_PADRAO_OPEN_ELEVATION = "https://api.open-elevation.com/api/v1/lookup";
const TAMANHO_LOTE_PADRAO = 400;
const TIMEOUT_PADRAO_MS = 20000;

function normalizarNumeroAmbiente(valor: string | undefined, fallback: number, minimo: number): number {
  const numero = Number(valor ?? fallback);
  return Number.isFinite(numero) ? Math.max(minimo, numero) : fallback;
}

function obterMensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Falha desconhecida na API Open-Elevation.";
}

export class ServicoOpenElevation {
  private readonly urlApi: string;
  private readonly tamanhoLote: number;
  private readonly timeoutMs: number;

  constructor() {
    this.urlApi = process.env.OPEN_ELEVATION_API_URL ?? URL_PADRAO_OPEN_ELEVATION;
    this.tamanhoLote = normalizarNumeroAmbiente(process.env.OPEN_ELEVATION_TAMANHO_LOTE, TAMANHO_LOTE_PADRAO, 1);
    this.timeoutMs = normalizarNumeroAmbiente(process.env.OPEN_ELEVATION_TIMEOUT_MS, TIMEOUT_PADRAO_MS, 1000);
  }

  async consultarLote(coordenadas: Coordenada[]): Promise<ResultadoOpenElevation[]> {
    const resultados: ResultadoOpenElevation[] = [];

    for (let indice = 0; indice < coordenadas.length; indice += this.tamanhoLote) {
      const lote = coordenadas.slice(indice, indice + this.tamanhoLote);
      resultados.push(...(await this.enviarLote(lote)));
    }

    return resultados;
  }

  async consultarPonto(coordenada: Coordenada): Promise<ResultadoAltitude> {
    const latitude = Number(coordenada.latitude);
    const longitude = Number(coordenada.longitude);
    this.validarCoordenada(latitude, longitude);

    const [resultado] = await this.consultarLote([{ latitude, longitude }]);
    const altitude = resultado?.altitude ?? null;

    return {
      latitude,
      longitude,
      coluna: 0,
      linha: 0,
      indice: 0,
      valorBruto: altitude ?? 0,
      valorBrutoInterpolado: altitude ?? undefined,
      metodo: "bilinear",
      precisaoReal: "media",
      avisoPrecisao:
        "Altitude consultada na API Open-Elevation. A precisão depende da base DEM usada pelo serviço.",
      altitude,
      status: altitude === null ? "sem_dado" : "valido",
      mensagem:
        altitude === null
          ? "A API Open-Elevation não retornou altitude válida para esse ponto."
          : "Altitude consultada pela API Open-Elevation.",
      consultadoEm: new Date().toISOString()
    };
  }

  private validarCoordenada(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
    }
    if (latitude < -90 || latitude > 90) {
      throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
    }
    if (longitude < -180 || longitude > 180) {
      throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
    }
  }

  private async enviarLote(coordenadas: Coordenada[]): Promise<ResultadoOpenElevation[]> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);

    try {
      const resposta = await fetch(this.urlApi, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locations: coordenadas.map((coordenada) => ({
            latitude: coordenada.latitude,
            longitude: coordenada.longitude
          }))
        }),
        signal: controlador.signal
      });

      const corpo = (await resposta.json().catch(() => null)) as RespostaOpenElevation | null;

      if (!resposta.ok) {
        throw new ErroAplicacao(`Open-Elevation respondeu com status ${resposta.status}.`, 502, corpo);
      }

      if (!Array.isArray(corpo?.results) || corpo.results.length !== coordenadas.length) {
        throw new ErroAplicacao("A resposta da Open-Elevation veio em formato inesperado.", 502, corpo);
      }

      return corpo.results.map((resultado, indice) => ({
        latitude: Number(resultado.latitude ?? coordenadas[indice].latitude),
        longitude: Number(resultado.longitude ?? coordenadas[indice].longitude),
        altitude: Number.isFinite(Number(resultado.elevation)) ? Number(resultado.elevation) : null
      }));
    } catch (erro) {
      if (erro instanceof ErroAplicacao) {
        throw erro;
      }
      throw new ErroAplicacao(`Não foi possível consultar a Open-Elevation: ${obterMensagemErro(erro)}`, 502);
    } finally {
      clearTimeout(temporizador);
    }
  }
}
