export type TemaVisual = "claro" | "escuro";
export type CamadaBase = "mapa" | "satelite" | "terreno";
export type StatusAltitude = "valido" | "sem_dado";
export type MetodoInterpolacao = "celula" | "bilinear" | "bilinear_parcial";
export type PrecisaoReal = "baixa" | "media" | "alta";

export interface ResultadoAltitude {
  latitude: number;
  longitude: number;
  coluna: number;
  linha: number;
  indice: number;
  valorBruto: number;
  valorBrutoInterpolado?: number;
  metodo?: MetodoInterpolacao;
  resolucaoFonteMetrosAproximada?: number;
  precisaoReal?: PrecisaoReal;
  avisoPrecisao?: string;
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

export interface BboxCurvasNivel {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface FeatureCurvaNivel {
  type: "Feature";
  properties: {
    elevacao: number;
    tipo: "mestra" | "normal";
    fonte: "RAW interpolado";
  };
  geometry: GeometriaLinha;
}

export interface MetadadosCurvasNivel {
  fonte: "data10k8b.raw interpolado";
  metodo: "interpolacao_bilinear_marching_squares";
  intervaloMetros: number;
  resolucaoMetros: number;
  altitudeMinima: number | null;
  altitudeMaxima: number | null;
  avisoPrecisao: string;
}

export interface CurvasNivelGeoJson {
  type: "FeatureCollection";
  features: FeatureCurvaNivel[];
  metadados: MetadadosCurvasNivel;
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
  limiteAmostrasAtingido?: boolean;
  intervaloEfetivoMetros?: number;
  avisoAmostragem?: string;
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
