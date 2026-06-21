import type {
  Coordenada,
  GeometriaPerfil,
  MetricaPropriedade,
  ProvedorElevacao,
  RequisicaoPropriedade,
  ResultadoAltitude,
  ResultadoPropriedade
} from "../../tipos";
import { ErroAplicacao } from "../../utilitarios/erros";
import {
  calcularAreaAproximadaPoligono,
  calcularComprimento,
  calcularDestinoGeografico,
  converterParLngLat,
  distanciaHaversine,
  fecharLinha,
  interpolarCoordenada
} from "../../utilitarios/geometria";

const AMOSTRAS_MAXIMAS_LINHA = 180;
const AMOSTRAS_MAXIMAS_AREA = 220;
const AMOSTRAS_MAXIMAS_PERIMETRO = 180;
const ESPACAMENTO_LINHA_METROS = 30;
const ESPACAMENTO_AREA_METROS = 35;

interface PontoAmostrado extends Coordenada {
  altitude: number | null;
  distanciaMetros?: number;
}

interface ProjecaoLocal {
  latitudeOrigem: number;
  longitudeOrigem: number;
  metrosPorGrauLongitude: number;
}

interface PontoPlano {
  x: number;
  y: number;
}

function formatarNumero(valor: number | null | undefined, casas = 0): string {
  if (!Number.isFinite(valor)) {
    return "-";
  }
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(Number(valor));
}

function formatarMetros(valor: number | null | undefined, casas = 0): string {
  return Number.isFinite(valor) ? `${formatarNumero(Number(valor), casas)} m` : "-";
}

function formatarArea(areaMetrosQuadrados: number | null | undefined): string {
  if (!Number.isFinite(areaMetrosQuadrados)) {
    return "-";
  }
  const area = Number(areaMetrosQuadrados);
  return `${formatarNumero(area, 0)} m² / ${formatarNumero(area / 10000, 4)} ha`;
}

function formatarCoordenada(coordenada: Coordenada | null | undefined): string {
  if (!coordenada) {
    return "-";
  }
  return `${formatarNumero(coordenada.latitude, 6)}, ${formatarNumero(coordenada.longitude, 6)}`;
}

function criarMetrica(
  chave: string,
  item: string,
  valor: string,
  coordenada?: Coordenada,
  unidade?: string
): MetricaPropriedade {
  return {
    chave,
    item,
    valor,
    unidade,
    coordenada,
    clicavel: Boolean(coordenada)
  };
}

function obterAltitudesValidas(pontos: PontoAmostrado[]): PontoAmostrado[] {
  return pontos.filter((ponto) => Number.isFinite(ponto.altitude));
}

function obterPontoExtremo(pontos: PontoAmostrado[], modo: "max" | "min"): PontoAmostrado | null {
  const validos = obterAltitudesValidas(pontos);
  if (validos.length === 0) {
    return null;
  }

  return validos.reduce((melhor, ponto) => {
    if (modo === "max") {
      return Number(ponto.altitude) > Number(melhor.altitude) ? ponto : melhor;
    }
    return Number(ponto.altitude) < Number(melhor.altitude) ? ponto : melhor;
  }, validos[0]);
}

function calcularMediaAltitudes(pontos: PontoAmostrado[]): number | null {
  const validos = obterAltitudesValidas(pontos);
  if (validos.length === 0) {
    return null;
  }
  return validos.reduce((soma, ponto) => soma + Number(ponto.altitude), 0) / validos.length;
}

function criarProjecao(coordenadas: Coordenada[]): ProjecaoLocal {
  const latitudeOrigem =
    coordenadas.reduce((soma, coordenada) => soma + coordenada.latitude, 0) / Math.max(coordenadas.length, 1);
  const longitudeOrigem =
    coordenadas.reduce((soma, coordenada) => soma + coordenada.longitude, 0) / Math.max(coordenadas.length, 1);
  return {
    latitudeOrigem,
    longitudeOrigem,
    metrosPorGrauLongitude: Math.max(1, 111320 * Math.cos((latitudeOrigem * Math.PI) / 180))
  };
}

