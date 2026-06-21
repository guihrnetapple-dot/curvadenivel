import { readFile } from "node:fs/promises";
import path from "node:path";

const LARGURA_GRADE = 4320;
const ALTURA_GRADE = 2160;
const RESOLUCAO_POR_GRAU = 12;
const TAMANHO_ESPERADO_ARQUIVO = LARGURA_GRADE * ALTURA_GRADE;
const VALOR_SEM_DADO = 255;
const FATOR_ALTITUDE_METROS = 20;
const RESOLUCAO_FONTE_METROS_APROXIMADA = 10000;
const RAIO_TERRA_METROS = 6371008.8;
const RADIANOS_POR_GRAU = Math.PI / 180;
const GRAUS_POR_RADIANO = 180 / Math.PI;
const INTERVALO_PADRAO_METROS = Number(process.env.PERFIL_INTERVALO_PADRAO_METROS ?? 50);
const INTERVALO_MINIMO_METROS = Number(process.env.PERFIL_INTERVALO_MINIMO_METROS ?? 5);
const LIMITE_AMOSTRAS = Number(process.env.PERFIL_LIMITE_AMOSTRAS ?? 3000);
const CURVAS_MIN_RESOLUCAO_METROS = 100;
const CURVAS_MAX_CELULAS_GRADE = 80000;
const CURVAS_LIMITE_OPEN_ELEVATION_CONFIGURADO = Number(process.env.OPEN_ELEVATION_LIMITE_PONTOS_CURVAS ?? 5000);
const CURVAS_MAX_PONTOS_OPEN_ELEVATION = Number.isFinite(CURVAS_LIMITE_OPEN_ELEVATION_CONFIGURADO)
  ? Math.max(4, CURVAS_LIMITE_OPEN_ELEVATION_CONFIGURADO)
  : 5000;
const CURVAS_INTERVALO_MINIMO_METROS = 20;
const METROS_POR_GRAU_LATITUDE = 111320;
const AVISO_PRECISAO_CURVAS =
  "Curvas aproximadas geradas a partir de grade RAW global de baixa resolução. Não usar como curva de nível topográfica final.";
const AVISO_PRECISAO_CURVAS_OPEN_ELEVATION =
  "Curvas aproximadas geradas pela API Open-Elevation. A precisão depende da base DEM usada pelo serviço e não substitui levantamento topográfico final.";
const OPEN_ELEVATION_API_URL = process.env.OPEN_ELEVATION_API_URL ?? "https://api.open-elevation.com/api/v1/lookup";
const OPEN_ELEVATION_TAMANHO_LOTE_CONFIGURADO = Number(process.env.OPEN_ELEVATION_TAMANHO_LOTE ?? 400);
const OPEN_ELEVATION_TAMANHO_LOTE = Number.isFinite(OPEN_ELEVATION_TAMANHO_LOTE_CONFIGURADO)
  ? Math.max(1, OPEN_ELEVATION_TAMANHO_LOTE_CONFIGURADO)
  : 400;
const OPEN_ELEVATION_TIMEOUT_CONFIGURADO = Number(process.env.OPEN_ELEVATION_TIMEOUT_MS ?? 20000);
const OPEN_ELEVATION_TIMEOUT_MS = Number.isFinite(OPEN_ELEVATION_TIMEOUT_CONFIGURADO)
  ? Math.max(1000, OPEN_ELEVATION_TIMEOUT_CONFIGURADO)
  : 20000;
const MENSAGEM_INTERPOLACAO =
  "Altitude estimada com interpolação bilinear a partir da grade data10k8b.raw. A fonte original possui baixa resolução espacial, portanto os decimais representam suavização matemática, não precisão topográfica real.";

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

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function lerCelula(coluna, linha) {
  const colunaSegura = limitar(coluna, 0, LARGURA_GRADE - 1);
  const linhaSegura = limitar(linha, 0, ALTURA_GRADE - 1);
  const indice = linhaSegura * LARGURA_GRADE + colunaSegura;
  if (indice < 0 || indice >= TAMANHO_ESPERADO_ARQUIVO) {
    throw new ErroAplicacao("O índice calculado ficou fora do tamanho do arquivo RAW.");
  }

  const valorBruto = gradeAltitude[indice];
  return {
    coluna: colunaSegura,
    linha: linhaSegura,
    indice,
    valorBruto,
    valido: valorBruto < VALOR_SEM_DADO
  };
}

