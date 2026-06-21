import { ErroAplicacao } from "../../utilitarios/erros";
import { ServicoOpenElevation } from "../servicoOpenElevation";
import { gerarGradeOpenElevation } from "./gradeOpenElevation";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import type { FeatureCollectionCurvas, RequisicaoCurvasRaw } from "./tiposCurvas";
import { unirSegmentos } from "./unirSegmentos";
import { INTERVALO_MINIMO_METROS } from "./servicoCurvasRaw";

const AVISO_PRECISAO =
  "Curvas aproximadas geradas pela API Open-Elevation. A precisão depende da base DEM usada pelo serviço e não substitui levantamento topográfico final.";

function normalizarIntervaloMetros(intervaloMetros: unknown): number {
  const valor = Number(intervaloMetros ?? 5);
  return Number.isFinite(valor) && valor > 0 ? Math.max(valor, INTERVALO_MINIMO_METROS) : 5;
}

export class ServicoCurvasOpenElevation {
  constructor(private readonly servicoOpenElevation: ServicoOpenElevation) {}

  async gerarCurvas(requisicao: RequisicaoCurvasRaw): Promise<FeatureCollectionCurvas> {
    if (!requisicao || typeof requisicao !== "object") {
      throw new ErroAplicacao("Informe os parâmetros para gerar curvas de nível.");
    }

    const intervaloMetros = normalizarIntervaloMetros(requisicao.intervaloMetros);
    const grade = await gerarGradeOpenElevation(
      this.servicoOpenElevation,
      requisicao.bbox,
      requisicao.resolucaoMetros
    );
    const features: FeatureCollectionCurvas["features"] = [];

    if (grade.altitudeMinima !== null && grade.altitudeMaxima !== null) {
      const nivelInicial = Math.ceil(grade.altitudeMinima / intervaloMetros) * intervaloMetros;
      const nivelFinal = Math.floor(grade.altitudeMaxima / intervaloMetros) * intervaloMetros;

      for (let nivel = nivelInicial; nivel <= nivelFinal; nivel += intervaloMetros) {
        const segmentos = gerarSegmentosMarchingSquares(grade, nivel);
        const linhas = unirSegmentos(segmentos);
        const tipo = nivel % (intervaloMetros * 5) === 0 ? "mestra" : "normal";

        for (const linha of linhas) {
          features.push({
            type: "Feature",
            properties: {
              elevacao: nivel,
              tipo,
              fonte: "Open-Elevation"
            },
            geometry: {
              type: "LineString",
              coordinates: linha
            }
          });
        }
      }
    }

    return {
      type: "FeatureCollection",
      features,
      metadados: {
        fonte: "Open-Elevation API",
        metodo: "open_elevation_marching_squares",
        intervaloMetros,
        resolucaoMetros: grade.resolucaoMetros,
        altitudeMinima: grade.altitudeMinima,
        altitudeMaxima: grade.altitudeMaxima,
        avisoPrecisao: AVISO_PRECISAO
      }
    };
  }
}
