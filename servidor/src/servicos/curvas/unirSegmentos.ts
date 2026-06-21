import type { CoordenadaLinhaCurva, SegmentoCurva } from "./tiposCurvas";

function chave(coordenada: CoordenadaLinhaCurva): string {
  return `${coordenada[0].toFixed(7)},${coordenada[1].toFixed(7)}`;
}

function inverter<T>(itens: T[]): T[] {
  return [...itens].reverse();
}

export function unirSegmentos(segmentos: SegmentoCurva[]): CoordenadaLinhaCurva[][] {
  const pendentes = segmentos.map((segmento) => [segmento[0], segmento[1]]);
  const linhas: CoordenadaLinhaCurva[][] = [];

  while (pendentes.length > 0) {
    const linha = pendentes.pop() as CoordenadaLinhaCurva[];
    let alterou = true;

    while (alterou) {
      alterou = false;
      const inicio = chave(linha[0]);
      const fim = chave(linha[linha.length - 1]);

      for (let indice = pendentes.length - 1; indice >= 0; indice -= 1) {
        const segmento = pendentes[indice];
        const segmentoInicio = chave(segmento[0]);
        const segmentoFim = chave(segmento[segmento.length - 1]);

        if (fim === segmentoInicio) {
          linha.push(...segmento.slice(1));
        } else if (fim === segmentoFim) {
          linha.push(...inverter(segmento).slice(1));
        } else if (inicio === segmentoFim) {
          linha.unshift(...segmento.slice(0, -1));
        } else if (inicio === segmentoInicio) {
          linha.unshift(...inverter(segmento).slice(0, -1));
        } else {
          continue;
        }

        pendentes.splice(indice, 1);
        alterou = true;
        break;
      }
    }

    if (linha.length >= 2) {
      linhas.push(linha);
    }
  }

  return linhas;
}
