import type { CoordenadaLinhaCurva } from "./tiposCurvas";
import { limitar } from "./validacaoGradeCurvas";

const METROS_POR_GRAU = 111320;

function latitudeReferencia(linha: CoordenadaLinhaCurva[]): number {
  return linha.reduce((soma, ponto) => soma + ponto[1], 0) / Math.max(1, linha.length);
}

function projetar(ponto: CoordenadaLinhaCurva, latRef: number) {
  const fatorLng = Math.cos((latRef * Math.PI) / 180);
  return { x: ponto[0] * METROS_POR_GRAU * fatorLng, y: ponto[1] * METROS_POR_GRAU };
}

function distancia(a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva, latRef: number): number {
  const pa = projetar(a, latRef);
  const pb = projetar(b, latRef);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function interpolar(a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva, t: number): CoordenadaLinhaCurva {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function calcularComprimentoLinhaMetros(linha: CoordenadaLinhaCurva[]): number {
  const latRef = latitudeReferencia(linha);
  let comprimento = 0;
  for (let indice = 1; indice < linha.length; indice += 1) {
    comprimento += distancia(linha[indice - 1], linha[indice], latRef);
  }
  return comprimento;
}

export function detectarLinhaFechada(linha: CoordenadaLinhaCurva[], toleranciaMetros = 2): boolean {
  if (linha.length < 4) {
    return false;
  }
  return distancia(linha[0], linha[linha.length - 1], latitudeReferencia(linha)) <= toleranciaMetros;
}

export function removerPontosDuplicados(linha: CoordenadaLinhaCurva[], toleranciaMetros = 0.2): CoordenadaLinhaCurva[] {
  if (linha.length <= 1) {
    return linha;
  }

  const latRef = latitudeReferencia(linha);
  const saida: CoordenadaLinhaCurva[] = [linha[0]];
  for (const ponto of linha.slice(1)) {
    if (distancia(saida[saida.length - 1], ponto, latRef) > toleranciaMetros) {
      saida.push(ponto);
    }
  }
  return saida;
}

export function reamostrarLinhaPorDistancia(linha: CoordenadaLinhaCurva[], passoMetros: number): CoordenadaLinhaCurva[] {
  if (linha.length < 2 || passoMetros <= 0) {
    return linha;
  }

  const latRef = latitudeReferencia(linha);
  const comprimento = calcularComprimentoLinhaMetros(linha);
  if (comprimento <= passoMetros) {
    return linha;
  }

  const saida: CoordenadaLinhaCurva[] = [linha[0]];
  let distanciaAlvo = passoMetros;
  let acumulado = 0;

  for (let indice = 1; indice < linha.length; indice += 1) {
    const inicio = linha[indice - 1];
    const fim = linha[indice];
    const tamanhoSegmento = distancia(inicio, fim, latRef);

    while (tamanhoSegmento > 0 && acumulado + tamanhoSegmento >= distanciaAlvo) {
      const t = (distanciaAlvo - acumulado) / tamanhoSegmento;
      saida.push(interpolar(inicio, fim, t));
      distanciaAlvo += passoMetros;
    }

    acumulado += tamanhoSegmento;
  }

  saida.push(linha[linha.length - 1]);
  return removerPontosDuplicados(saida);
}

export function suavizarLinhaChaikin(linha: CoordenadaLinhaCurva[], iteracoes = 2, fechada = false): CoordenadaLinhaCurva[] {
  let atual = [...linha];

  for (let iteracao = 0; iteracao < iteracoes; iteracao += 1) {
    if (atual.length < 3) {
      break;
    }

    const saida: CoordenadaLinhaCurva[] = fechada ? [] : [atual[0]];
    const limite = fechada ? atual.length : atual.length - 1;

    for (let indice = 0; indice < limite; indice += 1) {
      const a = atual[indice];
      const b = atual[(indice + 1) % atual.length];
      saida.push(interpolar(a, b, 0.25), interpolar(a, b, 0.75));
    }

    if (!fechada) {
      saida.push(atual[atual.length - 1]);
    } else if (saida.length > 0) {
      saida.push(saida[0]);
    }

    atual = saida;
  }

  return atual;
}

function distanciaPontoSegmento(ponto: CoordenadaLinhaCurva, a: CoordenadaLinhaCurva, b: CoordenadaLinhaCurva, latRef: number): number {
  const p = projetar(ponto, latRef);
  const pa = projetar(a, latRef);
  const pb = projetar(b, latRef);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const tamanho = dx * dx + dy * dy;
  const t = tamanho === 0 ? 0 : limitar(((p.x - pa.x) * dx + (p.y - pa.y) * dy) / tamanho, 0, 1);
  return Math.hypot(p.x - (pa.x + dx * t), p.y - (pa.y + dy * t));
}

export function simplificarDouglasPeucker(linha: CoordenadaLinhaCurva[], toleranciaMetros: number): CoordenadaLinhaCurva[] {
  if (linha.length <= 2) {
    return linha;
  }

  const latRef = latitudeReferencia(linha);
  let maiorDistancia = 0;
  let indiceMaisDistante = 0;

  for (let indice = 1; indice < linha.length - 1; indice += 1) {
    const distanciaAtual = distanciaPontoSegmento(linha[indice], linha[0], linha[linha.length - 1], latRef);
    if (distanciaAtual > maiorDistancia) {
      maiorDistancia = distanciaAtual;
      indiceMaisDistante = indice;
    }
  }

  if (maiorDistancia <= toleranciaMetros) {
    return [linha[0], linha[linha.length - 1]];
  }

  const esquerda = simplificarDouglasPeucker(linha.slice(0, indiceMaisDistante + 1), toleranciaMetros);
  const direita = simplificarDouglasPeucker(linha.slice(indiceMaisDistante), toleranciaMetros);
  return [...esquerda.slice(0, -1), ...direita];
}

export function prepararLinhaCurva(linha: CoordenadaLinhaCurva[], resolucaoEfetivaMetros: number) {
  const semDuplicados = removerPontosDuplicados(linha);
  const fechada = detectarLinhaFechada(semDuplicados, Math.max(2, resolucaoEfetivaMetros * 0.05));
  const reamostrada = reamostrarLinhaPorDistancia(semDuplicados, limitar(resolucaoEfetivaMetros / 2, 2, 20));
  const suavizada = suavizarLinhaChaikin(reamostrada, 2, fechada);
  const tolerancia = limitar(resolucaoEfetivaMetros / 40, 0.5, 5);
  const simplificada = simplificarDouglasPeucker(suavizada, tolerancia);
  const final = fechada && simplificada.length > 2 ? [...simplificada.slice(0, -1), simplificada[0]] : simplificada;
  const comprimentoMetros = calcularComprimentoLinhaMetros(final);

  return {
    linha: final,
    fechada,
    comprimentoMetros
  };
}