function amostrarGradeInterpolada(latitude, longitude) {
  validarCoordenada(latitude, longitude);

  const x = limitar((longitude + 180) * RESOLUCAO_POR_GRAU, 0, LARGURA_GRADE - 1);
  const y = limitar((90 - latitude) * RESOLUCAO_POR_GRAU, 0, ALTURA_GRADE - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = limitar(x0 + 1, 0, LARGURA_GRADE - 1);
  const y1 = limitar(y0 + 1, 0, ALTURA_GRADE - 1);
  const tx = x - x0;
  const ty = y - y0;

  const q00 = lerCelula(x0, y0);
  const q10 = lerCelula(x1, y0);
  const q01 = lerCelula(x0, y1);
  const q11 = lerCelula(x1, y1);
  const vizinhos = [
    { celula: q00, peso: (1 - tx) * (1 - ty) },
    { celula: q10, peso: tx * (1 - ty) },
    { celula: q01, peso: (1 - tx) * ty },
    { celula: q11, peso: tx * ty }
  ];
  const validos = vizinhos.filter((vizinho) => vizinho.celula.valido);

  if (validos.length === 0) {
    return {
      coluna: q00.coluna,
      linha: q00.linha,
      indice: q00.indice,
      valorBruto: q00.valorBruto,
      valorBrutoInterpolado: null,
      altitude: null,
      status: "sem_dado",
      metodo: "bilinear_parcial"
    };
  }

  const somaPesos = validos.reduce((soma, vizinho) => soma + vizinho.peso, 0);
  const valorBrutoInterpolado =
    somaPesos > 0
      ? validos.reduce((soma, vizinho) => soma + vizinho.celula.valorBruto * vizinho.peso, 0) / somaPesos
      : validos.reduce((soma, vizinho) => soma + vizinho.celula.valorBruto, 0) / validos.length;

  return {
    coluna: q00.coluna,
    linha: q00.linha,
    indice: q00.indice,
    valorBruto: q00.valorBruto,
    valorBrutoInterpolado,
    altitude: valorBrutoInterpolado * FATOR_ALTITUDE_METROS,
    status: "valido",
    metodo: validos.length === 4 ? "bilinear" : "bilinear_parcial"
  };
}

async function consultarPonto(coordenada) {
  await carregarArquivo();

  const latitude = Number(coordenada.latitude);
  const longitude = Number(coordenada.longitude);
  const amostra = amostrarGradeInterpolada(latitude, longitude);

  if (amostra.status === "sem_dado") {
    return {
      latitude,
      longitude,
      coluna: amostra.coluna,
      linha: amostra.linha,
      indice: amostra.indice,
      valorBruto: amostra.valorBruto,
      metodo: amostra.metodo,
      resolucaoFonteMetrosAproximada: RESOLUCAO_FONTE_METROS_APROXIMADA,
      precisaoReal: "baixa",
      avisoPrecisao: "Estimativa suavizada por interpolação matemática; a precisão real depende da resolução da fonte DEM.",
      altitude: null,
      status: "sem_dado",
      mensagem: "Ponto classificado como água, área sem dado ou valor inválido na vizinhança da grade.",
      consultadoEm: new Date().toISOString()
    };
  }

  return {
    latitude,
    longitude,
    coluna: amostra.coluna,
    linha: amostra.linha,
    indice: amostra.indice,
    valorBruto: amostra.valorBruto,
    valorBrutoInterpolado: amostra.valorBrutoInterpolado,
    metodo: amostra.metodo,
    resolucaoFonteMetrosAproximada: RESOLUCAO_FONTE_METROS_APROXIMADA,
    precisaoReal: "baixa",
    avisoPrecisao: "Estimativa suavizada por interpolação matemática; a precisão real depende da resolução da fonte DEM.",
    altitude: amostra.altitude,
    status: "valido",
    mensagem: MENSAGEM_INTERPOLACAO,
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
    return {
      amostras: [{ ...coordenadas[0], distanciaMetros: 0 }],
      intervaloEfetivoMetros: 0,
      limiteAmostrasAtingido: false
    };
  }

  const limiteAmostras = Number.isInteger(LIMITE_AMOSTRAS) && LIMITE_AMOSTRAS >= 2 ? LIMITE_AMOSTRAS : 3000;
  const quantidadeIdeal = Math.max(2, Math.ceil(comprimentoTotal / intervaloMetros) + 1);
  const quantidade = Math.min(limiteAmostras, quantidadeIdeal);
  const passo = comprimentoTotal / (quantidade - 1);
  const limiteAmostrasAtingido = quantidadeIdeal > limiteAmostras;
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

  return {
    amostras,
    intervaloEfetivoMetros: passo,
    limiteAmostrasAtingido,
    avisoAmostragem: limiteAmostrasAtingido
      ? `A linha é longa para o intervalo solicitado. O perfil foi limitado a ${limiteAmostras} amostras, com intervalo efetivo de ${passo.toFixed(2)} m.`
      : undefined
  };
}

function calcularEstatisticas(pontos, comprimentoTotalMetros, areaMetrosQuadrados, amostragem) {
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

async function analisarPerfil(requisicao) {
  const caminho = normalizarGeometria(requisicao?.geometria);
  const comprimentoTotal = calcularComprimento(caminho.coordenadas);
  const intervaloPadrao = Number.isFinite(INTERVALO_PADRAO_METROS) && INTERVALO_PADRAO_METROS > 0 ? INTERVALO_PADRAO_METROS : 50;
  const intervaloMinimo = Number.isFinite(INTERVALO_MINIMO_METROS) && INTERVALO_MINIMO_METROS > 0 ? INTERVALO_MINIMO_METROS : 5;
  const intervaloSolicitado = Number(requisicao.intervaloMetros ?? intervaloPadrao);
  const intervaloSeguro = Number.isFinite(intervaloSolicitado)
    ? Math.max(intervaloSolicitado, intervaloMinimo)
    : intervaloPadrao;
  const amostragem = amostrarCaminho(caminho.coordenadas, comprimentoTotal, intervaloSeguro);
  const pontos = await Promise.all(
    amostragem.amostras.map(async (amostra) => ({
      ...(await consultarPonto(amostra)),
      distanciaMetros: amostra.distanciaMetros
    }))
  );

  return {
    tipo: caminho.tipo,
    pontos,
    estatisticas: calcularEstatisticas(pontos, comprimentoTotal, caminho.areaMetrosQuadrados, amostragem)
  };
}

function normalizarBboxCurvas(bbox) {
  const normalizado = {
    minLat: Number(bbox?.minLat),
    minLng: Number(bbox?.minLng),
    maxLat: Number(bbox?.maxLat),
    maxLng: Number(bbox?.maxLng)
  };

  if (Object.values(normalizado).some((valor) => !Number.isFinite(valor))) {
    throw new ErroAplicacao("Informe um bbox válido para gerar curvas de nível.");
  }
  if (normalizado.minLat < -90 || normalizado.maxLat > 90) {
    throw new ErroAplicacao("O bbox precisa manter latitudes entre -90 e 90.");
  }
  if (normalizado.minLng < -180 || normalizado.maxLng > 180) {
    throw new ErroAplicacao("O bbox precisa manter longitudes entre -180 e 180.");
  }
  if (normalizado.minLat >= normalizado.maxLat || normalizado.minLng >= normalizado.maxLng) {
    throw new ErroAplicacao("O bbox precisa ter área válida.");
  }

  return normalizado;
}

function normalizarResolucaoCurvas(resolucaoMetros) {
  const valor = Number(resolucaoMetros ?? 250);
  return Number.isFinite(valor) && valor > 0 ? Math.max(valor, CURVAS_MIN_RESOLUCAO_METROS) : 250;
}

function normalizarIntervaloCurvas(intervaloMetros) {
  const valor = Number(intervaloMetros ?? 20);
  return Number.isFinite(valor) && valor > 0 ? Math.max(valor, CURVAS_INTERVALO_MINIMO_METROS) : 20;
}

async function gerarGradeRawInterpoladaCurvas(bboxEntrada, resolucaoEntradaMetros) {
  const bbox = normalizarBboxCurvas(bboxEntrada);
  const resolucaoMetros = normalizarResolucaoCurvas(resolucaoEntradaMetros);
  const latitudeMediaRad = ((bbox.minLat + bbox.maxLat) / 2) * RADIANOS_POR_GRAU;
  const fatorLongitude = Math.max(Math.abs(Math.cos(latitudeMediaRad)), 0.01);
  const grausLat = resolucaoMetros / METROS_POR_GRAU_LATITUDE;
  const grausLng = resolucaoMetros / (METROS_POR_GRAU_LATITUDE * fatorLongitude);
  const deltaLat = bbox.maxLat - bbox.minLat;
  const deltaLng = bbox.maxLng - bbox.minLng;
  const linhas = Math.max(2, Math.ceil(deltaLat / grausLat) + 1);
  const colunas = Math.max(2, Math.ceil(deltaLng / grausLng) + 1);

  if (linhas * colunas > CURVAS_MAX_CELULAS_GRADE) {
    throw new ErroAplicacao("Área muito grande para gerar curvas. Aproxime o mapa ou aumente a resolução.");
  }

  await carregarArquivo();
  let altitudeMinima = null;
  let altitudeMaxima = null;
  const nos = [];

  for (let linha = 0; linha < linhas; linha += 1) {
    const latitude = bbox.maxLat - Math.min(linha * grausLat, deltaLat);
    const linhaNos = [];
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const longitude = bbox.minLng + Math.min(coluna * grausLng, deltaLng);
      const amostra = amostrarGradeInterpolada(latitude, longitude);
      const altitude = amostra.status === "valido" ? amostra.altitude : null;
      if (altitude !== null) {
        altitudeMinima = altitudeMinima === null ? altitude : Math.min(altitudeMinima, altitude);
        altitudeMaxima = altitudeMaxima === null ? altitude : Math.max(altitudeMaxima, altitude);
      }
      linhaNos.push({ latitude, longitude, altitude });
    }
    nos.push(linhaNos);
  }

  return { bbox, linhas, colunas, resolucaoMetros, nos, altitudeMinima, altitudeMaxima };
}

async function consultarOpenElevationLote(coordenadas) {
  const resultados = [];

  for (let indice = 0; indice < coordenadas.length; indice += OPEN_ELEVATION_TAMANHO_LOTE) {
    const lote = coordenadas.slice(indice, indice + OPEN_ELEVATION_TAMANHO_LOTE);
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), OPEN_ELEVATION_TIMEOUT_MS);

    try {
      const resposta = await fetch(OPEN_ELEVATION_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locations: lote.map((coordenada) => ({
            latitude: coordenada.latitude,
            longitude: coordenada.longitude
          }))
        }),
        signal: controlador.signal
      });

      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new ErroAplicacao(`Open-Elevation respondeu com status ${resposta.status}.`, 502, corpo);
      }
      if (!Array.isArray(corpo?.results) || corpo.results.length !== lote.length) {
        throw new ErroAplicacao("A resposta da Open-Elevation veio em formato inesperado.", 502, corpo);
      }

      resultados.push(
        ...corpo.results.map((resultado, itemIndice) => ({
          latitude: Number(resultado.latitude ?? lote[itemIndice].latitude),
          longitude: Number(resultado.longitude ?? lote[itemIndice].longitude),
          altitude: Number.isFinite(Number(resultado.elevation)) ? Number(resultado.elevation) : null
        }))
      );
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida na API Open-Elevation.";
      throw new ErroAplicacao(`Não foi possível consultar a Open-Elevation: ${mensagem}`, 502);
    } finally {
      clearTimeout(temporizador);
    }
  }

  return resultados;
}

