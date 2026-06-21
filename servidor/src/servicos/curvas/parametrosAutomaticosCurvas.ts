import { CURVAS_LIMITE_PONTOS_API } from "../../configuracao";
import type { BboxCurvas } from "./tiposCurvas";
import { calcularDimensoesGrade, validarBbox } from "./validacaoGradeCurvas";

const METROS_POR_GRAU_LATITUDE = 111320;
const RESOLUCAO_AUTOMATICA_PADRAO_METROS = 100;

export interface ParametrosAutomaticosCurvas {
  resolucaoMetros: number;
  resolucaoOriginalMetros: number;
  resolucaoPorIntervaloMetros: number;
  resolucaoPorAreaMetros: number;
  criterioResolucaoAutomatica: string;
  motivoAjusteAutomatico: string | null;
  maiorDimensaoMetros: number;
  areaMetrosQuadrados: number;
}

function calcularDimensoesMetros(bbox: BboxCurvas) {
  const latitudeReferencia = (bbox.minLat + bbox.maxLat) / 2;
  const fatorLongitude = Math.max(0.01, Math.cos((latitudeReferencia * Math.PI) / 180));
  const larguraMetros = Math.abs(bbox.maxLng - bbox.minLng) * METROS_POR_GRAU_LATITUDE * fatorLongitude;
  const alturaMetros = Math.abs(bbox.maxLat - bbox.minLat) * METROS_POR_GRAU_LATITUDE;
  return {
    larguraMetros,
    alturaMetros,
    maiorDimensaoMetros: Math.max(larguraMetros, alturaMetros),
    areaMetrosQuadrados: larguraMetros * alturaMetros
  };
}

function normalizarIntervaloMetros(intervaloMetros: number): number {
  return Number.isFinite(intervaloMetros) && intervaloMetros > 0 ? intervaloMetros : 5;
}

export function escolherResolucaoPorIntervalo(intervaloMetros: number): number {
  const intervalo = normalizarIntervaloMetros(intervaloMetros);
  if (intervalo <= 5) {
    return 50;
  }
  if (intervalo <= 10) {
    return 75;
  }
  if (intervalo <= 20) {
    return 100;
  }
  if (intervalo <= 40) {
    return 150;
  }
  if (intervalo <= 80) {
    return 250;
  }
  return 300;
}

export function escolherResolucaoPorArea(maiorDimensaoMetros: number): number {
  if (maiorDimensaoMetros <= 1000) {
    return 50;
  }
  if (maiorDimensaoMetros <= 3000) {
    return 100;
  }
  if (maiorDimensaoMetros <= 8000) {
    return 250;
  }
  return 500;
}

export function obterIntervaloMinimoPorResolucao(resolucaoMetros: number): number {
  return Math.ceil(resolucaoMetros / 100);
}

export function calcularParametrosAutomaticosCurvas(
  bboxEntrada: BboxCurvas,
  intervaloMetrosEntrada = 5
): ParametrosAutomaticosCurvas {
  const bbox = validarBbox(bboxEntrada);
  const dimensoes = calcularDimensoesMetros(bbox);
  const resolucaoPorIntervaloMetros = escolherResolucaoPorIntervalo(intervaloMetrosEntrada);
  const resolucaoPorAreaMetros = escolherResolucaoPorArea(dimensoes.maiorDimensaoMetros);
  const resolucaoOriginalMetros = Math.max(
    RESOLUCAO_AUTOMATICA_PADRAO_METROS,
    resolucaoPorIntervaloMetros,
    resolucaoPorAreaMetros
  );
  let resolucaoMetros = resolucaoOriginalMetros;
  let motivoAjusteAutomatico: string | null = null;
  let dimensoesGrade = calcularDimensoesGrade(bbox, resolucaoMetros);

  while (dimensoesGrade.quantidadePontos > CURVAS_LIMITE_PONTOS_API) {
    resolucaoMetros *= 1.25;
    motivoAjusteAutomatico = "A resolução foi ajustada automaticamente para evitar excesso de consultas.";
    dimensoesGrade = calcularDimensoesGrade(bbox, resolucaoMetros);
  }

  return {
    resolucaoMetros,
    resolucaoOriginalMetros,
    resolucaoPorIntervaloMetros,
    resolucaoPorAreaMetros,
    criterioResolucaoAutomatica:
      "Resolução escolhida combinando intervalo das curvas, tamanho da área e limite de pontos da API.",
    motivoAjusteAutomatico,
    maiorDimensaoMetros: dimensoes.maiorDimensaoMetros,
    areaMetrosQuadrados: dimensoes.areaMetrosQuadrados
  };
}
