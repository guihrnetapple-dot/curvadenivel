import type { Coordenada } from "../../tipos";

export interface BboxCurvas {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface RequisicaoCurvas {
  bbox: BboxCurvas;
  modoParametros?: "automatico" | "manual";
  intervaloMetros?: number;
  resolucaoMetros?: number;
}

export interface NoGradeCurvas extends Coordenada {
  altitude: number | null;
}

export interface GradeCurvas {
  bbox: BboxCurvas;
  linhas: number;
  colunas: number;
  resolucaoMetros: number;
  resolucaoSolicitadaMetros: number;
  resolucaoAjustada: boolean;
  pontosConsultados: number;
  nos: NoGradeCurvas[][];
  altitudeMinima: number | null;
  altitudeMaxima: number | null;
}

export type CoordenadaLinhaCurva = [number, number];
export type SegmentoCurva = [CoordenadaLinhaCurva, CoordenadaLinhaCurva];

export interface PropriedadesCurva {
  elevacao: number;
  tipo: "mestra" | "normal";
  fonte: "Open-Elevation";
  comprimentoMetros: number;
  fechada: boolean;
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
    fonte: "Open-Elevation API";
    metodo: "open_elevation_api_marching_squares_suavizado";
    modoParametros: "automatico" | "manual";
    resolucaoAutomatica: number | null;
    motivoAjusteAutomatico: string | null;
    maiorDimensaoMetros: number;
    areaMetrosQuadrados: number;
    intervaloMetros: number;
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