function projetar(coordenada: Coordenada, projecao: ProjecaoLocal): PontoPlano {
  return {
    x: (coordenada.longitude - projecao.longitudeOrigem) * projecao.metrosPorGrauLongitude,
    y: (coordenada.latitude - projecao.latitudeOrigem) * 111320
  };
}

function desprojetar(ponto: PontoPlano, projecao: ProjecaoLocal): Coordenada {
  return {
    latitude: projecao.latitudeOrigem + ponto.y / 111320,
    longitude: projecao.longitudeOrigem + ponto.x / projecao.metrosPorGrauLongitude
  };
}

function pontoDentroPoligono(ponto: PontoPlano, poligono: PontoPlano[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const pi = poligono[i];
    const pj = poligono[j];
    const cruza = pi.y > ponto.y !== pj.y > ponto.y;
    if (cruza) {
      const xIntersecao = ((pj.x - pi.x) * (ponto.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;
      if (ponto.x < xIntersecao) {
        dentro = !dentro;
      }
    }
  }
  return dentro;
}

function calcularCentroidePoligono(coordenadas: Coordenada[]): Coordenada {
  const anel = fecharLinha(coordenadas);
  const projecao = criarProjecao(anel);
  const pontos = anel.map((coordenada) => projetar(coordenada, projecao));
  let areaDobrada = 0;
  let cx = 0;
  let cy = 0;

  for (let indice = 0; indice < pontos.length - 1; indice += 1) {
    const atual = pontos[indice];
    const proximo = pontos[indice + 1];
    const fator = atual.x * proximo.y - proximo.x * atual.y;
    areaDobrada += fator;
    cx += (atual.x + proximo.x) * fator;
    cy += (atual.y + proximo.y) * fator;
  }

  if (Math.abs(areaDobrada) < 0.000001) {
    return {
      latitude: coordenadas.reduce((soma, coordenada) => soma + coordenada.latitude, 0) / coordenadas.length,
      longitude: coordenadas.reduce((soma, coordenada) => soma + coordenada.longitude, 0) / coordenadas.length
    };
  }

  return desprojetar({ x: cx / (3 * areaDobrada), y: cy / (3 * areaDobrada) }, projecao);
}

function amostrarLinha(
  coordenadas: Coordenada[],
  espacamentoMetros: number,
  limiteAmostras: number
): Array<Coordenada & { distanciaMetros: number }> {
  const comprimentoTotal = calcularComprimento(coordenadas);
  if (coordenadas.length === 1 || comprimentoTotal <= 0) {
    return [{ ...coordenadas[0], distanciaMetros: 0 }];
  }

  const quantidadeIdeal = Math.max(2, Math.ceil(comprimentoTotal / espacamentoMetros) + 1);
  const quantidade = Math.min(limiteAmostras, quantidadeIdeal);
  const passo = comprimentoTotal / (quantidade - 1);
  const segmentos = coordenadas.slice(1).map((fim, indice) => ({
    inicio: coordenadas[indice],
    fim,
    comprimento: distanciaHaversine(coordenadas[indice], fim)
  }));
  const amostras: Array<Coordenada & { distanciaMetros: number }> = [];
  let indiceSegmento = 0;
  let distanciaAntes = 0;

  for (let indice = 0; indice < quantidade; indice += 1) {
    const alvo = indice === quantidade - 1 ? comprimentoTotal : indice * passo;
    while (
      indiceSegmento < segmentos.length - 1 &&
      distanciaAntes + segmentos[indiceSegmento].comprimento < alvo
    ) {
      distanciaAntes += segmentos[indiceSegmento].comprimento;
      indiceSegmento += 1;
    }

    const segmento = segmentos[indiceSegmento];
    const fracao =
      segmento.comprimento > 0
        ? Math.min(Math.max((alvo - distanciaAntes) / segmento.comprimento, 0), 1)
        : 0;
    amostras.push({ ...interpolarCoordenada(segmento.inicio, segmento.fim, fracao), distanciaMetros: alvo });
  }

  return amostras;
}

function amostrarAreaPoligono(coordenadas: Coordenada[]): { pontos: Coordenada[]; ajustada: boolean } {
  const anel = fecharLinha(coordenadas);
  const projecao = criarProjecao(anel);
  const plano = anel.map((coordenada) => projetar(coordenada, projecao));
  const xs = plano.map((ponto) => ponto.x);
  const ys = plano.map((ponto) => ponto.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const largura = Math.max(1, maxX - minX);
  const altura = Math.max(1, maxY - minY);
  const quantidadeIdeal = Math.ceil(largura / ESPACAMENTO_AREA_METROS) * Math.ceil(altura / ESPACAMENTO_AREA_METROS);
  const passo = Math.max(ESPACAMENTO_AREA_METROS, Math.sqrt((largura * altura) / AMOSTRAS_MAXIMAS_AREA));
  const pontos: Coordenada[] = [];

  for (let y = minY + passo / 2; y <= maxY; y += passo) {
    for (let x = minX + passo / 2; x <= maxX; x += passo) {
      if (pontoDentroPoligono({ x, y }, plano)) {
        pontos.push(desprojetar({ x, y }, projecao));
      }
    }
  }

  const centroide = calcularCentroidePoligono(coordenadas);
  if (pontos.length === 0) {
    pontos.push(centroide);
  }

  return { pontos: pontos.slice(0, AMOSTRAS_MAXIMAS_AREA), ajustada: quantidadeIdeal > AMOSTRAS_MAXIMAS_AREA };
}

function amostrarAreaCirculo(centro: Coordenada, raioMetros: number): { pontos: Coordenada[]; ajustada: boolean } {
  const area = Math.PI * raioMetros * raioMetros;
  const quantidadeIdeal = Math.ceil(area / (ESPACAMENTO_AREA_METROS * ESPACAMENTO_AREA_METROS));
  const passo = Math.max(ESPACAMENTO_AREA_METROS, Math.sqrt(area / AMOSTRAS_MAXIMAS_AREA));
  const pontos: Coordenada[] = [centro];

  for (let y = -raioMetros; y <= raioMetros; y += passo) {
    for (let x = -raioMetros; x <= raioMetros; x += passo) {
      if (x === 0 && y === 0) {
        continue;
      }
      const distancia = Math.sqrt(x * x + y * y);
      if (distancia <= raioMetros) {
        const angulo = (Math.atan2(x, y) * 180) / Math.PI;
        pontos.push(calcularDestinoGeografico(centro, distancia, angulo));
      }
    }
  }

  return { pontos: pontos.slice(0, AMOSTRAS_MAXIMAS_AREA), ajustada: quantidadeIdeal > AMOSTRAS_MAXIMAS_AREA };
}

function montarPontos(resultados: ResultadoAltitude[], amostras: Coordenada[]): PontoAmostrado[] {
  return resultados.map((resultado, indice) => ({
    latitude: amostras[indice].latitude,
    longitude: amostras[indice].longitude,
    altitude: Number.isFinite(resultado.altitude) ? resultado.altitude : null
  }));
}

function calcularDirecaoQueda(alto: PontoAmostrado | null, baixo: PontoAmostrado | null): string {
  if (!alto || !baixo) {
    return "-";
  }
  const deltaLat = baixo.latitude - alto.latitude;
  const deltaLng = baixo.longitude - alto.longitude;
  if (Math.abs(deltaLat) < 1e-9 && Math.abs(deltaLng) < 1e-9) {
    return "-";
  }

  const vertical = deltaLat >= 0 ? "sul" : "norte";
  const horizontal = deltaLng >= 0 ? "leste" : "oeste";
  if (Math.abs(deltaLat) > Math.abs(deltaLng) * 1.7) {
    return vertical;
  }
  if (Math.abs(deltaLng) > Math.abs(deltaLat) * 1.7) {
    return horizontal;
  }
  return `${vertical}-${horizontal}`;
}

function metricasAltimetria(
  prefixo: string,
  rotuloArea: string,
  pontos: PontoAmostrado[],
  distanciaReferenciaMetros: number
): MetricaPropriedade[] {
  const alto = obterPontoExtremo(pontos, "max");
  const baixo = obterPontoExtremo(pontos, "min");
  const diferenca =
    alto && baixo && Number.isFinite(alto.altitude) && Number.isFinite(baixo.altitude)
      ? Number(alto.altitude) - Number(baixo.altitude)
      : null;
  const inclinacao =
    Number.isFinite(diferenca) && distanciaReferenciaMetros > 0
      ? (Number(diferenca) / distanciaReferenciaMetros) * 100
      : null;
  const angulo = Number.isFinite(inclinacao) ? (Math.atan(Number(inclinacao) / 100) * 180) / Math.PI : null;

  return [
    criarMetrica(`${prefixo}_ponto_mais_alto`, `Ponto mais alto ${rotuloArea}`, formatarCoordenada(alto), alto ?? undefined),
    criarMetrica(`${prefixo}_altitude_mais_alta`, `Altitude do ponto mais alto ${rotuloArea}`, formatarMetros(alto?.altitude, 2), alto ?? undefined, "m"),
    criarMetrica(`${prefixo}_ponto_mais_baixo`, `Ponto mais baixo ${rotuloArea}`, formatarCoordenada(baixo), baixo ?? undefined),
    criarMetrica(`${prefixo}_altitude_mais_baixa`, `Altitude do ponto mais baixo ${rotuloArea}`, formatarMetros(baixo?.altitude, 2), baixo ?? undefined, "m"),
    criarMetrica(`${prefixo}_diferenca_elevacao`, `Diferença de elevação ${rotuloArea}`, formatarMetros(diferenca, 2), undefined, "m"),
    criarMetrica(`${prefixo}_altitude_media`, `Altitude média ${rotuloArea}`, formatarMetros(calcularMediaAltitudes(pontos), 2), undefined, "m"),
    criarMetrica(`${prefixo}_inclinacao_media`, `Inclinação média estimada ${rotuloArea}`, Number.isFinite(inclinacao) ? `${formatarNumero(inclinacao, 2)} %` : "-"),
    criarMetrica(`${prefixo}_angulo_medio`, `Ângulo médio estimado ${rotuloArea}`, Number.isFinite(angulo) ? `${formatarNumero(angulo, 2)}°` : "-"),
    criarMetrica(`${prefixo}_direcao_queda`, `Direção aproximada de queda ${rotuloArea}`, calcularDirecaoQueda(alto, baixo))
  ];
}

export class ServicoPropriedades {
  constructor(private readonly provedorElevacao: ProvedorElevacao) {}

  async analisarPropriedade(requisicao: RequisicaoPropriedade): Promise<ResultadoPropriedade> {
    if (!requisicao?.geometria) {
      throw new ErroAplicacao("Informe uma geometria para analisar a propriedade.");
    }

    switch (requisicao.geometria.type) {
      case "Point":
        return this.analisarPonto(requisicao);
      case "LineString":
        return this.analisarLinha(requisicao);
      case "Circle":
        return this.analisarCirculo(requisicao);
      case "Polygon":
        return this.analisarPoligono(requisicao);
      default:
        throw new ErroAplicacao("Tipo de geometria não suportado para análise de propriedade.");
    }
  }

  private async consultarPontos(amostras: Coordenada[]): Promise<PontoAmostrado[]> {
    const resultados = await this.provedorElevacao.consultarLote(amostras);
    return montarPontos(resultados, amostras);
  }

  private async analisarPonto(requisicao: RequisicaoPropriedade): Promise<ResultadoPropriedade> {
    const geometria = requisicao.geometria as Extract<GeometriaPerfil, { type: "Point" }>;
    const coordenada = converterParLngLat(geometria.coordinates);
    const [resultado] = await this.consultarPontos([coordenada]);
    const nome = requisicao.nome ?? "Marcador";
    const tipo = requisicao.tipo ?? "Marcador";

    return {
      tipo,
      nome,
      resumo: { nome, tipo, quantidadePontos: 1, coordenadaCentral: coordenada },
      metricas: [
        criarMetrica("latitude", "Latitude", formatarNumero(coordenada.latitude, 6), coordenada),
        criarMetrica("longitude", "Longitude", formatarNumero(coordenada.longitude, 6), coordenada),
        criarMetrica("altitude_ponto", "Altitude do ponto", formatarMetros(resultado.altitude, 2), coordenada, "m"),
        criarMetrica("data_consulta", "Data/hora da consulta", new Date().toLocaleString("pt-BR")),
        criarMetrica("fonte_altitude", "Fonte da altitude", "Open-Elevation"),
        criarMetrica("precisao_estimada", "Precisão estimada", "Média"),
        criarMetrica("coordenada_formatada", "Coordenada formatada", formatarCoordenada(coordenada), coordenada)
      ]
    };
  }

  private async analisarLinha(requisicao: RequisicaoPropriedade): Promise<ResultadoPropriedade> {
    const geometria = requisicao.geometria as Extract<GeometriaPerfil, { type: "LineString" }>;
    const coordenadas = geometria.coordinates.map(converterParLngLat);
    if (coordenadas.length < 2) {
      throw new ErroAplicacao("A linha precisa ter pelo menos dois pontos.");
    }

    const comprimento = calcularComprimento(coordenadas);
    const amostras = amostrarLinha(coordenadas, ESPACAMENTO_LINHA_METROS, AMOSTRAS_MAXIMAS_LINHA);
    const pontos = await this.consultarPontos(amostras);
    pontos.forEach((ponto, indice) => {
      ponto.distanciaMetros = amostras[indice].distanciaMetros;
    });
    const inicio = pontos[0];
    const fim = pontos.at(-1);
    const alto = obterPontoExtremo(pontos, "max");
    const baixo = obterPontoExtremo(pontos, "min");
    const diferenca = alto && baixo ? Number(alto.altitude) - Number(baixo.altitude) : null;
    const declividade = Number.isFinite(diferenca) && comprimento > 0 ? (Number(diferenca) / comprimento) * 100 : null;
    const angulo = Number.isFinite(declividade) ? (Math.atan(Number(declividade) / 100) * 180) / Math.PI : null;
    const nome = requisicao.nome ?? "Linha";
    const tipo = requisicao.tipo ?? "Linha";
    const centro = coordenadas[Math.floor(coordenadas.length / 2)];

    return {
      tipo,
      nome,
      aviso: amostras.length >= AMOSTRAS_MAXIMAS_LINHA ? "Amostragem ajustada automaticamente para evitar excesso de consultas." : undefined,
      resumo: { nome, tipo, quantidadePontos: coordenadas.length, coordenadaCentral: centro },
      metricas: [
        criarMetrica("tipo", "Tipo", "Linha"),
        criarMetrica("quantidade_pontos", "Quantidade de pontos", formatarNumero(coordenadas.length, 0)),
        criarMetrica("comprimento_total", "Comprimento total", formatarMetros(comprimento, 2), undefined, "m"),
        criarMetrica("altitude_inicial", "Altitude no ponto inicial", formatarMetros(inicio?.altitude, 2), inicio, "m"),
        criarMetrica("altitude_final", "Altitude no ponto final", formatarMetros(fim?.altitude, 2), fim, "m"),
        criarMetrica("ponto_mais_alto_linha", "Ponto mais alto na linha", formatarCoordenada(alto), alto ?? undefined),
        criarMetrica("altitude_mais_alta_linha", "Altitude do ponto mais alto na linha", formatarMetros(alto?.altitude, 2), alto ?? undefined, "m"),
        criarMetrica("ponto_mais_baixo_linha", "Ponto mais baixo na linha", formatarCoordenada(baixo), baixo ?? undefined),
        criarMetrica("altitude_mais_baixa_linha", "Altitude do ponto mais baixo na linha", formatarMetros(baixo?.altitude, 2), baixo ?? undefined, "m"),
        criarMetrica("diferenca_elevacao", "Diferença de elevação", formatarMetros(diferenca, 2), undefined, "m"),
        criarMetrica("declividade_media", "Declividade média percentual", Number.isFinite(declividade) ? `${formatarNumero(declividade, 2)} %` : "-"),
        criarMetrica("angulo_medio", "Ângulo médio", Number.isFinite(angulo) ? `${formatarNumero(angulo, 2)}°` : "-"),
        criarMetrica("sentido_queda", "Sentido predominante de queda", calcularDirecaoQueda(alto, baixo)),
        criarMetrica("distancia_ate_ponto_alto", "Comprimento acumulado até o ponto mais alto", formatarMetros(alto?.distanciaMetros, 2), alto ?? undefined, "m"),
        criarMetrica("distancia_ate_ponto_baixo", "Comprimento acumulado até o ponto mais baixo", formatarMetros(baixo?.distanciaMetros, 2), baixo ?? undefined, "m")
      ]
    };
  }

  private async analisarPoligono(requisicao: RequisicaoPropriedade): Promise<ResultadoPropriedade> {
    const geometria = requisicao.geometria as Extract<GeometriaPerfil, { type: "Polygon" }>;
    const coordenadas = fecharLinha(geometria.coordinates[0]?.map(converterParLngLat) ?? []);
    if (coordenadas.length < 4) {
      throw new ErroAplicacao("O polígono precisa ter pelo menos três vértices.");
    }

    const nome = requisicao.nome ?? "Polígono";
    const tipo = requisicao.tipo ?? "Polígono";
    const area = calcularAreaAproximadaPoligono(coordenadas);
    const perimetro = calcularComprimento(coordenadas);
    const centro = calcularCentroidePoligono(coordenadas);
    const amostrasArea = amostrarAreaPoligono(coordenadas);
    const amostrasPerimetro = amostrarLinha(coordenadas, ESPACAMENTO_LINHA_METROS, AMOSTRAS_MAXIMAS_PERIMETRO);
    const [pontosArea, pontosPerimetro, pontoCentro] = await Promise.all([
      this.consultarPontos(amostrasArea.pontos),
      this.consultarPontos(amostrasPerimetro),
      this.consultarPontos([centro])
    ]);
    const rotuloTipo = tipo.toLowerCase().includes("retângulo") ? "Retângulo" : "Polígono";
    const largura = coordenadas.length >= 4 ? distanciaHaversine(coordenadas[0], coordenadas[1]) : null;
    const altura = coordenadas.length >= 4 ? distanciaHaversine(coordenadas[1], coordenadas[2]) : null;
    const metricasBase: MetricaPropriedade[] = [
      criarMetrica("tipo", "Tipo", rotuloTipo),
      criarMetrica("quantidade_vertices", "Quantidade de vértices", formatarNumero(Math.max(0, coordenadas.length - 1), 0)),
      criarMetrica("area_util", "Área útil interna", formatarArea(area)),
      criarMetrica("perimetro", "Perímetro", formatarMetros(perimetro, 2), undefined, "m")
    ];

    if (rotuloTipo === "Retângulo") {
      metricasBase.push(
        criarMetrica("largura", "Largura aproximada", formatarMetros(largura, 2), undefined, "m"),
        criarMetrica("altura", "Altura aproximada", formatarMetros(altura, 2), undefined, "m")
      );
    }

    metricasBase.push(
      criarMetrica("centro", rotuloTipo === "Retângulo" ? "Centro do retângulo" : "Centroide aproximado", formatarCoordenada(centro), centro),
      criarMetrica("altitude_centro", rotuloTipo === "Retângulo" ? "Altitude no centro" : "Altitude no centroide", formatarMetros(pontoCentro[0]?.altitude, 2), centro, "m")
    );

    return {
      tipo,
      nome,
      aviso:
        amostrasArea.ajustada || amostrasPerimetro.length >= AMOSTRAS_MAXIMAS_PERIMETRO
          ? "Amostragem ajustada automaticamente para evitar excesso de consultas."
          : undefined,
      resumo: { nome, tipo, quantidadePontos: Math.max(0, coordenadas.length - 1), coordenadaCentral: centro },
      metricas: [
        ...metricasBase,
        ...metricasAltimetria("area", "dentro da área útil", pontosArea, Math.sqrt(area ?? 0)),
        ...metricasAltimetria("perimetro", "no perímetro", pontosPerimetro, perimetro)
      ]
    };
  }

  private async analisarCirculo(requisicao: RequisicaoPropriedade): Promise<ResultadoPropriedade> {
    const geometria = requisicao.geometria as Extract<GeometriaPerfil, { type: "Circle" }>;
    const centro = converterParLngLat(geometria.center);
    const raio = Number(geometria.radiusMeters);
    if (!Number.isFinite(raio) || raio <= 0) {
      throw new ErroAplicacao("O círculo precisa ter raio válido em metros.");
    }

    const nome = requisicao.nome ?? "Círculo";
    const tipo = requisicao.tipo ?? "Círculo";
    const area = Math.PI * raio * raio;
    const perimetro = 2 * Math.PI * raio;
    const borda = Array.from({ length: 96 }, (_, indice) =>
      calcularDestinoGeografico(centro, raio, (indice / 96) * 360)
    );
    const amostrasArea = amostrarAreaCirculo(centro, raio);
    const amostrasBorda = amostrarLinha(fecharLinha(borda), ESPACAMENTO_LINHA_METROS, AMOSTRAS_MAXIMAS_PERIMETRO);
    const [pontosArea, pontosBorda, pontoCentro] = await Promise.all([
      this.consultarPontos(amostrasArea.pontos),
      this.consultarPontos(amostrasBorda),
      this.consultarPontos([centro])
    ]);

    return {
      tipo,
      nome,
      aviso:
        amostrasArea.ajustada || amostrasBorda.length >= AMOSTRAS_MAXIMAS_PERIMETRO
          ? "Amostragem ajustada automaticamente para evitar excesso de consultas."
          : undefined,
      resumo: { nome, tipo, quantidadePontos: 1, coordenadaCentral: centro },
      metricas: [
        criarMetrica("tipo", "Tipo", "Círculo"),
        criarMetrica("raio", "Raio", formatarMetros(raio, 2), undefined, "m"),
        criarMetrica("diametro", "Diâmetro", formatarMetros(raio * 2, 2), undefined, "m"),
        criarMetrica("area", "Área", formatarArea(area)),
        criarMetrica("circunferencia", "Perímetro ou circunferência", formatarMetros(perimetro, 2), undefined, "m"),
        criarMetrica("centro", "Centro", formatarCoordenada(centro), centro),
        criarMetrica("altitude_centro", "Altitude no centro", formatarMetros(pontoCentro[0]?.altitude, 2), centro, "m"),
        ...metricasAltimetria("area", "dentro da área útil do círculo", pontosArea, raio * 2),
        ...metricasAltimetria("borda", "na borda do círculo", pontosBorda, perimetro)
      ]
    };
  }
}
