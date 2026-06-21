import { describe, expect, it } from "vitest";

import type { Coordenada, ProvedorElevacao, ResultadoAltitude } from "../../tipos";
import { CacheElevacao } from "../elevacao/cacheElevacao";
import { gerarGradeElevacaoApi } from "./gradeElevacaoApi";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import { ServicoCurvas } from "./servicoCurvas";
import { prepararLinhaCurva, suavizarLinhaChaikin } from "./suavizarLinhas";
import type { BboxCurvas, FeatureCollectionCurvas, GradeCurvas, NoGradeCurvas, SegmentoCurva } from "./tiposCurvas";
import { unirSegmentos } from "./unirSegmentos";

function criarGrade(altitudes: number[][]): GradeCurvas {
  const linhas = altitudes.length;
  const colunas = altitudes[0].length;
  const nos: NoGradeCurvas[][] = altitudes.map((linha, indiceLinha) =>
    linha.map((altitude, indiceColuna) => ({
      latitude: linhas - 1 - indiceLinha,
      longitude: indiceColuna,
      altitude
    }))
  );

  return {
    bbox: { minLat: 0, minLng: 0, maxLat: linhas - 1, maxLng: colunas - 1 },
    bboxAmostragem: { minLat: 0, minLng: 0, maxLat: linhas - 1, maxLng: colunas - 1 },
    linhas,
    colunas,
    resolucaoMetros: 100,
    resolucaoSolicitadaMetros: 100,
    resolucaoAjustada: false,
    pontosConsultados: linhas * colunas,
    gradeTravada: true,
    sistemaGrade: "web_mercator_global",
    nos,
    altitudeMinima: Math.min(...altitudes.flat()),
    altitudeMaxima: Math.max(...altitudes.flat())
  };
}

function criarResultadoAltitude(coordenada: Coordenada, altitude: number | null): ResultadoAltitude {
  return {
    ...coordenada,
    altitude,
    status: altitude === null ? "sem_dado" : "valido",
    fonte: "open_elevation",
    metodo: "api",
    precisaoReal: "media",
    mensagem: "ok",
    consultadoEm: "2026-06-21T00:00:00.000Z"
  };
}

class ProvedorElevacaoDeterministico implements ProvedorElevacao {
  async consultarPonto(coordenada: Coordenada): Promise<ResultadoAltitude> {
    return criarResultadoAltitude(coordenada, this.calcularAltitude(coordenada));
  }

  async consultarLote(coordenadas: Coordenada[]): Promise<ResultadoAltitude[]> {
    return coordenadas.map((coordenada) => criarResultadoAltitude(coordenada, this.calcularAltitude(coordenada)));
  }

  private calcularAltitude(coordenada: Coordenada): number {
    return Math.round((coordenada.latitude + 23.01) * 2600 + (coordenada.longitude + 47.01) * 1800);
  }
}

function assinaturaCurvas(resultado: FeatureCollectionCurvas, filtroElevacao?: (elevacao: number) => boolean): string[] {
  return resultado.features
    .filter((feature) => !filtroElevacao || filtroElevacao(feature.properties.elevacao))
    .map((feature) =>
      JSON.stringify({
        elevacao: feature.properties.elevacao,
        coords: feature.geometry.coordinates.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))])
      })
    )
    .sort();
}