async function consultarPontoOpenElevation(coordenada) {
  const latitude = Number(coordenada.latitude);
  const longitude = Number(coordenada.longitude);
  validarCoordenada(latitude, longitude);

  const [resultado] = await consultarOpenElevationLote([{ latitude, longitude }]);
  const altitude = resultado?.altitude ?? null;

  return {
    latitude,
    longitude,
    coluna: 0,
    linha: 0,
    indice: 0,
    valorBruto: altitude ?? 0,
    valorBrutoInterpolado: altitude ?? undefined,
    metodo: "bilinear",
    precisaoReal: "media",
    avisoPrecisao:
      "Altitude consultada na API Open-Elevation. A precisão depende da base DEM usada pelo serviço.",
    altitude,
    status: altitude === null ? "sem_dado" : "valido",
    mensagem:
      altitude === null
        ? "A API Open-Elevation não retornou altitude válida para esse ponto."
        : "Altitude consultada pela API Open-Elevation.",
    consultadoEm: new Date().toISOString()
  };
}

async function gerarGradeOpenElevationCurvas(bboxEntrada, resolucaoEntradaMetros) {
  const bbox = normalizarBboxCurvas(bboxEntrada);
  const resolucaoMetros = normalizarResolucaoCurvas(resolucaoEntradaMetros);
  const latitudeMediaRad = ((bbox.minLat + bbox.maxLat) / 2) * RADIANOS_POR_GRAU;
  const fatorLongitude = Math.max(Math.abs(Math.cos(latitudeMediaRad)), 0.01);
  const grausLat = resolucaoMetros / METROS_POR_GRAU_LATITUDE;
  const grausLng = resolucaoMetros / (METROS_POR_GRAU_LATITUDE * fatorLongitude);
  const deltaLat = bbox.maxLat - bbox.minLat;
  const deltaLng = bbox.maxLng - bbox.minLng;
  const linhas = Math.max(2, Math.ceil(deltaLat / grausLat) + 1);
  const colunas = Math.max(2, Math.ceil(deltaLng / grausLng) + 1);

  if (linhas * colunas > CURVAS_MAX_PONTOS_OPEN_ELEVATION) {
    throw new ErroAplicacao("Área muito grande para usar a API Open-Elevation. Aproxime o mapa ou aumente a resolução.");
  }

  const coordenadas = Array.from({ length: linhas * colunas }, (_valor, indice) => {
    const linha = Math.floor(indice / colunas);
    const coluna = indice % colunas;
    return {
      latitude: bbox.maxLat - Math.min(linha * grausLat, deltaLat),
      longitude: bbox.minLng + Math.min(coluna * grausLng, deltaLng)
    };
  });
  const resultados = await consultarOpenElevationLote(coordenadas);
  let altitudeMinima = null;
  let altitudeMaxima = null;
  const nos = [];

  for (let linha = 0; linha < linhas; linha += 1) {
    const linhaNos = [];
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const resultado = resultados[linha * colunas + coluna];
      const altitude = resultado.altitude;
      if (altitude !== null) {
        altitudeMinima = altitudeMinima === null ? altitude : Math.min(altitudeMinima, altitude);
        altitudeMaxima = altitudeMaxima === null ? altitude : Math.max(altitudeMaxima, altitude);
      }
      linhaNos.push({ latitude: resultado.latitude, longitude: resultado.longitude, altitude });
    }
    nos.push(linhaNos);
  }

  return { bbox, linhas, colunas, resolucaoMetros, nos, altitudeMinima, altitudeMaxima };
}

