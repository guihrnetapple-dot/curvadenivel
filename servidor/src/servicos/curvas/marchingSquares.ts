import type { CoordenadaLinhaCurva, GradeCurvas, NoGradeCurvas, SegmentoCurva } from "./tiposCurvas";

const EPSILON = 1e-9;

type BordaCelula = "topo" | "direita" | "base" | "esquerda";

function acimaOuIgual(no: NoGradeCurvas, nivel: number): boolean {
  return (no.altitude ?? Number.NEGATIVE_INFINITY) >= nivel;
}

function bordaCruza(a: NoGradeCurvas, b: NoGradeCurvas, nivel: number): boolean {
  if (a.altitude === null || b.altitude === null) {
    return false;
  }
  if (Math.abs(a.altitude - b.altitude) < EPSILON) {
    return false;
  }
  return (a.altitude < nivel && b.altitude >= nivel) || (b.altitude < nivel && a.altitude >= nivel);
}

function interpolarBorda(a: NoGradeCurvas, b: NoGradeCurvas, nivel: number): CoordenadaLinhaCurva {
  const altitudeA = a.altitude as number;
  const altitudeB = b.altitude as number;
  const fracao = Math.min(Math.max((nivel - altitudeA) / (altitudeB - altitudeA), 0), 1);
  return [
    a.longitude + (b.longitude - a.longitude) * fracao,
    a.latitude + (b.latitude - a.latitude) * fracao
  ];
}

function criarPontoBorda(
  borda: BordaCelula,
  superiorEsquerdo: NoGradeCurvas,
  superiorDireito: NoGradeCurvas,
  inferiorDireito: NoGradeCurvas,
  inferiorEsquerdo: NoGradeCurvas,
  nivel: number
): CoordenadaLinhaCurva | null {
  const pares: Record<BordaCelula, [NoGradeCurvas, NoGradeCurvas]> = {
    topo: [superiorEsquerdo, superiorDireito],
    direita: [superiorDireito, inferiorDireito],
    base: [inferiorDireito, inferiorEsquerdo],
    esquerda: [inferiorEsquerdo, superiorEsquerdo]
  };
  const [inicio, fim] = pares[borda];
  return bordaCruza(inicio, fim, nivel) ? interpolarBorda(inicio, fim, nivel) : null;
}

function conectar(
  pares: Array<[BordaCelula, BordaCelula]>,
  superiorEsquerdo: NoGradeCurvas,
  superiorDireito: NoGradeCurvas,
  inferiorDireito: NoGradeCurvas,
  inferiorEsquerdo: NoGradeCurvas,
  nivel: number
): SegmentoCurva[] {
  const segmentos: SegmentoCurva[] = [];

  for (const [inicio, fim] of pares) {
    const pontoInicio = criarPontoBorda(inicio, superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo, nivel);
    const pontoFim = criarPontoBorda(fim, superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo, nivel);
    if (!pontoInicio || !pontoFim) {
      continue;
    }

    const distanciaQuadrada =
      (pontoInicio[0] - pontoFim[0]) ** 2 + (pontoInicio[1] - pontoFim[1]) ** 2;
    if (distanciaQuadrada > EPSILON * EPSILON) {
      segmentos.push([pontoInicio, pontoFim]);
    }
  }

  return segmentos;
}

function obterParesCasoAmbiguo(
  caso: number,
  superiorEsquerdo: NoGradeCurvas,
  superiorDireito: NoGradeCurvas,
  inferiorDireito: NoGradeCurvas,
  inferiorEsquerdo: NoGradeCurvas,
  nivel: number
): Array<[BordaCelula, BordaCelula]> {
  const q =
    ((superiorEsquerdo.altitude as number) - nivel) * ((inferiorDireito.altitude as number) - nivel) -
    ((superiorDireito.altitude as number) - nivel) * ((inferiorEsquerdo.altitude as number) - nivel);

  if ((caso === 5 && q >= 0) || (caso === 10 && q < 0)) {
    return [
      ["topo", "esquerda"],
      ["direita", "base"]
    ];
  }

  return [
    ["topo", "direita"],
    ["base", "esquerda"]
  ];
}

function obterParesCaso(
  caso: number,
  superiorEsquerdo: NoGradeCurvas,
  superiorDireito: NoGradeCurvas,
  inferiorDireito: NoGradeCurvas,
  inferiorEsquerdo: NoGradeCurvas,
  nivel: number
): Array<[BordaCelula, BordaCelula]> {
  switch (caso) {
    case 0:
    case 15:
      return [];
    case 1:
    case 14:
      return [["topo", "esquerda"]];
    case 2:
    case 13:
      return [["topo", "direita"]];
    case 3:
    case 12:
      return [["esquerda", "direita"]];
    case 4:
    case 11:
      return [["direita", "base"]];
    case 5:
    case 10:
      return obterParesCasoAmbiguo(caso, superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo, nivel);
    case 6:
    case 9:
      return [["topo", "base"]];
    case 7:
    case 8:
      return [["esquerda", "base"]];
    default:
      return [];
  }
}

export function gerarSegmentosMarchingSquares(grade: GradeCurvas, nivel: number): SegmentoCurva[] {
  const segmentos: SegmentoCurva[] = [];

  for (let linha = 0; linha < grade.linhas - 1; linha += 1) {
    for (let coluna = 0; coluna < grade.colunas - 1; coluna += 1) {
      const superiorEsquerdo = grade.nos[linha][coluna];
      const superiorDireito = grade.nos[linha][coluna + 1];
      const inferiorDireito = grade.nos[linha + 1][coluna + 1];
      const inferiorEsquerdo = grade.nos[linha + 1][coluna];
      const cantos = [superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo];

      if (cantos.some((canto) => canto.altitude === null)) {
        continue;
      }

      const caso =
        (acimaOuIgual(superiorEsquerdo, nivel) ? 1 : 0) |
        (acimaOuIgual(superiorDireito, nivel) ? 2 : 0) |
        (acimaOuIgual(inferiorDireito, nivel) ? 4 : 0) |
        (acimaOuIgual(inferiorEsquerdo, nivel) ? 8 : 0);

      segmentos.push(
        ...conectar(
          obterParesCaso(caso, superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo, nivel),
          superiorEsquerdo,
          superiorDireito,
          inferiorDireito,
          inferiorEsquerdo,
          nivel
        )
      );
    }
  }

  return segmentos;
}
