import { ErroAplicacao } from "../../utilitarios/erros";
import { ServicoAltitude } from "../servicoAltitude";
import { gerarGradeRawInterpolada } from "./gradeRawInterpolada";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import type { FeatureCollectionCurvas, RequisicaoCurvasRaw } from "./tiposCurvas";
import { unirSegmentos } from "./unirSegmentos";

export const INTERVALO_MINIMO_METROS = 20;
const AVISO_PRECISAO =
  "Curvas aproximadas geradas a partir de grade RAW global de baixa resolução. Não usar como curva de nível topográfica final.";

function normalizarIntervaloMetros(intervaloMetros: unknown): number {
  const valor = Number(intervaloMetros ?? 20);
  return Number.isFinite(valor) && valor > 0 ? Math.max(valor, INTERVALO_MINIMO_METROS) : 20;
}

export class ServicoCurvasRaw {
  constructor(private readonly servicoAltitude: ServicoAltitude) {}

  async gerarCurvas(requisicao: RequisicaoCurvasRaw): Promise<FeatureCollectionCurvas> {
    if (!requisicao || typeof requisicao !== "object") {
      throw new ErroAplicacao("Informe os parâmetros para gerar curvas de nível.");
    }

    const intervaloMetros = normalizarIntervaloMetros(requisicao.intervaloMetros);
    const grade = await gerarGradeRawInterpolada(
      this.servicoAltitude,
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
              fonte: "RAW interpolado"
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
        fonte: "data10k8b.raw interpolado",
        metodo: "interpolacao_bilinear_marching_squares",
        intervaloMetros,
        resolucaoMetros: grade.resolucaoMetros,
        altitudeMinima: grade.altitudeMinima,
        altitudeMaxima: grade.altitudeMaxima,
        avisoPrecisao: AVISO_PRECISAO
      }
    };
  }
}
