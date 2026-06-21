import {
  CURVAS_LIMITE_PONTOS_API,
  CURVAS_RESOLUCAO_GLOBAL_METROS
} from "../../configuracao";
import { ErroAplicacao } from "../../utilitarios/erros";
import type { BboxCurvas } from "./tiposCurvas";

const RAIO_TERRA_WEB_MERCATOR = 6378137;
const LATITUDE_MAXIMA_WEB_MERCATOR = 85.05112878;

export interface PontoMercator {
  x: number;
  y: number;
}

export interface BboxMercator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BboxTravadoGlobal extends BboxMercator {
  indiceMinX: number;
  indiceMaxX: number;
  indiceMinY: number;
  indiceMaxY: number;
  linhas: number;
  colunas: number;
  quantidadePontos: number;
}

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
  const valor = Number(resolucaoMetros ?? CURVAS_RESOLUCAO_GLOBAL_METROS);
  return Number.isFinite(valor) && valor > 0 ? valor : CURVAS_RESOLUCAO_GLOBAL_METROS;
}

export function mercatorFromLatLng(latitude: number, longitude: number): PontoMercator {
  const latitudeLimitada = limitar(latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR);
  const latRad = (latitudeLimitada * Math.PI) / 180;
  return {
    x: RAIO_TERRA_WEB_MERCATOR * ((longitude * Math.PI) / 180),
    y: RAIO_TERRA_WEB_MERCATOR * Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  };
}

export function latLngFromMercator(x: number, y: number): { latitude: number; longitude: number } {
  return {
    latitude: (Math.atan(Math.sinh(y / RAIO_TERRA_WEB_MERCATOR)) * 180) / Math.PI,
    longitude: (x / RAIO_TERRA_WEB_MERCATOR) * (180 / Math.PI)
  };
}

export function criarChaveNoGlobal(x: number, y: number, resolucaoMetros: number): string {
  const indiceX = Math.round(x / resolucaoMetros);
  const indiceY = Math.round(y / resolucaoMetros);
  return `${indiceX}:${indiceY}`;
}

export function expandirBboxPorMercator(bboxEntrada: BboxCurvas, paddingMetros: number): BboxCurvas {
  const bbox = validarBbox(bboxEntrada);
  const sudoeste = mercatorFromLatLng(bbox.minLat, bbox.minLng);
  const nordeste = mercatorFromLatLng(bbox.maxLat, bbox.maxLng);
  const min = latLngFromMercator(sudoeste.x - paddingMetros, sudoeste.y - paddingMetros);
  const max = latLngFromMercator(nordeste.x + paddingMetros, nordeste.y + paddingMetros);

  return validarBbox({
    minLat: limitar(min.latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR),
    minLng: limitar(min.longitude, -180, 180),
    maxLat: limitar(max.latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR),
    maxLng: limitar(max.longitude, -180, 180)
  });
}

export function snapBboxParaGradeGlobal(bboxEntrada: BboxCurvas, resolucaoMetros: number): BboxTravadoGlobal {
  const bbox = validarBbox(bboxEntrada);
  const sudoeste = mercatorFromLatLng(bbox.minLat, bbox.minLng);
  const nordeste = mercatorFromLatLng(bbox.maxLat, bbox.maxLng);
  const indiceMinX = Math.floor(sudoeste.x / resolucaoMetros);
  const indiceMaxX = Math.ceil(nordeste.x / resolucaoMetros);
  const indiceMinY = Math.floor(sudoeste.y / resolucaoMetros);
  const indiceMaxY = Math.ceil(nordeste.y / resolucaoMetros);
  const colunas = indiceMaxX - indiceMinX + 1;
  const linhas = indiceMaxY - indiceMinY + 1;

  return {
    indiceMinX,
    indiceMaxX,
    indiceMinY,
    indiceMaxY,
    minX: indiceMinX * resolucaoMetros,
    maxX: indiceMaxX * resolucaoMetros,
    minY: indiceMinY * resolucaoMetros,
    maxY: indiceMaxY * resolucaoMetros,
    linhas,
    colunas,
    quantidadePontos: linhas * colunas
  };
}

export function validarLimitePontosGradeGlobal(bbox: BboxCurvas, resolucaoMetros: number): BboxTravadoGlobal {
  const grade = snapBboxParaGradeGlobal(bbox, resolucaoMetros);
  if (grade.quantidadePontos > CURVAS_LIMITE_PONTOS_API) {
    throw new ErroAplicacao(
      "Área muito grande para a grade fixa de 100 m. Selecione uma área menor para manter curvas estáveis."
    );
  }
  return grade;
}
