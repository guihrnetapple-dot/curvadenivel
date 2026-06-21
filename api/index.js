import { readFile } from "node:fs/promises";
import path from "node:path";

const LARGURA_GRADE = 4320;
const ALTURA_GRADE = 2160;
const RESOLUCAO_POR_GRAU = 12;
const TAMANHO_ESPERADO_ARQUIVO = LARGURA_GRADE * ALTURA_GRADE;
const VALOR_SEM_DADO = 255;
const FATOR_ALTITUDE_METROS = 20;
const RAIO_TERRA_METROS = 6371008.8;
const RADIANOS_POR_GRAU = Math.PI / 180;
const GRAUS_POR_RADIANO = 180 / Math.PI;
const INTERVALO_PADRAO_METROS = 1200;
const INTERVALO_MINIMO_METROS = 150;
const LIMITE_AMOSTRAS = 600;

const caminhoArquivoAltitude =
  process.env.CAMINHO_ARQUIVO_ALTITUDE ??
  path.resolve(process.cwd(), "servidor", "dados", "data10k8b.raw");

let gradeAltitude = null;
let erroCarregamento = null;
let promessaCarregamento = null;

class ErroAplicacao extends Error {
  constructor(mensagem, statusHttp = 400, detalhes = undefined) {
    super(mensagem);
    this.name = "ErroAplicacao";
    this.statusHttp = statusHttp;
    this.detalhes = detalhes;
  }
}

async function carregarArquivo() {
  if (gradeAltitude) return;
  if (promessaCarregamento) return promessaCarregamento;

  promessaCarregamento = readFile(caminhoArquivoAltitude)
    .then((arquivo) => {
      if (arquivo.length !== TAMANHO_ESPERADO_ARQUIVO) {
        throw new ErroAplicacao(
          `O arquivo data10k8b.raw tem ${arquivo.length} bytes, mas o esperado é ${TAMANHO_ESPERADO_ARQUIVO}.`,
          503
        );
      }

      gradeAltitude = arquivo;
      erroCarregamento = null;
    })
    .catch((erro) => {
      gradeAltitude = null;
      erroCarregamento = erro instanceof Error ? erro.message : "Falha desconhecida ao carregar o arquivo RAW.";
      if (erro instanceof ErroAplicacao) throw erro;
      throw new ErroAplicacao(`Não foi possível carregar data10k8b.raw: ${erroCarregamento}`, 503);
    })
    .finally(() => {
      promessaCarregamento = null;
    });

  return promessaCarregamento;
}

function obterStatusAltitude() {
  return {
    arquivoCarregado: Boolean(gradeAltitude),
    caminhoArquivo: caminhoArquivoAltitude,
    tamanhoEsperado: TAMANHO_ESPERADO_ARQUIVO,
    tamanhoCarregado: gradeAltitude?.length ?? 0,
    erro: erroCarregamento
  };
}

function validarCoordenada(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
  }
  if (latitude < -90 || latitude > 90) {
    throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
  }
  if (longitude < -180 || longitude > 180) {
    throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
  }
}

async function consultarPonto(coordenada) {
  await carregarArquivo();

  const latitude = Number(coordenada.latitude);
  const longitude = Number(coordenada.longitude);
  validarCoordenada(latitude, longitude);

  let coluna = Math.floor((longitude + 180) * RESOLUCAO_POR_GRAU);
  let linha = Math.floor((90 - latitude) * RESOLUCAO_POR_GRAU);

  if (coluna === LARGURA_GRADE && longitude === 180) coluna = LARGURA_GRADE - 1;
  if (linha === ALTURA_GRADE && latitude === -90) linha = ALTURA_GRADE - 1;

  if (coluna < 0 || coluna >= LARGURA_GRADE || linha < 0 || linha >= ALTURA_GRADE) {
    throw new ErroAplicacao("A coordenada está fora da cobertura da grade altimétrica.");
  }

  const indice = linha * LARGURA_GRADE + coluna;
  const valorBruto = gradeAltitude[indice];

  if (valorBruto >= VALOR_SEM_DADO) {
    return {
      latitude,
      longitude,
      coluna,
      linha,
      indice,
      valorBruto,
      altitude: null,
      status: "sem_dado",
      mensagem: "Ponto classificado como água, área sem dado ou valor inválido.",
      consultadoEm: new Date().toISOString()
    };
  }

  return {
    latitude,
    longitude,
    coluna,
    linha,
    indice,
    valorBruto,
    altitude: valorBruto * FATOR_ALTITUDE_METROS,
    status: "valido",
    mensagem: "Altitude calculada com sucesso a partir da grade data10k8b.raw.",
    consultadoEm: new Date().toISOString()
  };
}

function converterParLngLat(coordenada) {
  const [longitude, latitude] = coordenada;
  return { latitude, longitude };
}

