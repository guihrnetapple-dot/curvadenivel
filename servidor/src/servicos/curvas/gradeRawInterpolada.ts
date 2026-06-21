import { ServicoAltitude } from "../servicoAltitude";
import type { BboxCurvas, GradeCurvas, NoGradeCurvas } from "./tiposCurvas";
import { ErroAplicacao } from "../../utilitarios/erros";

export const MIN_RESOLUCAO_METROS = 100;
export const MAX_CELULAS_GRADE = 80000;

const METROS_POR_GRAU_LATITUDE = 111320;

function validarBbox(bbox: BboxCurvas): BboxCurvas {
  const normalizado = {
    minLat: Number(bbox?.minLat),
    minLng: Number(bbox?.minLng),
    maxLat: Number(bbox?.maxLat),
    maxLng: Number(bbox?.maxLng)
  };

  if (Object.values(normalizado).some((valor) => !Number.isFinite(valor))) {
    throw new ErroAplicacao("Informe um bbox válido para gerar curvas de nível.");
  }
  if (normalizado.minLat < -90 || normalizado.maxLat > 90) {
    throw new ErroAplicacao("O bbox precisa manter latitudes entre -90 e 90.");
  }
  if (normalizado.minLng < -180 || normalizado.maxLng > 180) {
    throw new ErroAplicacao("O bbox precisa manter longitudes entre -180 e 180.");
  }
  if (normalizado.minLat >= normalizado.maxLat || normalizado.minLng >= normalizado.maxLng) {
    throw new ErroAplicacao("O bbox precisa ter área válida.");
  }

  return normalizado;
}

export function normalizarResolucaoMetros(resolucaoMetros: unknown): number {
  const valor = Number(resolucaoMetros ?? 250);
  return Number.isFinite(valor) && valor > 0 ? Math.max(valor, MIN_RESOLUCAO_METROS) : 250;
}

export async function gerarGradeRawInterpolada(
  servicoAltitude: ServicoAltitude,
  bboxEntrada: BboxCurvas,
  resolucaoEntradaMetros: unknown
): Promise<GradeCurvas> {
  const bbox = validarBbox(bboxEntrada);
  const resolucaoMetros = normalizarResolucaoMetros(resolucaoEntradaMetros);
  const latitudeMediaRad = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const fatorLongitude = Math.max(Math.abs(Math.cos(latitudeMediaRad)), 0.01);
  const grausLat = resolucaoMetros / METROS_POR_GRAU_LATITUDE;
  const grausLng = resolucaoMetros / (METROS_POR_GRAU_LATITUDE * fatorLongitude);
  const deltaLat = bbox.maxLat - bbox.minLat;
  const deltaLng = bbox.maxLng - bbox.minLng;
  const linhas = Math.max(2, Math.ceil(deltaLat / grausLat) + 1);
  const colunas = Math.max(2, Math.ceil(deltaLng / grausLng) + 1);

  if (linhas * colunas > MAX_CELULAS_GRADE) {
    throw new ErroAplicacao("Área muito grande para gerar curvas. Aproxime o mapa ou aumente a resolução.");
  }

  let altitudeMinima: number | null = null;
  let altitudeMaxima: number | null = null;
  const nos: NoGradeCurvas[][] = [];

  for (let linha = 0; linha < linhas; linha += 1) {
    const latitude = bbox.maxLat - Math.min(linha * grausLat, deltaLat);
    const linhaNos: NoGradeCurvas[] = [];
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const longitude = bbox.minLng + Math.min(coluna * grausLng, deltaLng);
      const resultado = await servicoAltitude.consultarPontoInterpolado({ latitude, longitude });
      const altitude = resultado.status === "valido" ? resultado.altitude : null;
      if (altitude !== null) {
        altitudeMinima = altitudeMinima === null ? altitude : Math.min(altitudeMinima, altitude);
        altitudeMaxima = altitudeMaxima === null ? altitude : Math.max(altitudeMaxima, altitude);
      }
      linhaNos.push({ latitude, longitude, altitude });
    }
    nos.push(linhaNos);
  }

  return { bbox, linhas, colunas, resolucaoMetros, nos, altitudeMinima, altitudeMaxima };
}
