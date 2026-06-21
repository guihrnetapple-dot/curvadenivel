import { distanciaHaversine } from "../../utilitarios/geometria";
import type { BboxCurvas, CoordenadaLinhaCurva, GeometriaAreaCurvas } from "./tiposCurvas";

function fecharLinha(linha: CoordenadaLinhaCurva[]): CoordenadaLinhaCurva[] {
  if (linha.length < 2) {
    return linha;
  }

  const primeira = linha[0];
  const ultima = linha[linha.length - 1];
  if (primeira[0] === ultima[0] && primeira[1] === ultima[1]) {
    return linha;
  }

  return [...linha, primeira];
}

function pontoDentroPoligono(ponto: CoordenadaLinhaCurva, poligono: CoordenadaLinhaCurva[]): boolean {
  const [longitude, latitude] = ponto;
  let dentro = false;

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const [lngI, latI] = poligono[i];
    const [lngJ, latJ] = poligono[j];
    const cruza = latI > latitude !== latJ > latitude;
    if (cruza) {
      const lngIntersecao = ((lngJ - lngI) * (latitude - latI)) / (latJ - latI || 1) + lngI;
      if (longitude < lngIntersecao) {
        dentro = !dentro;
      }
    }
  }

  return dentro;
}

function pontoDentroCirculo(ponto: CoordenadaLinhaCurva, geometria: Extract<GeometriaAreaCurvas, { type: "Circle" }>): boolean {
  const [longitude, latitude] = ponto;
  const [centroLng, centroLat] = geometria.center;
  return (
    distanciaHaversine(
      { latitude: centroLat, longitude: centroLng },
      { latitude, longitude }
    ) <= geometria.radiusMeters
  );
}

function pontoDentroGeometria(ponto: CoordenadaLinhaCurva, geometria: GeometriaAreaCurvas): boolean {
  if (geometria.type === "Circle") {
    return pontoDentroCirculo(ponto, geometria);
  }

  const anelExterno = fecharLinha(geometria.coordinates[0] ?? []);
  return anelExterno.length >= 4 && pontoDentroPoligono(ponto, anelExterno);
}

function pontoMedio(inicio: CoordenadaLinhaCurva, fim: CoordenadaLinhaCurva): CoordenadaLinhaCurva {
  return [(inicio[0] + fim[0]) / 2, (inicio[1] + fim[1]) / 2];
}

export function calcularBboxGeometria(geometria: GeometriaAreaCurvas): BboxCurvas {
  if (geometria.type === "Circle") {
    const [longitude, latitude] = geometria.center;
    const deltaLat = geometria.radiusMeters / 111320;
    const deltaLng = geometria.radiusMeters / Math.max(1, 111320 * Math.cos((latitude * Math.PI) / 180));
    return {
      minLat: latitude - deltaLat,
      minLng: longitude - deltaLng,
      maxLat: latitude + deltaLat,
      maxLng: longitude + deltaLng
    };
  }

  const pontos = geometria.coordinates[0] ?? [];
  const latitudes = pontos.map((ponto) => ponto[1]);
  const longitudes = pontos.map((ponto) => ponto[0]);
  return {
    minLat: Math.min(...latitudes),
    minLng: Math.min(...longitudes),
    maxLat: Math.max(...latitudes),
    maxLng: Math.max(...longitudes)
  };
}

export function filtrarLinhaPorGeometria(
  linha: CoordenadaLinhaCurva[],
  geometria: GeometriaAreaCurvas
): CoordenadaLinhaCurva[][] {
  const linhas: CoordenadaLinhaCurva[][] = [];
  let atual: CoordenadaLinhaCurva[] = [];

  for (let indice = 1; indice < linha.length; indice += 1) {
    const inicio = linha[indice - 1];
    const fim = linha[indice];
    const dentro = pontoDentroGeometria(pontoMedio(inicio, fim), geometria);

    if (!dentro) {
      if (atual.length >= 2) {
        linhas.push(atual);
      }
      atual = [];
      continue;
    }

    if (atual.length === 0) {
      atual.push(inicio);
    }
    atual.push(fim);
  }

  if (atual.length >= 2) {
    linhas.push(atual);
  }

  return linhas;
}