function distanciaHaversine(inicio, fim) {
  const lat1 = inicio.latitude * RADIANOS_POR_GRAU;
  const lat2 = fim.latitude * RADIANOS_POR_GRAU;
  const deltaLat = (fim.latitude - inicio.latitude) * RADIANOS_POR_GRAU;
  const deltaLng = (fim.longitude - inicio.longitude) * RADIANOS_POR_GRAU;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * RAIO_TERRA_METROS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolarCoordenada(inicio, fim, fracao) {
  return {
    latitude: inicio.latitude + (fim.latitude - inicio.latitude) * fracao,
    longitude: inicio.longitude + (fim.longitude - inicio.longitude) * fracao
  };
}

function fecharLinha(coordenadas) {
  if (coordenadas.length < 2) return coordenadas;
  const primeira = coordenadas[0];
  const ultima = coordenadas[coordenadas.length - 1];
  if (primeira.latitude === ultima.latitude && primeira.longitude === ultima.longitude) return coordenadas;
  return [...coordenadas, primeira];
}

function calcularComprimento(coordenadas) {
  let comprimento = 0;
  for (let indice = 1; indice < coordenadas.length; indice += 1) {
    comprimento += distanciaHaversine(coordenadas[indice - 1], coordenadas[indice]);
  }
  return comprimento;
}

function calcularAreaAproximadaPoligono(coordenadas) {
  if (coordenadas.length < 4) return null;
  const mediaLatitude =
    coordenadas.reduce((soma, coordenada) => soma + coordenada.latitude, 0) / coordenadas.length;
  const fatorLongitude = Math.cos(mediaLatitude * RADIANOS_POR_GRAU);
  const pontosProjetados = coordenadas.map((coordenada) => ({
    x: RAIO_TERRA_METROS * coordenada.longitude * RADIANOS_POR_GRAU * fatorLongitude,
    y: RAIO_TERRA_METROS * coordenada.latitude * RADIANOS_POR_GRAU
  }));

  let soma = 0;
  for (let indice = 0; indice < pontosProjetados.length - 1; indice += 1) {
    const atual = pontosProjetados[indice];
    const proximo = pontosProjetados[indice + 1];
    soma += atual.x * proximo.y - proximo.x * atual.y;
  }

  return Math.abs(soma) / 2;
}

function calcularDestinoGeografico(origem, distanciaMetros, anguloGraus) {
  const distanciaAngular = distanciaMetros / RAIO_TERRA_METROS;
  const angulo = anguloGraus * RADIANOS_POR_GRAU;
  const lat1 = origem.latitude * RADIANOS_POR_GRAU;
  const lng1 = origem.longitude * RADIANOS_POR_GRAU;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanciaAngular) +
      Math.cos(lat1) * Math.sin(distanciaAngular) * Math.cos(angulo)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(angulo) * Math.sin(distanciaAngular) * Math.cos(lat1),
      Math.cos(distanciaAngular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: lat2 * GRAUS_POR_RADIANO,
    longitude: ((lng2 * GRAUS_POR_RADIANO + 540) % 360) - 180
  };
}

