import type { Coordenada } from "../../tipos";

export interface BboxCurvas {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export type ParLngLat = [number, number];

export interface GeometriaPoligonoCurvas {
  type: "Polygon";
  coordinates: ParLngLat[][];
}

export interface GeometriaCirculoCurvas {
  type: "Circle";
  center: ParLngLat;
  radiusMeters: number;
}

export type GeometriaAreaCurvas = GeometriaPoligonoCurvas | GeometriaCirculoCurvas;

export interface RequisicaoCurvas {
  bbox?: BboxCurvas;
  geometria?: GeometriaAreaCurvas;
  intervaloMetros?: number;
}

export interface NoGradeCurvas extends Coordenada {
  altitude: number | null;
  chaveGlobal?: string;
}

export interface GradeCurvas {
  bbox: BboxCurvas;
  bboxAmostragem: BboxCurvas;
  linhas: number;
  colunas: number;
  resolucaoMetros: number;
  resolucaoSolicitadaMetros: number;
  resolucaoAjustada: boolean;
  pontosConsultados: number;
  gradeTravada: boolean;
  sistemaGrade: "web_mercator_global";
  nos: NoGradeCurvas[][];
  altitudeMinima: number | null;
  altitudeMaxima: number | null;
}

export type CoordenadaLinhaCurva = [number, number];
export type SegmentoCurva = [CoordenadaLinhaCurva, CoordenadaLinhaCurva];

export interface PropriedadesCurva {
  elevacao: number;
  tipo: "mestra" | "normal";
  fonte: string;
  comprimentoMetros?: number;
  fechada?: boolean;
}

export interface FeatureCurva {
  type: "Feature";
  properties: PropriedadesCurva;
  geometry: {
    type: "LineString";
    coordinates: CoordenadaLinhaCurva[];
  };
}

export interface FeatureCollectionCurvas {
  type: "FeatureCollection";
  features: FeatureCurva[];
  metadados: {
    fonte: "API";
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
    bboxOriginal: BboxCurvas;
    bboxAmostragem: BboxCurvas;
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
  };
}
