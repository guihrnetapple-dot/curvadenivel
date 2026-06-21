import {
  obterPerfilIntervaloMinimoMetros,
  obterPerfilIntervaloPadraoMetros,
  obterPerfilLimiteAmostras
} from "../configuracao";
import type {
  Coordenada,
  CoordenadaComDistancia,
  EstatisticasPerfil,
  GeometriaPerfil,
  PontoPerfil,
  ProvedorElevacao,
  RequisicaoPerfil,
  ResultadoPerfil
} from "../tipos";
import { ErroAplicacao } from "../utilitarios/erros";
import {
  calcularAreaAproximadaPoligono,
  calcularComprimento,
  calcularDestinoGeografico,
  converterParLngLat,
  distanciaHaversine,
  fecharLinha,
  interpolarCoordenada
} from "../utilitarios/geometria";

interface CaminhoNormalizado {
  tipo: GeometriaPerfil["type"];
  coordenadas: Coordenada[];
  areaMetrosQuadrados: number | null;
}

interface AmostragemPerfil {
  amostras: CoordenadaComDistancia[];
  intervaloEfetivoMetros: number;
  limiteAmostrasAtingido: boolean;
  avisoAmostragem?: string;
}

export class ServicoPerfil {
  constructor(private readonly provedorElevacao: ProvedorElevacao) {}

  async analisarPerfil(requisicao: RequisicaoPerfil): Promise<ResultadoPerfil> {
    if (!requisicao?.geometria) {
      throw new ErroAplicacao("Informe uma geometria para calcular o perfil de elevação.");
    }

    const caminho = this.normalizarGeometria(requisicao.geometria);
    const comprimentoTotal = calcularComprimento(caminho.coordenadas);
    const intervaloPadrao = obterPerfilIntervaloPadraoMetros();
    const intervaloMinimo = obterPerfilIntervaloMinimoMetros();
    const intervaloSolicitado = Number(requisicao.intervaloMetros ?? intervaloPadrao);
    const intervaloSeguro = Number.isFinite(intervaloSolicitado)
      ? Math.max(intervaloSolicitado, intervaloMinimo)
      : intervaloPadrao;

    const amostragem = this.amostrarCaminho(caminho.coordenadas, comprimentoTotal, intervaloSeguro);
    const resultados = await this.provedorElevacao.consultarLote(amostragem.amostras);
    const pontos = resultados.map((resultado, indice) => ({
      ...resultado,
      distanciaMetros: amostragem.amostras[indice].distanciaMetros
    }));

    return {
      tipo: caminho.tipo,
      pontos,
      estatisticas: this.calcularEstatisticas(
        pontos,
        comprimentoTotal,
        caminho.areaMetrosQuadrados,
        amostragem
      )
    };
  }

  private normalizarGeometria(geometria: GeometriaPerfil): CaminhoNormalizado {
    switch (geometria.type) {
      case "Point": {
        return {
          tipo: geometria.type,
          coordenadas: [converterParLngLat(geometria.coordinates)],
          areaMetrosQuadrados: null
        };
      }
      case "LineString": {
        const coordenadas = geometria.coordinates.map(converterParLngLat);
        if (coordenadas.length < 2) {
          throw new ErroAplicacao("A linha precisa ter pelo menos dois pontos.");
        }
        return { tipo: geometria.type, coordenadas, areaMetrosQuadrados: null };
      }
      case "Polygon": {
        const anelExterno = geometria.coordinates[0]?.map(converterParLngLat) ?? [];
        const coordenadas = fecharLinha(anelExterno);
        if (coordenadas.length < 4) {
          throw new ErroAplicacao("O polígono precisa ter pelo menos três vértices.");
        }
        return {
          tipo: geometria.type,
          coordenadas,
          areaMetrosQuadrados: calcularAreaAproximadaPoligono(coordenadas)
        };
      }
      case "Circle": {
        const centro = converterParLngLat(geometria.center);
        const raio = Number(geometria.radiusMeters);
        if (!Number.isFinite(raio) || raio <= 0) {
          throw new ErroAplicacao("O círculo precisa ter raio válido em metros.");
        }

        const coordenadas: Coordenada[] = [];
        for (let indice = 0; indice <= 96; indice += 1) {
          coordenadas.push(calcularDestinoGeografico(centro, raio, (indice / 96) * 360));
        }

        return {
          tipo: geometria.type,
          coordenadas,
          areaMetrosQuadrados: Math.PI * raio * raio
        };
      }
      default:
        throw new ErroAplicacao("Tipo de geometria não suportado para perfil de elevação.");
    }
  }

