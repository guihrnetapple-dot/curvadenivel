import type { BboxCurvas, CoordenadaLinhaCurva } from "./tiposCurvas";

function clipSegmentoLiangBarsky(
  inicio: CoordenadaLinhaCurva,
  fim: CoordenadaLinhaCurva,
  bbox: BboxCurvas
): [CoordenadaLinhaCurva, CoordenadaLinhaCurva] | null {
  const x0 = inicio[0];
  const y0 = inicio[1];
  const x1 = fim[0];
  const y1 = fim[1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;

  const limites = [
    [-dx, x0 - bbox.minLng],
    [dx, bbox.maxLng - x0],
    [-dy, y0 - bbox.minLat],
    [dy, bbox.maxLat - y0]
  ] as const;

  for (const [p, q] of limites) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
      continue;
    }

    const r = q / p;
    if (p < 0) {
      if (r > t1) {
        return null;
      }
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) {
        return null;
      }
      t1 = Math.min(t1, r);
    }
  }

  return [
    [x0 + dx * t0, y0 + dy * t0],
    [x0 + dx * t1, y0 + dy * t1]
  ];
}

function pontosIguais(a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva): boolean {
  return Math.abs(a[0] - b[0]) <= 1e-10 && Math.abs(a[1] - b[1]) <= 1e-10;
}

export function cortarLinhaParaBbox(linha: CoordenadaLinhaCurva[], bbox: BboxCurvas): CoordenadaLinhaCurva[][] {
  const linhas: CoordenadaLinhaCurva[][] = [];
  let atual: CoordenadaLinhaCurva[] = [];

  for (let indice = 1; indice < linha.length; indice += 1) {
    const segmento = clipSegmentoLiangBarsky(linha[indice - 1], linha[indice], bbox);
    if (!segmento) {
      if (atual.length >= 2) {
        linhas.push(atual);
      }
      atual = [];
      continue;
    }

    const [inicio, fim] = segmento;
    if (atual.length === 0) {
      atual.push(inicio, fim);
      continue;
    }

    if (!pontosIguais(atual[atual.length - 1], inicio)) {
      if (atual.length >= 2) {
        linhas.push(atual);
      }
      atual = [inicio];
    }
    if (!pontosIguais(atual[atual.length - 1], fim)) {
      atual.push(fim);
    }
  }

  if (atual.length >= 2) {
    linhas.push(atual);
  }

  return linhas;
}
