import { CURVAS_FATOR_DENSIFICACAO } from "../../configuracao";
import type { ProvedorElevacao } from "../../tipos";
import { ErroAplicacao } from "../../utilitarios/erros";
import { densificarGrade } from "./densificarGrade";
import { gerarGradeElevacaoApi } from "./gradeElevacaoApi";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import { suavizarGrade } from "./suavizarGrade";
import { prepararLinhaCurva } from "./suavizarLinhas";
import type { FeatureCollectionCurvas, RequisicaoCurvas } from "./tiposCurvas";
import { unirSegmentos } from "./unirSegmentos";

const AVISO_PRECISAO =
  "Curvas geradas a partir de amostras consultadas na Open-Elevation e suavizadas matematicamente. A suavização melhora a representação visual, mas não aumenta a precisão da fonte.";

function normalizarIntervaloMetros(intervaloMetros: unknown): number {
  const valor = Number(intervaloMetros ?? 5);
  return Number.isFinite(valor) && valor > 0 ? valor : 5;
}

export class ServicoCurvas {
  constructor(private readonly provedorElevacao: ProvedorElevacao) {}

  async gerarCurvas(requisicao: RequisicaoCurvas): Promise<FeatureCollectionCurvas> {
    if (!requisicao || typeof requisicao !== "object") {
      throw new ErroAplicacao("Informe os parâmetros para gerar curvas de nível.");
    }

    const intervaloMetros = normalizarIntervaloMetros(requisicao.intervaloMetros);
    const gradeOriginal = await gerarGradeElevacaoApi(this.provedorElevacao, requisicao.bbox, requisicao.resolucaoMetros);
    const gradeSuavizada = suavizarGrade(gradeOriginal, 1);
    const gradeDensa = densificarGrade(gradeSuavizada, CURVAS_FATOR_DENSIFICACAO);
    const features: FeatureCollectionCurvas["features"] = [];

    if (gradeDensa.altitudeMinima !== null && gradeDensa.altitudeMaxima !== null) {
      const nivelInicial = Math.ceil(gradeDensa.altitudeMinima / intervaloMetros) * intervaloMetros;
      const nivelFinal = Math.floor(gradeDensa.altitudeMaxima / intervaloMetros) * intervaloMetros;

      for (let nivel = nivelInicial; nivel <= nivelFinal; nivel += intervaloMetros) {
        const segmentos = gerarSegmentosMarchingSquares(gradeDensa, nivel);
        const linhas = unirSegmentos(segmentos, gradeOriginal.resolucaoMetros);
        const tipo = nivel % (intervaloMetros * 5) === 0 ? "mestra" : "normal";

        for (const linhaBruta of linhas) {
          const linha = prepararLinhaCurva(linhaBruta, gradeOriginal.resolucaoMetros);
          if (linha.linha.length < 2 || linha.comprimentoMetros < Math.max(gradeOriginal.resolucaoMetros * 0.5, 3)) {
            continue;
          }

          features.push({
            type: "Feature",
            properties: {
              elevacao: nivel,
              tipo,
              fonte: "Open-Elevation",
              comprimentoMetros: linha.comprimentoMetros,
              fechada: linha.fechada
            },
            geometry: {
              type: "LineString",
              coordinates: linha.linha
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
        metodo: "open_elevation_api_marching_squares_suavizado",
        intervaloMetros,
        resolucaoSolicitadaMetros: gradeOriginal.resolucaoSolicitadaMetros,
        resolucaoEfetivaMetros: gradeOriginal.resolucaoMetros,
        resolucaoAjustada: gradeOriginal.resolucaoAjustada,
        pontosConsultados: gradeOriginal.pontosConsultados,
        linhasGrade: gradeOriginal.linhas,
        colunasGrade: gradeOriginal.colunas,
        fatorDensificacao: CURVAS_FATOR_DENSIFICACAO,
        iteracoesSuavizacaoGrade: 1,
        iteracoesSuavizacaoLinhas: 2,
        quantidadeCurvas: features.length,
        cacheAtivo: true,
        altitudeMinima: gradeOriginal.altitudeMinima,
        altitudeMaxima: gradeOriginal.altitudeMaxima,
        avisoPrecisao: AVISO_PRECISAO
      }
    };
  }
}