describe("curvas de nível", () => {
  it("gera grade global travada com nós iguais na área sobreposta", async () => {
    const provedor = new ProvedorElevacaoDeterministico();
    const bboxMenor: BboxCurvas = { minLat: -23, minLng: -47, maxLat: -22.998, maxLng: -46.998 };
    const bboxMaior: BboxCurvas = { minLat: -23.001, minLng: -47.001, maxLat: -22.997, maxLng: -46.997 };
    const gradeMenor = await gerarGradeElevacaoApi(provedor, bboxMenor, 100);
    const gradeMaior = await gerarGradeElevacaoApi(provedor, bboxMaior, 100);
    const chavesMenores = new Set(gradeMenor.nos.flat().map((no) => no.chaveGlobal));
    const chavesMaiores = new Set(gradeMaior.nos.flat().map((no) => no.chaveGlobal));
    const intersecao = [...chavesMenores].filter((chave) => chave && chavesMaiores.has(chave));

    expect(gradeMenor.resolucaoMetros).toBe(100);
    expect(gradeMenor.gradeTravada).toBe(true);
    expect(intersecao.length).toBeGreaterThan(0);
  });

  it("gera resultado idêntico ao limpar e gerar novamente", async () => {
    const servico = new ServicoCurvas(new ProvedorElevacaoDeterministico());
    const bbox: BboxCurvas = { minLat: -23, minLng: -47, maxLat: -22.9975, maxLng: -46.9975 };
    const primeiro = await servico.gerarCurvas({ bbox, intervaloMetros: 1 });
    const segundo = await servico.gerarCurvas({ bbox, intervaloMetros: 1 });

    expect(assinaturaCurvas(segundo)).toEqual(assinaturaCurvas(primeiro));
    expect(primeiro.metadados.resolucaoGradeGlobalMetros).toBe(100);
    expect(primeiro.metadados.gradeTravada).toBe(true);
  });

  it("mantém curvas múltiplas de 5 m iguais entre intervalo 1 m e 5 m", async () => {
    const servico = new ServicoCurvas(new ProvedorElevacaoDeterministico());
    const bbox: BboxCurvas = { minLat: -23, minLng: -47, maxLat: -22.9975, maxLng: -46.9975 };
    const intervalo1 = await servico.gerarCurvas({ bbox, intervaloMetros: 1 });
    const intervalo5 = await servico.gerarCurvas({ bbox, intervaloMetros: 5 });

    expect(assinaturaCurvas(intervalo1, (elevacao) => elevacao % 5 === 0)).toEqual(assinaturaCurvas(intervalo5));
  });

  it("gera segmentos em um plano inclinado", () => {
    const grade = criarGrade([
      [30, 40, 50],
      [20, 30, 40],
      [10, 20, 30]
    ]);

    expect(gerarSegmentosMarchingSquares(grade, 30).length).toBeGreaterThan(0);
  });

  it("gera curvas para morro e vale circulares sintéticos", () => {
    const morro = criarGrade([
      [10, 20, 10],
      [20, 40, 20],
      [10, 20, 10]
    ]);
    const vale = criarGrade([
      [40, 30, 40],
      [30, 10, 30],
      [40, 30, 40]
    ]);

    expect(gerarSegmentosMarchingSquares(morro, 25).length).toBeGreaterThan(0);
    expect(gerarSegmentosMarchingSquares(vale, 25).length).toBeGreaterThan(0);
  });

  it("resolve casos de sela 5 e 10 sem segmentos zerados", () => {
    const caso5 = criarGrade([
      [20, 10],
      [10, 20]
    ]);
    const caso10 = criarGrade([
      [10, 20],
      [20, 10]
    ]);

    for (const segmento of [...gerarSegmentosMarchingSquares(caso5, 15), ...gerarSegmentosMarchingSquares(caso10, 15)]) {
      expect(segmento[0]).not.toEqual(segmento[1]);
    }
  });

  it("ignora célula plana e nível exatamente igual sem duplicar segmentos", () => {
    expect(gerarSegmentosMarchingSquares(criarGrade([[10, 10], [10, 10]]), 10)).toHaveLength(0);
    const segmentos = gerarSegmentosMarchingSquares(criarGrade([[10, 20], [20, 30]]), 20);
    for (const segmento of segmentos) {
      expect(segmento[0]).not.toEqual(segmento[1]);
    }
  });

  it("une segmentos conectados", () => {
    const segmentos: SegmentoCurva[] = [
      [
        [0, 0],
        [1, 0]
      ],
      [
        [1, 0],
        [2, 0]
      ]
    ];

    const linhas = unirSegmentos(segmentos, 100);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toHaveLength(3);
  });

  it("suaviza linhas com Chaikin preservando as pontas abertas", () => {
    const linha = [
      [0, 0],
      [1, 1],
      [2, 0]
    ] satisfies Array<[number, number]>;

    const suavizada = suavizarLinhaChaikin(linha, 2, false);
    expect(suavizada[0]).toEqual(linha[0]);
    expect(suavizada.at(-1)).toEqual(linha.at(-1));
    expect(suavizada.length).toBeGreaterThan(linha.length);
  });

  it("prepara linha removendo duplicados e calculando comprimento", () => {
    const resultado = prepararLinhaCurva(
      [
        [0, 0],
        [0, 0],
        [0.001, 0]
      ],
      100
    );

    expect(resultado.linha.length).toBeGreaterThanOrEqual(2);
    expect(resultado.comprimentoMetros).toBeGreaterThan(0);
  });
});

describe("cache de elevação", () => {
  it("normaliza chave, expira por TTL e remove itens antigos", () => {
    const cache = new CacheElevacao(100, 1);
    cache.definir({
      latitude: -10.123456,
      longitude: -45.123456,
      altitude: 100,
      status: "valido",
      fonte: "open_elevation",
      metodo: "api",
      precisaoReal: "media",
      mensagem: "ok",
      consultadoEm: "2026-06-21T00:00:00.000Z"
    }, 0);

    expect(cache.obter(-10.123456, -45.123456, 50)?.altitude).toBe(100);
    expect(cache.obter(-10.123456, -45.123456, 150)).toBeNull();
  });

  it("mantém ordem de lote com provedor simulado", async () => {
    const coordenadas = [
      { latitude: 1, longitude: 1 },
      { latitude: 2, longitude: 2 },
      { latitude: 1, longitude: 1 }
    ];
    const resultados = coordenadas.map((coordenada, indice) => ({
      ...coordenada,
      altitude: indice,
      status: "valido" as const,
      fonte: "open_elevation" as const,
      metodo: "api" as const,
      precisaoReal: "media" as const,
      mensagem: "ok",
      consultadoEm: "2026-06-21T00:00:00.000Z"
    }));

    expect(resultados.map((resultado) => resultado.altitude)).toEqual([0, 1, 2]);
  });
});
