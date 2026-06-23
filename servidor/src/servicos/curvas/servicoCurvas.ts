import { CURVAS_FATOR_DENSIFICACAO, CURVAS_RESOLUCAO_GLOBAL_METROS } from "../../configuracao";
import type { ProvedorElevacao } from "../../tipos";
import { ErroAplicacao } from "../../utilitarios/erros";
import { cortarLinhaParaBbox } from "./clipLinhaBbox";
import { calcularBboxGeometria, filtrarLinhaPorGeometria } from "./clipLinhaGeometria";
import { densificarGrade } from "./densificarGrade";
import { gerarGradeElevacaoApi } from "./gradeElevacaoApi";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import { suavizarGrade } from "./suavizarGrade";
import { prepararLinhaCurva } from "./suavizarLinhas";
import type { BboxCurvas, FeatureCollectionCurvas, RequisicaoCurvas } from "./tiposCurvas";
import { unirSegmentos } from "./unirSegmentos";
import { expandirBboxPorMercator, validarBbox } from "./validacaoGradeCurvas";

function normalizarIntervaloMetros(intervaloMetros: unknown): number {
  const valor = Number(intervaloMetros ?? 5);
  return Number.isFinite(valor) && valor > 0 ? valor : 5;
}

function calcularDimensoesMetros(bbox: BboxCurvas) {
  const latitudeReferencia = (bbox.minLat + bbox.maxLat) / 2;
  const fatorLongitude = Math.max(0.01, Math.cos((latitudeReferencia * Math.PI) / 180));
  const larguraMetros = Math.abs(bbox.maxLng - bbox.minLng) * 111320 * fatorLongitude;
  const alturaMetros = Math.abs(bbox.maxLat - bbox.minLat) * 111320;
  return {
    maiorDimensaoMetros: Math.max(larguraMetros, alturaMetros),
    areaMetrosQuadrados: larguraMetros * alturaMetros
  };
}

export class ServicoCurvas {
  constructor(private readonly provedorElevacao: ProvedorElevacao) {}

  async gerarCurvas(requisicao: RequisicaoCurvas): Promise<FeatureCollectionCurvas> {
    if (!requisicao || typeof requisicao !== "object") {
      throw new ErroAplicacao("Informe os parâmetros para gerar curvas de nível.");
    }

    const geometriaFiltro = requisicao.geometria;
    const bboxEntrada = requisicao.bbox;
    if (!geometriaFiltro && !bboxEntrada) {
      throw new ErroAplicacao("Informe uma área para gerar curvas de nível.");
    }
    const bboxOriginal = geometriaFiltro
      ? validarBbox(calcularBboxGeometria(geometriaFiltro))
      : validarBbox(bboxEntrada as NonNullable<typeof bboxEntrada>);
    const intervaloSolicitado = normalizarIntervaloMetros(requisicao.intervaloMetros);
    const resolucaoGradeMetros = CURVAS_RESOLUCAO_GLOBAL_METROS;
    const bboxAmostragem = expandirBboxPorMercator(bboxOriginal, resolucaoGradeMetros * 2);
    const dimensoesOriginais = calcularDimensoesMetros(bboxOriginal);
    const gradeOriginal = await gerarGradeElevacaoApi(this.provedorElevacao, bboxAmostragem, resolucaoGradeMetros);
    const gradeSuavizada = suavizarGrade(gradeOriginal, 1);
    const gradeDensa = densificarGrade(gradeSuavizada, CURVAS_FATOR_DENSIFICACAO);
    const features: FeatureCollectionCurvas["features"] = [];

    if (gradeDensa.altitudeMinima !== null && gradeDensa.altitudeMaxima !== null) {
      const nivelInicial = Math.ceil(gradeDensa.altitudeMinima / intervaloSolicitado) * intervaloSolicitado;
      const nivelFinal = Math.floor(gradeDensa.altitudeMaxima / intervaloSolicitado) * intervaloSolicitado;

      for (let nivel = nivelInicial; nivel <= nivelFinal; nivel += intervaloSolicitado) {
        const segmentos = gerarSegmentosMarchingSquares(gradeDensa, nivel);
        const linhas = unirSegmentos(segmentos, gradeOriginal.resolucaoMetros);
        const tipo = nivel % (intervaloSolicitado * 5) === 0 ? "mestra" : "normal";

        for (const linhaBruta of linhas) {
          const linha = prepararLinhaCurva(linhaBruta, gradeOriginal.resolucaoMetros);
          const linhasCortadasBbox = cortarLinhaParaBbox(linha.linha, bboxOriginal);
          const linhasCortadas = geometriaFiltro
            ? linhasCortadasBbox.flatMap((linhaCortada) => filtrarLinhaPorGeometria(linhaCortada, geometriaFiltro))
            : linhasCortadasBbox;

          for (const linhaCortada of linhasCortadas) {
            const linhaFinal = prepararLinhaCurva(linhaCortada, gradeOriginal.resolucaoMetros);
            if (
              linhaFinal.linha.length < 2 ||
              linhaFinal.comprimentoMetros < Math.max(gradeOriginal.resolucaoMetros * 0.5, 3)
            ) {
              continue;
            }

            features.push({
              type: "Feature",
              properties: {
                elevacao: nivel,
                tipo,
                fonte: "API",
                comprimentoMetros: linhaFinal.comprimentoMetros,
                fechada: linhaFinal.fechada
              },
              geometry: {
                type: "LineString",
                coordinates: linhaFinal.linha
              }
            });
          }
        }
      }
    }

    return {
      type: "FeatureCollection",
      features,
      metadados: {
        fonte: "API",
        metodo: "open_elevation_api_marching_squares_suavizado",
        modoParametros: null,
        resolucaoAutomatica: null,
        resolucaoPorIntervaloMetros: null,
        resolucaoPorAreaMetros: null,
        resolucaoOriginalMetros: null,
        criterioResolucaoAutomatica: null,
        motivoAjusteAutomatico: null,
        maiorDimensaoMetros: dimensoesOriginais.maiorDimensaoMetros,
        areaMetrosQuadrados: dimensoesOriginais.areaMetrosQuadrados,
        intervaloMetros: intervaloSolicitado,
        resolucaoGradeGlobalMetros: resolucaoGradeMetros,
        gradeTravada: true,
        sistemaGrade: "web_mercator_global",
        bboxOriginal,
        bboxAmostragem,
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
        avisoPrecisao: ""
      }
    };
  }
}
