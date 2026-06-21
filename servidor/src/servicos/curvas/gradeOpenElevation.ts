import { ErroAplicacao } from "../../utilitarios/erros";
import { ServicoOpenElevation } from "../servicoOpenElevation";
import type { BboxCurvas, GradeCurvas, NoGradeCurvas } from "./tiposCurvas";
import { normalizarResolucaoMetros, validarBbox } from "./gradeRawInterpolada";

const METROS_POR_GRAU_LATITUDE = 111320;
const limiteConfigurado = Number(process.env.OPEN_ELEVATION_LIMITE_PONTOS_CURVAS ?? 5000);
const LIMITE_PONTOS_OPEN_ELEVATION = Number.isFinite(limiteConfigurado) ? Math.max(4, limiteConfigurado) : 5000;

export async function gerarGradeOpenElevation(
  servicoOpenElevation: ServicoOpenElevation,
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

  if (linhas * colunas > LIMITE_PONTOS_OPEN_ELEVATION) {
    throw new ErroAplicacao(
      "Área muito grande para usar a API Open-Elevation. Aproxime o mapa ou aumente a resolução."
    );
  }

  const coordenadas = Array.from({ length: linhas * colunas }, (_, indice) => {
    const linha = Math.floor(indice / colunas);
    const coluna = indice % colunas;
    return {
      latitude: bbox.maxLat - Math.min(linha * grausLat, deltaLat),
      longitude: bbox.minLng + Math.min(coluna * grausLng, deltaLng)
    };
  });

  const resultados = await servicoOpenElevation.consultarLote(coordenadas);
  let altitudeMinima: number | null = null;
  let altitudeMaxima: number | null = null;
  const nos: NoGradeCurvas[][] = [];

  for (let linha = 0; linha < linhas; linha += 1) {
    const linhaNos: NoGradeCurvas[] = [];
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const resultado = resultados[linha * colunas + coluna];
      const altitude = resultado.altitude;
      if (altitude !== null) {
        altitudeMinima = altitudeMinima === null ? altitude : Math.min(altitudeMinima, altitude);
        altitudeMaxima = altitudeMaxima === null ? altitude : Math.max(altitudeMaxima, altitude);
      }
      linhaNos.push({ latitude: resultado.latitude, longitude: resultado.longitude, altitude });
    }
    nos.push(linhaNos);
  }

  return { bbox, linhas, colunas, resolucaoMetros, nos, altitudeMinima, altitudeMaxima };
}
