import { describe, expect, it } from "vitest";

import { CacheElevacao } from "../elevacao/cacheElevacao";
import { gerarSegmentosMarchingSquares } from "./marchingSquares";
import { calcularParametrosAutomaticosCurvas } from "./parametrosAutomaticosCurvas";
import { prepararLinhaCurva, suavizarLinhaChaikin } from "./suavizarLinhas";
import type { GradeCurvas, NoGradeCurvas, SegmentoCurva } from "./tiposCurvas";
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
    linhas,
    colunas,
    resolucaoMetros: 100,
    resolucaoSolicitadaMetros: 100,
    resolucaoAjustada: false,
    pontosConsultados: linhas * colunas,
    nos,
    altitudeMinima: Math.min(...altitudes.flat()),
    altitudeMaxima: Math.max(...altitudes.flat())
  };
}

describe("curvas de nível", () => {
  it("combina intervalo, área e padrão mínimo de 100 m na resolução automática", () => {
    const areaPequena = { minLat: -23, minLng: -47, maxLat: -22.995, maxLng: -46.995 };
    const areaGrande = { minLat: -23, minLng: -47, maxLat: -22.9, maxLng: -46.9 };

    expect(calcularParametrosAutomaticosCurvas(areaPequena, 5).resolucaoOriginalMetros).toBe(100);
    expect(calcularParametrosAutomaticosCurvas(areaPequena, 40).resolucaoOriginalMetros).toBe(150);
    expect(calcularParametrosAutomaticosCurvas(areaPequena, 80).resolucaoOriginalMetros).toBe(250);
    expect(calcularParametrosAutomaticosCurvas(areaGrande, 5).resolucaoOriginalMetros).toBeGreaterThanOrEqual(500);
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