function normalizarGeometria(geometria) {
  if (!geometria || typeof geometria !== "object") {
    throw new ErroAplicacao("Informe uma geometria para calcular o perfil de elevação.");
  }

  switch (geometria.type) {
    case "Point":
      return {
        tipo: geometria.type,
        coordenadas: [converterParLngLat(geometria.coordinates)],
        areaMetrosQuadrados: null
      };
    case "LineString": {
      const coordenadas = geometria.coordinates.map(converterParLngLat);
      if (coordenadas.length < 2) throw new ErroAplicacao("A linha precisa ter pelo menos dois pontos.");
      return { tipo: geometria.type, coordenadas, areaMetrosQuadrados: null };
    }
    case "Polygon": {
      const coordenadas = fecharLinha((geometria.coordinates[0] ?? []).map(converterParLngLat));
      if (coordenadas.length < 4) throw new ErroAplicacao("O polígono precisa ter pelo menos três vértices.");
      return {
        tipo: geometria.type,
        coordenadas,
        areaMetrosQuadrados: calcularAreaAproximadaPoligono(coordenadas)
      };
    }
    case "Circle": {
      const centro = converterParLngLat(geometria.center);
      const raio = Number(geometria.radiusMeters);
      if (!Number.isFinite(raio) || raio <= 0) throw new ErroAplicacao("O círculo precisa ter raio válido em metros.");
      const coordenadas = [];
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

function amostrarCaminho(coordenadas, comprimentoTotal, intervaloMetros) {
  if (coordenadas.length === 1 || comprimentoTotal <= 0) {
    return [{ ...coordenadas[0], distanciaMetros: 0 }];
  }

  const quantidade = Math.min(
    LIMITE_AMOSTRAS,
    Math.max(2, Math.ceil(comprimentoTotal / intervaloMetros) + 1)
  );
  const passo = comprimentoTotal / (quantidade - 1);
  const segmentos = coordenadas.slice(1).map((fim, indice) => {
    const inicio = coordenadas[indice];
    return { inicio, fim, comprimento: distanciaHaversine(inicio, fim) };
  });

  const amostras = [];
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
    amostras.push({ ...interpolarCoordenada(segmento.inicio, segmento.fim, fracao), distanciaMetros: distanciaAlvo });
  }

  return amostras;
}

function calcularEstatisticas(pontos, comprimentoTotalMetros, areaMetrosQuadrados) {
  const altitudesValidas = pontos
    .map((ponto) => ponto.altitude)
    .filter((altitude) => Number.isFinite(altitude));
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
      pontosSemDado
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
    pontosSemDado
  };
}

async function analisarPerfil(requisicao) {
  const caminho = normalizarGeometria(requisicao?.geometria);
  const comprimentoTotal = calcularComprimento(caminho.coordenadas);
  const intervaloSolicitado = Number(requisicao.intervaloMetros ?? INTERVALO_PADRAO_METROS);
  const intervaloSeguro = Number.isFinite(intervaloSolicitado)
    ? Math.max(intervaloSolicitado, INTERVALO_MINIMO_METROS)
    : INTERVALO_PADRAO_METROS;
  const amostras = amostrarCaminho(caminho.coordenadas, comprimentoTotal, intervaloSeguro);
  const pontos = await Promise.all(
    amostras.map(async (amostra) => ({
      ...(await consultarPonto(amostra)),
      distanciaMetros: amostra.distanciaMetros
    }))
  );

  return {
    tipo: caminho.tipo,
    pontos,
    estatisticas: calcularEstatisticas(pontos, comprimentoTotal, caminho.areaMetrosQuadrados)
  };
}

function normalizarCoordenadaEntrada(entrada) {
  if (!entrada || typeof entrada !== "object") {
    throw new ErroAplicacao("Cada coordenada precisa ser um objeto com latitude e longitude.");
  }

  return {
    latitude: Number(entrada.latitude ?? entrada.lat),
    longitude: Number(entrada.longitude ?? entrada.lng)
  };
}

function lerCorpo(requisicao) {
  if (!requisicao.body) return {};
  if (typeof requisicao.body === "string") {
    try {
      return JSON.parse(requisicao.body);
    } catch {
      throw new ErroAplicacao("JSON inválido no corpo da requisição.");
    }
  }
  if (typeof requisicao.body === "object") return requisicao.body;
  throw new ErroAplicacao("Corpo da requisição inválido.");
}

function obterCaminhoRota(requisicao) {
  const url = new URL(requisicao.url ?? "/api/status", "http://localhost");
  return url.pathname.replace(/\/+$/, "");
}

function enviarCors(resposta) {
  resposta.setHeader("Access-Control-Allow-Origin", "*");
  resposta.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resposta.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function manipularRota(requisicao, resposta) {
  enviarCors(resposta);

  if (requisicao.method === "OPTIONS") {
    resposta.status(204).end();
    return;
  }

  const caminho = obterCaminhoRota(requisicao);

  if (requisicao.method === "GET" && caminho === "/api/status") {
    await carregarArquivo().catch(() => undefined);
    resposta.status(200).json({
      backendOnline: true,
      dataHora: new Date().toISOString(),
      ambiente: "vercel",
      altitude: obterStatusAltitude()
    });
    return;
  }

  if (requisicao.method === "GET" && caminho === "/api/elevation") {
    resposta.status(200).json(
      await consultarPonto({
        latitude: Number(requisicao.query?.lat ?? requisicao.query?.latitude),
        longitude: Number(requisicao.query?.lng ?? requisicao.query?.longitude)
      })
    );
    return;
  }

  if (requisicao.method === "POST" && caminho === "/api/elevation/batch") {
    const corpo = lerCorpo(requisicao);
    const coordenadas = corpo.coordenadas;
    if (!Array.isArray(coordenadas)) throw new ErroAplicacao("Envie uma lista no campo coordenadas.");
    if (coordenadas.length > 1000) throw new ErroAplicacao("A consulta em lote aceita até 1000 pontos por requisição.");

    const resultados = await Promise.all(coordenadas.map((coordenada) => consultarPonto(normalizarCoordenadaEntrada(coordenada))));
    resposta.status(200).json({ resultados });
    return;
  }

  if (requisicao.method === "POST" && caminho === "/api/elevation/profile") {
    resposta.status(200).json(await analisarPerfil(lerCorpo(requisicao)));
    return;
  }

  throw new ErroAplicacao("Rota não encontrada.", 404);
}

export default async function handler(requisicao, resposta) {
  try {
    await manipularRota(requisicao, resposta);
  } catch (erro) {
    if (erro instanceof ErroAplicacao) {
      resposta.status(erro.statusHttp).json({
        erro: erro.message,
        detalhes: erro.detalhes ?? null
      });
      return;
    }

    resposta.status(500).json({
      erro: "Erro interno na API de altimetria.",
      detalhes: erro instanceof Error ? erro.message : "Erro interno desconhecido."
    });
  }
}
