import type { ProvedorElevacao } from "../../tipos";
import type { BboxCurvas, GradeCurvas, NoGradeCurvas } from "./tiposCurvas";
import { normalizarResolucaoMetros, validarBbox, validarLimitePontos } from "./validacaoGradeCurvas";

function calcularExtremos(nos: NoGradeCurvas[][]): { altitudeMinima: number | null; altitudeMaxima: number | null } {
  const altitudes = nos
    .flat()
    .map((no) => no.altitude)
    .filter((altitude): altitude is number => Number.isFinite(altitude));

  return {
    altitudeMinima: altitudes.length > 0 ? Math.min(...altitudes) : null,
    altitudeMaxima: altitudes.length > 0 ? Math.max(...altitudes) : null
  };
}

export async function gerarGradeElevacaoApi(
  provedorElevacao: ProvedorElevacao,
  bboxEntrada: BboxCurvas,
  resolucaoEntradaMetros?: number
): Promise<GradeCurvas> {
  const bbox = validarBbox(bboxEntrada);
  const resolucaoSolicitadaMetros = normalizarResolucaoMetros(resolucaoEntradaMetros);
  const ajuste = validarLimitePontos(bbox, resolucaoSolicitadaMetros);
  const coordenadas = [];

  for (let linha = 0; linha < ajuste.linhas; linha += 1) {
    const fracaoLat = ajuste.linhas === 1 ? 0 : linha / (ajuste.linhas - 1);
    const latitude = bbox.maxLat - (bbox.maxLat - bbox.minLat) * fracaoLat;

    for (let coluna = 0; coluna < ajuste.colunas; coluna += 1) {
      const fracaoLng = ajuste.colunas === 1 ? 0 : coluna / (ajuste.colunas - 1);
      const longitude = bbox.minLng + (bbox.maxLng - bbox.minLng) * fracaoLng;
      coordenadas.push({ latitude, longitude });
    }
  }

  const resultados = await provedorElevacao.consultarLote(coordenadas);
  const nos: NoGradeCurvas[][] = [];

  for (let linha = 0; linha < ajuste.linhas; linha += 1) {
    const linhaNos: NoGradeCurvas[] = [];
    for (let coluna = 0; coluna < ajuste.colunas; coluna += 1) {
      const indice = linha * ajuste.colunas + coluna;
      const coordenada = coordenadas[indice];
      linhaNos.push({
        latitude: coordenada.latitude,
        longitude: coordenada.longitude,
        altitude: resultados[indice]?.altitude ?? null
      });
    }
    nos.push(linhaNos);
  }

  return {
    bbox,
    linhas: ajuste.linhas,
    colunas: ajuste.colunas,
    resolucaoMetros: ajuste.resolucaoEfetiva,
    resolucaoSolicitadaMetros,
    resolucaoAjustada: ajuste.resolucaoAjustada,
    pontosConsultados: ajuste.quantidadePontos,
    nos,
    ...calcularExtremos(nos)
  };
}
