import type { Coordenada, ResultadoAltitude } from "../../tipos";

export type ResultadoAltitudeApi = ResultadoAltitude;

export interface RespostaOpenElevation {
  results?: Array<{
    latitude?: number;
    longitude?: number;
    elevation?: number;
  }>;
}

export interface EntradaCacheElevacao {
  resultado: ResultadoAltitudeApi;
  criadoEm: number;
}

export interface EstatisticasCacheElevacao {
  itens: number;
  maxItens: number;
  ttlMs: number;
}

export interface ResultadoLoteOpenElevation {
  coordenada: Coordenada;
  resultado: ResultadoAltitudeApi;
}