  private amostrarCaminho(
    coordenadas: Coordenada[],
    comprimentoTotal: number,
    intervaloMetros: number
  ): AmostragemPerfil {
    if (coordenadas.length === 1 || comprimentoTotal <= 0) {
      return {
        amostras: [{ ...coordenadas[0], distanciaMetros: 0 }],
        intervaloEfetivoMetros: 0,
        limiteAmostrasAtingido: false
      };
    }

    const limiteAmostras = obterPerfilLimiteAmostras();
    const quantidadeIdeal = Math.max(2, Math.ceil(comprimentoTotal / intervaloMetros) + 1);
    const quantidade = Math.min(limiteAmostras, quantidadeIdeal);
    const passo = comprimentoTotal / (quantidade - 1);
    const limiteAmostrasAtingido = quantidadeIdeal > limiteAmostras;
    const segmentos = coordenadas.slice(1).map((fim, indice) => {
      const inicio = coordenadas[indice];
      return {
        inicio,
        fim,
        comprimento: distanciaHaversine(inicio, fim)
      };
    });

    const amostras: CoordenadaComDistancia[] = [];
    let indiceSegmento = 0;
    let distanciaAntesDoSegmento = 0;

    for (let indice = 0; indice < quantidade; indice += 1) {
      const distanciaAlvo = indice === quantidade - 1 ? comprimentoTotal : indice * passo;

      while (
        indiceSegmento < segmentos.length - 1 &&
        distanciaAntesDoSegmento + segmentos[indiceSegmento].comprimento < distanciaAlvo
      ) {
        distanciaAntesDoSegmento += segmentos[indiceSegmento].comprimento;
        indiceSegmento += 1;
      }

      const segmento = segmentos[indiceSegmento];
      const distanciaNoSegmento = distanciaAlvo - distanciaAntesDoSegmento;
      const fracao =
        segmento.comprimento > 0 ? Math.min(Math.max(distanciaNoSegmento / segmento.comprimento, 0), 1) : 0;
      const coordenada = interpolarCoordenada(segmento.inicio, segmento.fim, fracao);
      amostras.push({ ...coordenada, distanciaMetros: distanciaAlvo });
    }

    return {
      amostras,
      intervaloEfetivoMetros: passo,
      limiteAmostrasAtingido,
      avisoAmostragem: limiteAmostrasAtingido
        ? `A linha é longa para o intervalo solicitado. O perfil foi limitado a ${limiteAmostras} amostras, com intervalo efetivo de ${passo.toFixed(2)} m.`
        : undefined
    };
  }

  private calcularEstatisticas(
    pontos: PontoPerfil[],
    comprimentoTotalMetros: number,
    areaMetrosQuadrados: number | null,
    amostragem: AmostragemPerfil
  ): EstatisticasPerfil {
    const altitudesValidas = pontos
      .map((ponto) => ponto.altitude)
      .filter((altitude): altitude is number => Number.isFinite(altitude));

    const pontosSemDado = pontos.length - altitudesValidas.length;
    if (altitudesValidas.length === 0) {
      return {
        altitudeMinima: null,
        altitudeMaxima: null,
        altitudeMedia: null,
        diferencaNivel: null,
        inclinacaoMediaPercentual: null,
        comprimentoTotalMetros,
        areaMetrosQuadrados,
        quantidadePontos: pontos.length,
        pontosSemDado,
        limiteAmostrasAtingido: amostragem.limiteAmostrasAtingido,
        intervaloEfetivoMetros: amostragem.intervaloEfetivoMetros,
        avisoAmostragem: amostragem.avisoAmostragem
      };
    }

    const altitudeMinima = Math.min(...altitudesValidas);
    const altitudeMaxima = Math.max(...altitudesValidas);
    const diferencaNivel = altitudeMaxima - altitudeMinima;
    const altitudeMedia = altitudesValidas.reduce((soma, altitude) => soma + altitude, 0) / altitudesValidas.length;

    return {
      altitudeMinima,
      altitudeMaxima,
      altitudeMedia,
      diferencaNivel,
      inclinacaoMediaPercentual: comprimentoTotalMetros > 0 ? (diferencaNivel / comprimentoTotalMetros) * 100 : null,
      comprimentoTotalMetros,
      areaMetrosQuadrados,
      quantidadePontos: pontos.length,
      pontosSemDado,
      limiteAmostrasAtingido: amostragem.limiteAmostrasAtingido,
      intervaloEfetivoMetros: amostragem.intervaloEfetivoMetros,
      avisoAmostragem: amostragem.avisoAmostragem
    };
  }
}
