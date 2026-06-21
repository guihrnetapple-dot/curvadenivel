import type { GradeCurvas, NoGradeCurvas } from "./tiposCurvas";

const KERNEL_GAUSSIANO = [
  [1, 2, 1],
  [2, 4, 2],
  [1, 2, 1]
];

function calcularExtremos(nos: NoGradeCurvas[][]) {
  const altitudes = nos
    .flat()
    .map((no) => no.altitude)
    .filter((altitude): altitude is number => Number.isFinite(altitude));

  return {
    altitudeMinima: altitudes.length > 0 ? Math.min(...altitudes) : null,
    altitudeMaxima: altitudes.length > 0 ? Math.max(...altitudes) : null
  };
}

export function suavizarGrade(grade: GradeCurvas, iteracoesEntrada = 1): GradeCurvas {
  const iteracoes = Math.min(Math.max(Math.round(iteracoesEntrada), 0), 3);
  let nos = grade.nos.map((linha) => linha.map((no) => ({ ...no })));

  for (let iteracao = 0; iteracao < iteracoes; iteracao += 1) {
    nos = nos.map((linhaNos, linha) =>
      linhaNos.map((no, coluna) => {
        let soma = 0;
        let pesoTotal = 0;
        let vizinhosValidos = 0;

        for (let deltaLinha = -1; deltaLinha <= 1; deltaLinha += 1) {
          for (let deltaColuna = -1; deltaColuna <= 1; deltaColuna += 1) {
            const vizinho = nos[linha + deltaLinha]?.[coluna + deltaColuna];
            const altitude = vizinho?.altitude;
            if (!Number.isFinite(altitude)) {
              continue;
            }

            const peso = KERNEL_GAUSSIANO[deltaLinha + 1][deltaColuna + 1];
            soma += (altitude as number) * peso;
            pesoTotal += peso;
            vizinhosValidos += 1;
          }
        }

        if (pesoTotal === 0 || (no.altitude === null && vizinhosValidos < 5)) {
          return { ...no };
        }

        return { ...no, altitude: soma / pesoTotal };
      })
    );
  }

  return {
    ...grade,
    nos,
    ...calcularExtremos(nos)
  };
}
