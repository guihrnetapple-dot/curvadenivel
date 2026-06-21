import type { Coordenada, ParLngLat } from "../tipos";

const RAIO_TERRA_METROS = 6371008.8;
const RADIANOS_POR_GRAU = Math.PI / 180;
const GRAUS_POR_RADIANO = 180 / Math.PI;

export function converterParLngLat(coordenada: ParLngLat): Coordenada {
  const [longitude, latitude] = coordenada;
  return { latitude, longitude };
}

export function distanciaHaversine(inicio: Coordenada, fim: Coordenada): number {
  const lat1 = inicio.latitude * RADIANOS_POR_GRAU;
  const lat2 = fim.latitude * RADIANOS_POR_GRAU;
  const deltaLat = (fim.latitude - inicio.latitude) * RADIANOS_POR_GRAU;
  const deltaLng = (fim.longitude - inicio.longitude) * RADIANOS_POR_GRAU;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * RAIO_TERRA_METROS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function interpolarCoordenada(
  inicio: Coordenada,
  fim: Coordenada,
  fracao: number
): Coordenada {
  return {
    latitude: inicio.latitude + (fim.latitude - inicio.latitude) * fracao,
    longitude: inicio.longitude + (fim.longitude - inicio.longitude) * fracao
  };
}

export function fecharLinha(coordenadas: Coordenada[]): Coordenada[] {
  if (coordenadas.length < 2) {
    return coordenadas;
  }

  const primeira = coordenadas[0];
  const ultima = coordenadas[coordenadas.length - 1];
  if (primeira.latitude === ultima.latitude && primeira.longitude === ultima.longitude) {
    return coordenadas;
  }

  return [...coordenadas, primeira];
}

export function calcularComprimento(coordenadas: Coordenada[]): number {
  let comprimento = 0;
  for (let indice = 1; indice < coordenadas.length; indice += 1) {
    comprimento += distanciaHaversine(coordenadas[indice - 1], coordenadas[indice]);
  }
  return comprimento;
}

export function calcularAreaAproximadaPoligono(coordenadas: Coordenada[]): number | null {
  if (coordenadas.length < 4) {
    return null;
  }

  const mediaLatitude =
    coordenadas.reduce((soma, coordenada) => soma + coordenada.latitude, 0) /
    coordenadas.length;
  const fatorLongitude = Math.cos(mediaLatitude * RADIANOS_POR_GRAU);

  const pontosProjetados = coordenadas.map((coordenada) => ({
    x: RAIO_TERRA_METROS * coordenada.longitude * RADIANOS_POR_GRAU * fatorLongitude,
    y: RAIO_TERRA_METROS * coordenada.latitude * RADIANOS_POR_GRAU
  }));

  let soma = 0;
  for (let indice = 0; indice < pontosProjetados.length - 1; indice += 1) {
    const atual = pontosProjetados[indice];
    const proximo = pontosProjetados[indice + 1];
    soma += atual.x * proximo.y - proximo.x * atual.y;
  }

  return Math.abs(soma) / 2;
}

export function calcularDestinoGeografico(
  origem: Coordenada,
  distanciaMetros: number,
  anguloGraus: number
): Coordenada {
  const distanciaAngular = distanciaMetros / RAIO_TERRA_METROS;
  const angulo = anguloGraus * RADIANOS_POR_GRAU;
  const lat1 = origem.latitude * RADIANOS_POR_GRAU;
  const lng1 = origem.longitude * RADIANOS_POR_GRAU;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanciaAngular) +
      Math.cos(lat1) * Math.sin(distanciaAngular) * Math.cos(angulo)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(angulo) * Math.sin(distanciaAngular) * Math.cos(lat1),
      Math.cos(distanciaAngular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: lat2 * GRAUS_POR_RADIANO,
    longitude: ((lng2 * GRAUS_POR_RADIANO + 540) % 360) - 180
  };
}
