import type { GradeCurvas, NoGradeCurvas, SegmentoCurva } from "./tiposCurvas";

function cruzaNivel(a: number, b: number, nivel: number): boolean {
  return (a < nivel && b >= nivel) || (b < nivel && a >= nivel);
}

function interpolarBorda(a: NoGradeCurvas, b: NoGradeCurvas, nivel: number): [number, number] {
  const altitudeA = a.altitude ?? nivel;
  const altitudeB = b.altitude ?? nivel;
  const denominador = altitudeB - altitudeA;
  const fracao = denominador === 0 ? 0.5 : (nivel - altitudeA) / denominador;
  return [
    a.longitude + (b.longitude - a.longitude) * fracao,
    a.latitude + (b.latitude - a.latitude) * fracao
  ];
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

      const intersecoes: [number, number][] = [];
      const bordas: Array<[NoGradeCurvas, NoGradeCurvas]> = [
        [superiorEsquerdo, superiorDireito],
        [superiorDireito, inferiorDireito],
        [inferiorDireito, inferiorEsquerdo],
        [inferiorEsquerdo, superiorEsquerdo]
      ];

      for (const [inicio, fim] of bordas) {
        if (cruzaNivel(inicio.altitude as number, fim.altitude as number, nivel)) {
          intersecoes.push(interpolarBorda(inicio, fim, nivel));
        }
      }

      if (intersecoes.length === 2) {
        segmentos.push([intersecoes[0], intersecoes[1]]);
      } else if (intersecoes.length === 4) {
        segmentos.push([intersecoes[0], intersecoes[1]], [intersecoes[2], intersecoes[3]]);
      }
    }
  }

  return segmentos;
}
