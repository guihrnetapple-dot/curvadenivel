import type { CoordenadaLinhaCurva, SegmentoCurva } from "./tiposCurvas";
import { limitar } from "./validacaoGradeCurvas";

const METROS_POR_GRAU = 111320;

interface PontoProjetado {
  x: number;
  y: number;
}

function latitudeMedia(segmentos: SegmentoCurva[]): number {
  const pontos = segmentos.flat();
  return pontos.reduce((soma, ponto) => soma + ponto[1], 0) / Math.max(1, pontos.length);
}

function projetar(ponto: CoordenadaLinhaCurva, latitudeReferencia: number): PontoProjetado {
  const fatorLng = Math.cos((latitudeReferencia * Math.PI) / 180);
  return {
    x: ponto[0] * METROS_POR_GRAU * fatorLng,
    y: ponto[1] * METROS_POR_GRAU
  };
}

function distanciaMetros(a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva, latitudeReferencia: number): number {
  const pa = projetar(a, latitudeReferencia);
  const pb = projetar(b, latitudeReferencia);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function pontosIguais(a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva, latitudeReferencia: number, tolerancia: number): boolean {
  return distanciaMetros(a, b, latitudeReferencia) <= tolerancia;
}

export function unirSegmentos(segmentos: SegmentoCurva[], resolucaoEfetivaMetros: number): CoordenadaLinhaCurva[][] {
  const tolerancia = limitar(resolucaoEfetivaMetros * 0.01, 0.25, 2);
  const latRef = latitudeMedia(segmentos);
  const pendentes = segmentos.map((segmento) => [segmento[0], segmento[1]] as CoordenadaLinhaCurva[]);
  const linhas: CoordenadaLinhaCurva[][] = [];

  while (pendentes.length > 0) {
    const linha = pendentes.pop() as CoordenadaLinhaCurva[];
    let alterou = true;

    while (alterou) {
      alterou = false;

      for (let indice = pendentes.length - 1; indice >= 0; indice -= 1) {
        const segmento = pendentes[indice];
        const inicioLinha = linha[0];
        const fimLinha = linha[linha.length - 1];
        const inicioSegmento = segmento[0];
        const fimSegmento = segmento[segmento.length - 1];

        if (pontosIguais(fimLinha, inicioSegmento, latRef, tolerancia)) {
          linha.push(...segmento.slice(1));
        } else if (pontosIguais(fimLinha, fimSegmento, latRef, tolerancia)) {
          linha.push(...segmento.slice(0, -1).reverse());
        } else if (pontosIguais(inicioLinha, fimSegmento, latRef, tolerancia)) {
          linha.unshift(...segmento.slice(0, -1));
        } else if (pontosIguais(inicioLinha, inicioSegmento, latRef, tolerancia)) {
          linha.unshift(...segmento.slice(1).reverse());
        } else {
          continue;
        }

        pendentes.splice(indice, 1);
        alterou = true;
        break;
      }
    }

    if (linha.length >= 2) {
      const inicio = linha[0];
      const fim = linha[linha.length - 1];
      if (linha.length > 2 && pontosIguais(inicio, fim, latRef, tolerancia)) {
        linha[linha.length - 1] = inicio;
      }
      linhas.push(linha);
    }
  }

  return linhas;
}
