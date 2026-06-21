import {
  CURVAS_LIMITE_PONTOS_API,
  CURVAS_RESOLUCAO_MINIMA_METROS,
  CURVAS_RESOLUCAO_PADRAO_METROS
} from "../../configuracao";
import { ErroAplicacao } from "../../utilitarios/erros";
import type { BboxCurvas } from "./tiposCurvas";

const METROS_POR_GRAU_LATITUDE = 111320;

export function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

export function validarBbox(bbox: BboxCurvas): BboxCurvas {
  if (!bbox || typeof bbox !== "object") {
    throw new ErroAplicacao("Informe o retângulo da área das curvas de nível.");
  }

  const minLat = Number(bbox.minLat);
  const minLng = Number(bbox.minLng);
  const maxLat = Number(bbox.maxLat);
  const maxLng = Number(bbox.maxLng);

  if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite)) {
    throw new ErroAplicacao("O retângulo das curvas possui coordenadas inválidas.");
  }
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
    throw new ErroAplicacao("O retângulo das curvas está fora dos limites geográficos.");
  }
  if (maxLat <= minLat || maxLng <= minLng) {
    throw new ErroAplicacao("Desenhe um retângulo com área válida para gerar curvas de nível.");
  }

  return { minLat, minLng, maxLat, maxLng };
}

export function normalizarResolucaoMetros(resolucaoMetros: unknown): number {
  const valor = Number(resolucaoMetros ?? CURVAS_RESOLUCAO_PADRAO_METROS);
  return Number.isFinite(valor)
    ? Math.max(CURVAS_RESOLUCAO_MINIMA_METROS, valor)
    : CURVAS_RESOLUCAO_PADRAO_METROS;
}

export function converterMetrosParaGraus(resolucaoMetros: number, latitudeReferencia: number) {
  const latStep = resolucaoMetros / METROS_POR_GRAU_LATITUDE;
  const cosLatitude = Math.max(0.01, Math.cos((latitudeReferencia * Math.PI) / 180));
  const lngStep = resolucaoMetros / (METROS_POR_GRAU_LATITUDE * cosLatitude);
  return { latStep, lngStep };
}

export function calcularDimensoesGrade(bbox: BboxCurvas, resolucaoMetros: number) {
  const latitudeReferencia = (bbox.minLat + bbox.maxLat) / 2;
  const { latStep, lngStep } = converterMetrosParaGraus(resolucaoMetros, latitudeReferencia);
  const linhas = Math.max(2, Math.floor((bbox.maxLat - bbox.minLat) / latStep) + 1);
  const colunas = Math.max(2, Math.floor((bbox.maxLng - bbox.minLng) / lngStep) + 1);

  return {
    linhas,
    colunas,
    quantidadePontos: linhas * colunas
  };
}

export function validarLimitePontos(bbox: BboxCurvas, resolucaoSolicitada: number) {
  let resolucaoEfetiva = resolucaoSolicitada;
  let dimensoes = calcularDimensoesGrade(bbox, resolucaoEfetiva);

  while (dimensoes.quantidadePontos > CURVAS_LIMITE_PONTOS_API) {
    resolucaoEfetiva *= 1.25;
    dimensoes = calcularDimensoesGrade(bbox, resolucaoEfetiva);
  }

  return {
    resolucaoEfetiva,
    resolucaoAjustada: resolucaoEfetiva !== resolucaoSolicitada,
    ...dimensoes
  };
}
