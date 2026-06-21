export type TemaVisual = "claro" | "escuro";
export type CamadaBase = "mapa" | "satelite" | "terreno";
export type StatusAltitude = "valido" | "sem_dado";

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

export interface StatusApi {
  carregando: boolean;
  backendOnline: boolean;
  arquivoCarregado: boolean;
  caminhoArquivo?: string;
  tamanhoCarregado?: number;
  tamanhoEsperado?: number;
  erro?: string | null;
}

export interface CamadasVisiveis {
  relevo: boolean;
  gradeAltitude: boolean;
  importados: boolean;
  desenhos: boolean;
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

export type GeometriaProjeto =
  | GeometriaLinha
  | GeometriaPoligono
  | GeometriaPonto
  | GeometriaCirculo;

export interface ElementoMapa {
  id: string;
  nome: string;
  tipo: string;
  origem: "desenho" | "importado";
  geometria: GeometriaProjeto;
  ativo: boolean;
  cor: string;
  criadoEm: string;
}

export interface GeoJsonFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: Exclude<GeometriaProjeto, GeometriaCirculo>;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface CamadaImportada {
  id: string;
  nome: string;
  tipoArquivo: string;
  ativa: boolean;
  quantidadeElementos: number;
  geojson: GeoJsonFeatureCollection;
  importadaEm: string;
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

export interface PontoPerfil extends ResultadoAltitude {
  distanciaMetros: number;
}

export interface PerfilElevacao {
  tipo: GeometriaProjeto["type"];
  pontos: PontoPerfil[];
  estatisticas: EstatisticasPerfil;
}

export interface AlertaSistema {
  tipo: "sucesso" | "aviso" | "erro";
  mensagem: string;
}
