import type { ProvedorElevacao } from "../../tipos";
import type { BboxCurvas, GradeCurvas, NoGradeCurvas } from "./tiposCurvas";
import {
  criarChaveNoGlobal,
  latLngFromMercator,
  normalizarResolucaoMetros,
  validarBbox,
  validarLimitePontosGradeGlobal
} from "./validacaoGradeCurvas";

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
  const gradeTravada = validarLimitePontosGradeGlobal(bbox, resolucaoSolicitadaMetros);
  const coordenadas = [];

  for (let indiceY = gradeTravada.indiceMaxY; indiceY >= gradeTravada.indiceMinY; indiceY -= 1) {
    const y = indiceY * resolucaoSolicitadaMetros;

    for (let indiceX = gradeTravada.indiceMinX; indiceX <= gradeTravada.indiceMaxX; indiceX += 1) {
      const x = indiceX * resolucaoSolicitadaMetros;
      const coordenada = latLngFromMercator(x, y);
      coordenadas.push({
        ...coordenada,
        chaveGlobal: criarChaveNoGlobal(x, y, resolucaoSolicitadaMetros)
      });
    }
  }

  const resultados = await provedorElevacao.consultarLote(coordenadas);
  const nos: NoGradeCurvas[][] = [];

  for (let linha = 0; linha < gradeTravada.linhas; linha += 1) {
    const linhaNos: NoGradeCurvas[] = [];
    for (let coluna = 0; coluna < gradeTravada.colunas; coluna += 1) {
      const indice = linha * gradeTravada.colunas + coluna;
      const coordenada = coordenadas[indice];
      linhaNos.push({
        latitude: coordenada.latitude,
        longitude: coordenada.longitude,
        altitude: resultados[indice]?.altitude ?? null,
        chaveGlobal: coordenada.chaveGlobal
      });
    }
    nos.push(linhaNos);
  }

  return {
    bbox,
    bboxAmostragem: bbox,
    linhas: gradeTravada.linhas,
    colunas: gradeTravada.colunas,
    resolucaoMetros: resolucaoSolicitadaMetros,
    resolucaoSolicitadaMetros,
    resolucaoAjustada: false,
    pontosConsultados: gradeTravada.quantidadePontos,
    gradeTravada: true,
    sistemaGrade: "web_mercator_global",
    nos,
    ...calcularExtremos(nos)
  };
}
