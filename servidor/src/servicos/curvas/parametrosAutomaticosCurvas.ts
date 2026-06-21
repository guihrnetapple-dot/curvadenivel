import { CURVAS_LIMITE_PONTOS_API } from "../../configuracao";
import type { BboxCurvas } from "./tiposCurvas";
import { calcularDimensoesGrade, validarBbox } from "./validacaoGradeCurvas";

const METROS_POR_GRAU_LATITUDE = 111320;

export interface ParametrosAutomaticosCurvas {
  intervaloMetros: number;
  resolucaoMetros: number;
  intervaloOriginalMetros: number;
  resolucaoOriginalMetros: number;
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

function escolherResolucao(maiorDimensaoMetros: number): number {
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

function escolherIntervalo(maiorDimensaoMetros: number): number {
  if (maiorDimensaoMetros <= 1000) {
    return 1;
  }
  if (maiorDimensaoMetros <= 3000) {
    return 2;
  }
  if (maiorDimensaoMetros <= 8000) {
    return 5;
  }
  if (maiorDimensaoMetros <= 20000) {
    return 10;
  }
  return 20;
}

export function obterIntervaloMinimoPorResolucao(resolucaoMetros: number): number {
  return Math.ceil(resolucaoMetros / 100);
}

export function calcularParametrosAutomaticosCurvas(bboxEntrada: BboxCurvas): ParametrosAutomaticosCurvas {
  const bbox = validarBbox(bboxEntrada);
  const dimensoes = calcularDimensoesMetros(bbox);
  const resolucaoOriginalMetros = escolherResolucao(dimensoes.maiorDimensaoMetros);
  const intervaloOriginalMetros = escolherIntervalo(dimensoes.maiorDimensaoMetros);
  let resolucaoMetros = resolucaoOriginalMetros;
  let intervaloMetros = Math.max(intervaloOriginalMetros, obterIntervaloMinimoPorResolucao(resolucaoMetros));
  let motivoAjusteAutomatico: string | null = null;
  let dimensoesGrade = calcularDimensoesGrade(bbox, resolucaoMetros);

  while (dimensoesGrade.quantidadePontos > CURVAS_LIMITE_PONTOS_API) {
    resolucaoMetros *= 1.25;
    const proporcao = resolucaoMetros / resolucaoOriginalMetros;
    intervaloMetros = Math.max(
      obterIntervaloMinimoPorResolucao(resolucaoMetros),
      Math.ceil(intervaloOriginalMetros * proporcao)
    );
    motivoAjusteAutomatico = "A resolução foi ajustada automaticamente para evitar excesso de consultas.";
    dimensoesGrade = calcularDimensoesGrade(bbox, resolucaoMetros);
  }

  return {
    intervaloMetros,
    resolucaoMetros,
    intervaloOriginalMetros,
    resolucaoOriginalMetros,
    motivoAjusteAutomatico,
    maiorDimensaoMetros: dimensoes.maiorDimensaoMetros,
    areaMetrosQuadrados: dimensoes.areaMetrosQuadrados
  };
}
