export type StatusAltitude = "valido" | "sem_dado";

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface ResultadoAltitude {
  latitude: number;
  longitude: number;
  coluna: number;
  linha: number;
  indice: number;
  valorBruto: number;
  altitude: number | null;
  status: StatusAltitude;
  mensagem: string;
  consultadoEm: string;
}

export interface CoordenadaComDistancia extends Coordenada {
  distanciaMetros: number;
}

export interface PontoPerfil extends ResultadoAltitude {
  distanciaMetros: number;
}

export interface EstatisticasPerfil {
  altitudeMinima: number | null;
  altitudeMaxima: number | null;
  altitudeMedia: number | null;
  diferencaNivel: number | null;
  inclinacaoMediaPercentual: number | null;
  comprimentoTotalMetros: number;
  areaMetrosQuadrados: number | null;
  quantidadePontos: number;
  pontosSemDado: number;
}

export type ParLngLat = [number, number];

export interface GeometriaLinha {
  type: "LineString";
  coordinates: ParLngLat[];
}

export interface GeometriaPoligono {
  type: "Polygon";
  coordinates: ParLngLat[][];
}

export interface GeometriaPonto {
  type: "Point";
  coordinates: ParLngLat;
}

export interface GeometriaCirculo {
  type: "Circle";
  center: ParLngLat;
  radiusMeters: number;
}

export type GeometriaPerfil =
  | GeometriaLinha
  | GeometriaPoligono
  | GeometriaPonto
  | GeometriaCirculo;

export interface RequisicaoPerfil {
  geometria: GeometriaPerfil;
  intervaloMetros?: number;
}

export interface ResultadoPerfil {
  tipo: GeometriaPerfil["type"];
  pontos: PontoPerfil[];
  estatisticas: EstatisticasPerfil;
}
