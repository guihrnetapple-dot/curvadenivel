export type TemaVisual = "claro" | "escuro";
export type CamadaBase = "mapa" | "satelite" | "terreno";
export type StatusAltitude = "valido" | "sem_dado";
export type FonteAltitude = "open_elevation";
export type MetodoAltitude = "api";
export type PrecisaoReal = "media";
export type ModoParametrosCurvas = "automatico" | "manual";

export interface ResultadoAltitude {
  latitude: number;
  longitude: number;
  precisaoReal?: PrecisaoReal;
  avisoPrecisao?: string;
  altitude: number | null;
  status: StatusAltitude;
  fonte: FonteAltitude;
  metodo: MetodoAltitude;
  mensagem: string;
  consultadoEm: string;
}

export interface StatusApi {
  carregando: boolean;
  backendOnline: boolean;
  elevacao?: {
    fonte: string;
    configurada: boolean;
    tamanhoLote: number;
    timeoutMs: number;
    cacheAtivo: boolean;
  };
  curvas?: {
    limitePontosApi: number;
    resolucaoMinimaMetros: number;
    fatorDensificacao: number;
  };
  erro?: string | null;
}

export interface CamadasVisiveis {
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

export interface LocalizacaoEncontrada {
  nome: string;
  latitude: number;
  longitude: number;
  bbox?: BboxCurvasNivel;
}

export interface FeatureCurvaNivel {
  type: "Feature";
  properties: {
    elevacao: number;
    tipo: "mestra" | "normal";
    fonte: string;
    comprimentoMetros?: number;
    fechada?: boolean;
  };
  geometry: GeometriaLinha;
}

export interface MetadadosCurvasNivel {
  fonte: "Open-Elevation API";
  metodo: "open_elevation_api_marching_squares_suavizado";
  modoParametros: null;
  resolucaoAutomatica: number | null;
  resolucaoPorIntervaloMetros: number | null;
  resolucaoPorAreaMetros: number | null;
  resolucaoOriginalMetros: number | null;
  criterioResolucaoAutomatica: string | null;
  motivoAjusteAutomatico: string | null;
  maiorDimensaoMetros: number;
  areaMetrosQuadrados: number;
  intervaloMetros: number;
  resolucaoGradeGlobalMetros: number;
  gradeTravada: true;
  sistemaGrade: "web_mercator_global";
  bboxOriginal: BboxCurvasNivel;
  bboxAmostragem: BboxCurvasNivel;
  resolucaoSolicitadaMetros: number;
  resolucaoEfetivaMetros: number;
  resolucaoAjustada: boolean;
  pontosConsultados: number;
  linhasGrade: number;
  colunasGrade: number;
  fatorDensificacao: number;
  iteracoesSuavizacaoGrade: number;
  iteracoesSuavizacaoLinhas: number;
  quantidadeCurvas: number;
  cacheAtivo: boolean;
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
