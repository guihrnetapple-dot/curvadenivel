import type { Coordenada } from "../../tipos";

export interface BboxCurvas {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface RequisicaoCurvasRaw {
  bbox: BboxCurvas;
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
  nos: NoGradeCurvas[][];
  altitudeMinima: number | null;
  altitudeMaxima: number | null;
}

export type CoordenadaLinhaCurva = [number, number];
export type SegmentoCurva = [CoordenadaLinhaCurva, CoordenadaLinhaCurva];

export interface PropriedadesCurva {
  elevacao: number;
  tipo: "mestra" | "normal";
  fonte: "RAW interpolado";
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
    fonte: "data10k8b.raw interpolado";
    metodo: "interpolacao_bilinear_marching_squares";
    intervaloMetros: number;
    resolucaoMetros: number;
    altitudeMinima: number | null;
    altitudeMaxima: number | null;
    avisoPrecisao: string;
  };
}