function cruzaNivel(a, b, nivel) {
  return (a < nivel && b >= nivel) || (b < nivel && a >= nivel);
}

function interpolarBordaCurva(a, b, nivel) {
  const denominador = b.altitude - a.altitude;
  const fracao = denominador === 0 ? 0.5 : (nivel - a.altitude) / denominador;
  return [
    a.longitude + (b.longitude - a.longitude) * fracao,
    a.latitude + (b.latitude - a.latitude) * fracao
  ];
}

function gerarSegmentosMarchingSquares(grade, nivel) {
  const segmentos = [];
  for (let linha = 0; linha < grade.linhas - 1; linha += 1) {
    for (let coluna = 0; coluna < grade.colunas - 1; coluna += 1) {
      const superiorEsquerdo = grade.nos[linha][coluna];
      const superiorDireito = grade.nos[linha][coluna + 1];
      const inferiorDireito = grade.nos[linha + 1][coluna + 1];
      const inferiorEsquerdo = grade.nos[linha + 1][coluna];
      const cantos = [superiorEsquerdo, superiorDireito, inferiorDireito, inferiorEsquerdo];
      if (cantos.some((canto) => canto.altitude === null)) continue;

      const intersecoes = [];
      const bordas = [
        [superiorEsquerdo, superiorDireito],
        [superiorDireito, inferiorDireito],
        [inferiorDireito, inferiorEsquerdo],
        [inferiorEsquerdo, superiorEsquerdo]
      ];

      for (const [inicio, fim] of bordas) {
        if (cruzaNivel(inicio.altitude, fim.altitude, nivel)) {
          intersecoes.push(interpolarBordaCurva(inicio, fim, nivel));
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

function chaveCurva(coordenada) {
  return `${coordenada[0].toFixed(7)},${coordenada[1].toFixed(7)}`;
}

function unirSegmentosCurvas(segmentos) {
  const pendentes = segmentos.map((segmento) => [segmento[0], segmento[1]]);
  const linhas = [];

  while (pendentes.length > 0) {
    const linha = pendentes.pop();
    let alterou = true;
    while (alterou) {
      alterou = false;
      const inicio = chaveCurva(linha[0]);
      const fim = chaveCurva(linha[linha.length - 1]);

      for (let indice = pendentes.length - 1; indice >= 0; indice -= 1) {
        const segmento = pendentes[indice];
        const segmentoInicio = chaveCurva(segmento[0]);
        const segmentoFim = chaveCurva(segmento[segmento.length - 1]);

        if (fim === segmentoInicio) {
          linha.push(...segmento.slice(1));
        } else if (fim === segmentoFim) {
          linha.push(...[...segmento].reverse().slice(1));
        } else if (inicio === segmentoFim) {
          linha.unshift(...segmento.slice(0, -1));
        } else if (inicio === segmentoInicio) {
          linha.unshift(...[...segmento].reverse().slice(0, -1));
        } else {
          continue;
        }

        pendentes.splice(indice, 1);
        alterou = true;
        break;
      }
    }
    if (linha.length >= 2) linhas.push(linha);
  }

  return linhas;
}

async function gerarCurvasRaw(requisicao) {
  if (!requisicao || typeof requisicao !== "object") {
    throw new ErroAplicacao("Informe os parâmetros para gerar curvas de nível.");
  }

  const intervaloMetros = normalizarIntervaloCurvas(requisicao.intervaloMetros);
  const grade = await gerarGradeRawInterpoladaCurvas(requisicao.bbox, requisicao.resolucaoMetros);
  const features = [];

  if (grade.altitudeMinima !== null && grade.altitudeMaxima !== null) {
    const nivelInicial = Math.ceil(grade.altitudeMinima / intervaloMetros) * intervaloMetros;
    const nivelFinal = Math.floor(grade.altitudeMaxima / intervaloMetros) * intervaloMetros;

    for (let nivel = nivelInicial; nivel <= nivelFinal; nivel += intervaloMetros) {
      const tipo = nivel % (intervaloMetros * 5) === 0 ? "mestra" : "normal";
      const linhas = unirSegmentosCurvas(gerarSegmentosMarchingSquares(grade, nivel));
      for (const linha of linhas) {
        features.push({
          type: "Feature",
          properties: { elevacao: nivel, tipo, fonte: "RAW interpolado" },
          geometry: { type: "LineString", coordinates: linha }
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features,
    metadados: {
      fonte: "data10k8b.raw interpolado",
      metodo: "interpolacao_bilinear_marching_squares",
      intervaloMetros,
      resolucaoMetros: grade.resolucaoMetros,
      altitudeMinima: grade.altitudeMinima,
      altitudeMaxima: grade.altitudeMaxima,
      avisoPrecisao: AVISO_PRECISAO_CURVAS
    }
  };
}

async function gerarCurvasOpenElevation(requisicao) {
  if (!requisicao || typeof requisicao !== "object") {
    throw new ErroAplicacao("Informe os parÃ¢metros para gerar curvas de nÃ­vel.");
  }

  const intervaloMetros = normalizarIntervaloCurvas(requisicao.intervaloMetros);
  const grade = await gerarGradeOpenElevationCurvas(requisicao.bbox, requisicao.resolucaoMetros);
  const features = [];

  if (grade.altitudeMinima !== null && grade.altitudeMaxima !== null) {
    const nivelInicial = Math.ceil(grade.altitudeMinima / intervaloMetros) * intervaloMetros;
    const nivelFinal = Math.floor(grade.altitudeMaxima / intervaloMetros) * intervaloMetros;

    for (let nivel = nivelInicial; nivel <= nivelFinal; nivel += intervaloMetros) {
      const tipo = nivel % (intervaloMetros * 5) === 0 ? "mestra" : "normal";
      const linhas = unirSegmentosCurvas(gerarSegmentosMarchingSquares(grade, nivel));
      for (const linha of linhas) {
        features.push({
          type: "Feature",
          properties: { elevacao: nivel, tipo, fonte: "Open-Elevation" },
          geometry: { type: "LineString", coordinates: linha }
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features,
    metadados: {
      fonte: "Open-Elevation API",
      metodo: "open_elevation_marching_squares",
      intervaloMetros,
      resolucaoMetros: grade.resolucaoMetros,
      altitudeMinima: grade.altitudeMinima,
      altitudeMaxima: grade.altitudeMaxima,
      avisoPrecisao: AVISO_PRECISAO_CURVAS_OPEN_ELEVATION
    }
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
      configuracao: {
        fonteElevacao: process.env.FONTE_ELEVACAO ?? "raw",
        metodoInterpolacao: process.env.METODO_INTERPOLACAO ?? "bilinear",
        perfilIntervaloPadraoMetros: Number.isFinite(INTERVALO_PADRAO_METROS) ? INTERVALO_PADRAO_METROS : 50,
        perfilIntervaloMinimoMetros: Number.isFinite(INTERVALO_MINIMO_METROS) ? INTERVALO_MINIMO_METROS : 5,
        perfilLimiteAmostras: Number.isFinite(LIMITE_AMOSTRAS) ? LIMITE_AMOSTRAS : 3000
      },
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

  if (requisicao.method === "GET" && caminho === "/api/elevation/open-elevation") {
    resposta.status(200).json(
      await consultarPontoOpenElevation({
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

  if (requisicao.method === "POST" && caminho === "/api/contours/raw") {
    resposta.status(200).json(await gerarCurvasRaw(lerCorpo(requisicao)));
    return;
  }

  if (requisicao.method === "POST" && caminho === "/api/contours/open-elevation") {
    resposta.status(200).json(await gerarCurvasOpenElevation(lerCorpo(requisicao)));
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
