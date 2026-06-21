export type StatusAltitude = "valido" | "sem_dado";

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export type FonteAltitude = "open_elevation";
export type MetodoAltitude = "api";
export type PrecisaoReal = "media";

export interface ResultadoAltitude {
  latitude: number;
  longitude: number;
  avisoPrecisao?: string;
  altitude: number | null;
  status: StatusAltitude;
  fonte: FonteAltitude;
  metodo: MetodoAltitude;
  precisaoReal: PrecisaoReal;
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
  limiteAmostrasAtingido?: boolean;
  intervaloEfetivoMetros?: number;
  avisoAmostragem?: string;
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

export interface MetricaPropriedade {
  chave: string;
  item: string;
  valor: string;
  unidade?: string;
  coordenada?: Coordenada;
  clicavel?: boolean;
}

export interface ResumoPropriedade {
  nome: string;
  tipo: string;
  quantidadePontos: number;
  coordenadaCentral?: Coordenada;
}

export interface RequisicaoPropriedade {
  geometria: GeometriaPerfil;
  tipo?: string;
  nome?: string;
}

export interface ResultadoPropriedade {
  tipo: string;
  nome: string;
  resumo: ResumoPropriedade;
  metricas: MetricaPropriedade[];
  aviso?: string;
}

export interface ProvedorElevacao {
  consultarPonto(coordenada: Coordenada): Promise<ResultadoAltitude>;
  consultarLote(coordenadas: Coordenada[]): Promise<ResultadoAltitude[]>;
}
