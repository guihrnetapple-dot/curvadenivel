const URL_OPEN_ELEVATION = process.env.OPEN_ELEVATION_API_URL ?? "https://api.open-elevation.com/api/v1/lookup";
const CACHE_TTL_MS = Number(process.env.OPEN_ELEVATION_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
const CACHE_MAX_ITENS = Number(process.env.OPEN_ELEVATION_CACHE_MAX_ITENS ?? 20000);
const TAMANHO_LOTE = Number(process.env.OPEN_ELEVATION_TAMANHO_LOTE ?? 400);
const TIMEOUT_MS = Number(process.env.OPEN_ELEVATION_TIMEOUT_MS ?? 20000);
const LIMITE_PONTOS_API = 5000;
const RESOLUCAO_MINIMA_METROS = 50;
const RESOLUCAO_PADRAO_METROS = 100;
const FATOR_DENSIFICACAO = 4;
const LIMITE_NOS_DENSIFICADOS = 300000;
const cacheElevacao = new Map();

class ErroAplicacao extends Error {
  constructor(message, status = 400, detalhes = null) {
    super(message);
    this.status = status;
    this.detalhes = detalhes;
  }
}

function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(corpo));
}

function chaveCache(latitude, longitude) {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function validarCoordenada(coordenada) {
  const latitude = Number(coordenada?.latitude ?? coordenada?.lat);
  const longitude = Number(coordenada?.longitude ?? coordenada?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
  }
  if (latitude < -90 || latitude > 90) throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
  if (longitude < -180 || longitude > 180) throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
  return { latitude, longitude };
}

function criarResultado(coordenada, altitude) {
  return {
    latitude: coordenada.latitude,
    longitude: coordenada.longitude,
    altitude,
    status: altitude === null ? "sem_dado" : "valido",
    fonte: "open_elevation",
    metodo: "api",
    precisaoReal: "media",
    avisoPrecisao: "Altitude consultada na Open-Elevation. A precisão depende da base DEM usada pelo serviço.",
    mensagem:
      altitude === null
        ? "A Open-Elevation não retornou altitude válida para esse ponto."
        : "Altitude consultada pela API Open-Elevation.",
    consultadoEm: new Date().toISOString()
  };
}

function obterCache(coordenada) {
  const chave = chaveCache(coordenada.latitude, coordenada.longitude);
  const entrada = cacheElevacao.get(chave);
  if (!entrada) return null;
  if (Date.now() - entrada.criadoEm > CACHE_TTL_MS) {
    cacheElevacao.delete(chave);
    return null;
  }
  cacheElevacao.delete(chave);
  cacheElevacao.set(chave, entrada);
  return entrada.resultado;
}

function salvarCache(resultado) {
  cacheElevacao.set(chaveCache(resultado.latitude, resultado.longitude), { resultado, criadoEm: Date.now() });
  while (cacheElevacao.size > CACHE_MAX_ITENS) {
    cacheElevacao.delete(cacheElevacao.keys().next().value);
  }
}

async function aguardar(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarOpenElevationLoteUnico(coordenadas) {
  for (let tentativa = 0; tentativa <= 2; tentativa += 1) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
    try {
      const resposta = await fetch(URL_OPEN_ELEVATION, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ locations: coordenadas }),
        signal: controlador.signal
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        if ([429, 502, 503, 504].includes(resposta.status) && tentativa < 2) {
          const retryAfter = Number(resposta.headers.get("retry-after"));
          await aguardar(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * (tentativa + 1));
          continue;
        }
        throw new ErroAplicacao(`Open-Elevation respondeu com status ${resposta.status}.`, resposta.status, corpo);
      }
      if (!Array.isArray(corpo?.results) || corpo.results.length !== coordenadas.length) {
        throw new ErroAplicacao("A resposta da Open-Elevation veio em formato inesperado.", 502, corpo);
      }
      return corpo.results.map((item, indice) => {
        const altitude = Number(item.elevation);
        return criarResultado(coordenadas[indice], Number.isFinite(altitude) ? altitude : null);
      });
    } finally {
      clearTimeout(temporizador);
    }
  }
  throw new ErroAplicacao("Não foi possível consultar a Open-Elevation.", 502);
}

async function consultarLote(coordenadasEntrada) {
  const coordenadas = coordenadasEntrada.map(validarCoordenada);
  const resultados = new Array(coordenadas.length);
  const faltantes = new Map();
  const indices = new Map();

  coordenadas.forEach((coordenada, indice) => {
    const cached = obterCache(coordenada);
    const chave = chaveCache(coordenada.latitude, coordenada.longitude);
    if (cached) {
      resultados[indice] = { ...cached, latitude: coordenada.latitude, longitude: coordenada.longitude };
      return;
    }
    faltantes.set(chave, coordenada);
    indices.set(chave, [...(indices.get(chave) ?? []), indice]);
  });

  const listaFaltantes = [...faltantes.entries()];
  for (let indice = 0; indice < listaFaltantes.length; indice += TAMANHO_LOTE) {
    const lote = listaFaltantes.slice(indice, indice + TAMANHO_LOTE);
    const respostas = await consultarOpenElevationLoteUnico(lote.map(([, coordenada]) => coordenada));
    respostas.forEach((resultado, posicao) => {
      const [chave] = lote[posicao];
      salvarCache(resultado);
      for (const indiceOriginal of indices.get(chave) ?? []) {
        const coordenadaOriginal = coordenadas[indiceOriginal];
        resultados[indiceOriginal] = { ...resultado, latitude: coordenadaOriginal.latitude, longitude: coordenadaOriginal.longitude };
      }
    });
  }
  return resultados;
}

function distancia(a, b) {
  const r = 6371008.8;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function interpolar(a, b, t) {
  return { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
}

function normalizarGeometria(geometria) {
  if (!geometria?.type) throw new ErroAplicacao("Informe uma geometria para calcular o perfil de elevação.");
  if (geometria.type === "Point") return [{ latitude: geometria.coordinates[1], longitude: geometria.coordinates[0], distanciaMetros: 0 }];
  const coords = geometria.type === "Polygon" ? geometria.coordinates?.[0] : geometria.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new ErroAplicacao("A geometria precisa ter pelo menos dois pontos.");
  const pontos = coords.map(([longitude, latitude]) => ({ latitude, longitude }));
  const amostras = [];
  let total = 0;
  const segmentos = [];
  for (let i = 1; i < pontos.length; i += 1) {
    const comprimento = distancia(pontos[i - 1], pontos[i]);
    segmentos.push({ inicio: pontos[i - 1], fim: pontos[i], comprimento, antes: total });
    total += comprimento;
  }
  const quantidade = Math.min(3000, Math.max(2, Math.ceil(total / 50) + 1));
  const passo = total / (quantidade - 1);
  let segmentoIndice = 0;
  for (let i = 0; i < quantidade; i += 1) {
    const alvo = i === quantidade - 1 ? total : i * passo;
    while (segmentoIndice < segmentos.length - 1 && segmentos[segmentoIndice].antes + segmentos[segmentoIndice].comprimento < alvo) {
      segmentoIndice += 1;
    }
    const segmento = segmentos[segmentoIndice];
    const t = segmento.comprimento > 0 ? Math.min(Math.max((alvo - segmento.antes) / segmento.comprimento, 0), 1) : 0;
    amostras.push({ ...interpolar(segmento.inicio, segmento.fim, t), distanciaMetros: alvo });
  }
  return amostras;
}

function validarBbox(bbox) {
  const saida = { minLat: Number(bbox?.minLat), minLng: Number(bbox?.minLng), maxLat: Number(bbox?.maxLat), maxLng: Number(bbox?.maxLng) };
  if (!Object.values(saida).every(Number.isFinite) || saida.maxLat <= saida.minLat || saida.maxLng <= saida.minLng) {
    throw new ErroAplicacao("Desenhe um retângulo com área válida para gerar curvas de nível.");
  }
  return saida;
}

function calcularGradeInfo(bbox, resolucaoEntrada) {
  let resolucao = Math.max(RESOLUCAO_MINIMA_METROS, Number(resolucaoEntrada ?? RESOLUCAO_PADRAO_METROS));
  const calcular = () => {
    const latRef = (bbox.minLat + bbox.maxLat) / 2;
    const latStep = resolucao / 111320;
    const lngStep = resolucao / (111320 * Math.max(0.01, Math.cos((latRef * Math.PI) / 180)));
    const linhas = Math.max(2, Math.floor((bbox.maxLat - bbox.minLat) / latStep) + 1);
    const colunas = Math.max(2, Math.floor((bbox.maxLng - bbox.minLng) / lngStep) + 1);
    return { linhas, colunas, pontos: linhas * colunas };
  };
  let info = calcular();
  const solicitada = resolucao;
  while (info.pontos > LIMITE_PONTOS_API) {
    resolucao *= 1.25;
    info = calcular();
  }
  return { ...info, resolucaoSolicitadaMetros: solicitada, resolucaoEfetivaMetros: resolucao, ajustada: resolucao !== solicitada };
}

function calcularDimensoesMetrosCurvas(bbox) {
  const latRef = (bbox.minLat + bbox.maxLat) / 2;
  const fatorLng = Math.max(0.01, Math.cos((latRef * Math.PI) / 180));
  const largura = Math.abs(bbox.maxLng - bbox.minLng) * 111320 * fatorLng;
  const altura = Math.abs(bbox.maxLat - bbox.minLat) * 111320;
  return {
    maiorDimensaoMetros: Math.max(largura, altura),
    areaMetrosQuadrados: largura * altura
  };
}

function escolherResolucaoAutomatica(maiorDimensaoMetros) {
  if (maiorDimensaoMetros <= 1000) return 50;
  if (maiorDimensaoMetros <= 3000) return 100;
  if (maiorDimensaoMetros <= 8000) return 250;
  return 500;
}

function escolherIntervaloAutomatico(maiorDimensaoMetros) {
  if (maiorDimensaoMetros <= 1000) return 1;
  if (maiorDimensaoMetros <= 3000) return 2;
  if (maiorDimensaoMetros <= 8000) return 5;
  if (maiorDimensaoMetros <= 20000) return 10;
  return 20;
}

function intervaloMinimoPorResolucao(resolucaoMetros) {
  return Math.ceil(resolucaoMetros / 100);
}

function calcularParametrosAutomaticos(bbox) {
  const dimensoes = calcularDimensoesMetrosCurvas(bbox);
  const resolucaoOriginal = escolherResolucaoAutomatica(dimensoes.maiorDimensaoMetros);
  const intervaloOriginal = escolherIntervaloAutomatico(dimensoes.maiorDimensaoMetros);
  let resolucao = resolucaoOriginal;
  let intervalo = Math.max(intervaloOriginal, intervaloMinimoPorResolucao(resolucao));
  let motivoAjusteAutomatico = null;
  let info = calcularGradeInfo(bbox, resolucao);
  while (info.pontos > LIMITE_PONTOS_API) {
    resolucao *= 1.25;
    intervalo = Math.max(intervaloMinimoPorResolucao(resolucao), Math.ceil(intervaloOriginal * (resolucao / resolucaoOriginal)));
    motivoAjusteAutomatico = "A resolução foi ajustada automaticamente para evitar excesso de consultas.";
    info = calcularGradeInfo(bbox, resolucao);
  }
  return { ...dimensoes, resolucaoMetros: resolucao, intervaloMetros: intervalo, motivoAjusteAutomatico };
}

async function gerarGrade(bbox, resolucaoMetros) {
  const info = calcularGradeInfo(bbox, resolucaoMetros);
  const coordenadas = [];
  for (let l = 0; l < info.linhas; l += 1) {
    const lat = bbox.maxLat - (bbox.maxLat - bbox.minLat) * (l / (info.linhas - 1));
    for (let c = 0; c < info.colunas; c += 1) {
      const lng = bbox.minLng + (bbox.maxLng - bbox.minLng) * (c / (info.colunas - 1));
      coordenadas.push({ latitude: lat, longitude: lng });
    }
  }
  const resultados = await consultarLote(coordenadas);
  const nos = [];
  for (let l = 0; l < info.linhas; l += 1) {
    const linha = [];
    for (let c = 0; c < info.colunas; c += 1) {
      const i = l * info.colunas + c;
      linha.push({ ...coordenadas[i], altitude: resultados[i]?.altitude ?? null });
    }
    nos.push(linha);
  }
  return { bbox, ...info, nos };
}

function extremos(nos) {
  const altitudes = nos.flat().map((n) => n.altitude).filter(Number.isFinite);
  return { min: altitudes.length ? Math.min(...altitudes) : null, max: altitudes.length ? Math.max(...altitudes) : null };
}

function suavizar(nos) {
  const k = [[1, 2, 1], [2, 4, 2], [1, 2, 1]];
  return nos.map((linha, l) => linha.map((no, c) => {
    let soma = 0, peso = 0, validos = 0;
    for (let dl = -1; dl <= 1; dl += 1) for (let dc = -1; dc <= 1; dc += 1) {
      const alt = nos[l + dl]?.[c + dc]?.altitude;
      if (Number.isFinite(alt)) {
        const p = k[dl + 1][dc + 1];
        soma += alt * p; peso += p; validos += 1;
      }
    }
    return { ...no, altitude: peso && (no.altitude !== null || validos >= 5) ? soma / peso : no.altitude };
  }));
}

function densificar(nos) {
  const linhas = (nos.length - 1) * FATOR_DENSIFICACAO + 1;
  const colunas = (nos[0].length - 1) * FATOR_DENSIFICACAO + 1;
  if (linhas * colunas > LIMITE_NOS_DENSIFICADOS) throw new ErroAplicacao("A área selecionada ficou grande demais para suavizar as curvas com segurança.");
  const saida = [];
  for (let l = 0; l < linhas; l += 1) {
    const lb = Math.min(Math.floor(l / FATOR_DENSIFICACAO), nos.length - 2);
    const ty = l === linhas - 1 ? 1 : (l % FATOR_DENSIFICACAO) / FATOR_DENSIFICACAO;
    const linha = [];
    for (let c = 0; c < colunas; c += 1) {
      const cb = Math.min(Math.floor(c / FATOR_DENSIFICACAO), nos[0].length - 2);
      const tx = c === colunas - 1 ? 1 : (c % FATOR_DENSIFICACAO) / FATOR_DENSIFICACAO;
      const a = nos[lb][cb], b = nos[lb][cb + 1], d = nos[lb + 1][cb], e = nos[lb + 1][cb + 1];
      const altitude = [a.altitude, b.altitude, d.altitude, e.altitude].every(Number.isFinite)
        ? (a.altitude * (1 - tx) + b.altitude * tx) * (1 - ty) + (d.altitude * (1 - tx) + e.altitude * tx) * ty
        : null;
      linha.push({ latitude: a.latitude + (d.latitude - a.latitude) * ty, longitude: a.longitude + (b.longitude - a.longitude) * tx, altitude });
    }
    saida.push(linha);
  }
  return saida;
}

function pontoBorda(a, b, nivel) {
  const t = Math.min(Math.max((nivel - a.altitude) / (b.altitude - a.altitude), 0), 1);
  return [a.longitude + (b.longitude - a.longitude) * t, a.latitude + (b.latitude - a.latitude) * t];
}

function segmentosNivel(nos, nivel) {
  const segmentos = [];
  for (let l = 0; l < nos.length - 1; l += 1) for (let c = 0; c < nos[0].length - 1; c += 1) {
    const a = nos[l][c], b = nos[l][c + 1], d = nos[l + 1][c + 1], e = nos[l + 1][c];
    if ([a.altitude, b.altitude, d.altitude, e.altitude].some((v) => v === null)) continue;
    const bordas = [[a, b], [b, d], [d, e], [e, a]];
    const pontos = bordas.filter(([x, y]) => (x.altitude < nivel && y.altitude >= nivel) || (y.altitude < nivel && x.altitude >= nivel)).map(([x, y]) => pontoBorda(x, y, nivel));
    if (pontos.length === 2) segmentos.push([pontos[0], pontos[1]]);
    if (pontos.length === 4) segmentos.push([pontos[0], pontos[1]], [pontos[2], pontos[3]]);
  }
  return segmentos;
}

function chavePonto(p) {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}

function unir(segmentos) {
  const pendentes = segmentos.map((s) => [s[0], s[1]]);
  const linhas = [];
  while (pendentes.length) {
    const linha = pendentes.pop();
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (let i = pendentes.length - 1; i >= 0; i -= 1) {
        const s = pendentes[i], ini = chavePonto(linha[0]), fim = chavePonto(linha.at(-1)), si = chavePonto(s[0]), sf = chavePonto(s[1]);
        if (fim === si) linha.push(s[1]);
        else if (fim === sf) linha.push(s[0]);
        else if (ini === sf) linha.unshift(s[0]);
        else if (ini === si) linha.unshift(s[1]);
        else continue;
        pendentes.splice(i, 1);
        mudou = true;
        break;
      }
    }
    if (linha.length > 1) linhas.push(linha);
  }
  return linhas;
}

function chaikin(linha) {
  let atual = linha;
  for (let i = 0; i < 2; i += 1) {
    if (atual.length < 3) break;
    const saida = [atual[0]];
    for (let p = 0; p < atual.length - 1; p += 1) {
      const a = atual[p], b = atual[p + 1];
      saida.push([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25], [a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75]);
    }
    saida.push(atual.at(-1));
    atual = saida;
  }
  return atual;
}

function comprimentoLinha(linha) {
  let total = 0;
  for (let i = 1; i < linha.length; i += 1) total += distancia({ latitude: linha[i - 1][1], longitude: linha[i - 1][0] }, { latitude: linha[i][1], longitude: linha[i][0] });
  return total;
}

async function gerarCurvas(body) {
  const bbox = validarBbox(body?.bbox);
  const modoParametros = body?.modoParametros === "manual" ? "manual" : "automatico";
  const automaticos = calcularParametrosAutomaticos(bbox);
  const resolucao = modoParametros === "automatico" ? automaticos.resolucaoMetros : Number(body?.resolucaoMetros ?? 100);
  const intervaloSolicitado = modoParametros === "automatico" ? automaticos.intervaloMetros : Number(body?.intervaloMetros ?? 5);
  const intervalo = Math.max(intervaloSolicitado, intervaloMinimoPorResolucao(resolucao));
  const grade = await gerarGrade(bbox, resolucao);
  const nos = densificar(suavizar(grade.nos));
  const ex = extremos(grade.nos);
  const features = [];
  if (ex.min !== null && ex.max !== null) {
    for (let nivel = Math.ceil(ex.min / intervalo) * intervalo; nivel <= Math.floor(ex.max / intervalo) * intervalo; nivel += intervalo) {
      for (const linha of unir(segmentosNivel(nos, nivel))) {
        const suave = chaikin(linha);
        const comp = comprimentoLinha(suave);
        if (suave.length < 2 || comp < Math.max(grade.resolucaoEfetivaMetros * 0.5, 3)) continue;
        features.push({
          type: "Feature",
          properties: { elevacao: nivel, tipo: nivel % (intervalo * 5) === 0 ? "mestra" : "normal", fonte: "Open-Elevation", comprimentoMetros: comp, fechada: chavePonto(suave[0]) === chavePonto(suave.at(-1)) },
          geometry: { type: "LineString", coordinates: suave }
        });
      }
    }
  }
  return {
    type: "FeatureCollection",
    features,
    metadados: {
      fonte: "Open-Elevation API",
      metodo: "open_elevation_api_marching_squares_suavizado",
      modoParametros,
      intervaloAutomatico: modoParametros === "automatico" ? automaticos.intervaloMetros : null,
      resolucaoAutomatica: modoParametros === "automatico" ? automaticos.resolucaoMetros : null,
      motivoAjusteAutomatico: modoParametros === "automatico" ? automaticos.motivoAjusteAutomatico : null,
      maiorDimensaoMetros: automaticos.maiorDimensaoMetros,
      areaMetrosQuadrados: automaticos.areaMetrosQuadrados,
      intervaloMetros: intervalo,
      resolucaoSolicitadaMetros: grade.resolucaoSolicitadaMetros,
      resolucaoEfetivaMetros: grade.resolucaoEfetivaMetros,
      resolucaoAjustada: grade.ajustada,
      pontosConsultados: grade.pontos,
      linhasGrade: grade.linhas,
      colunasGrade: grade.colunas,
      fatorDensificacao: FATOR_DENSIFICACAO,
      iteracoesSuavizacaoGrade: 1,
      iteracoesSuavizacaoLinhas: 2,
      quantidadeCurvas: features.length,
      cacheAtivo: true,
      altitudeMinima: ex.min,
      altitudeMaxima: ex.max,
      avisoPrecisao: ""
    }
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return responder(res, 204, {});
    const url = new URL(req.url, `https://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/status") {
      return responder(res, 200, {
        backendOnline: true,
        dataHora: new Date().toISOString(),
        elevacao: { fonte: "Open-Elevation API", configurada: true, tamanhoLote: TAMANHO_LOTE, timeoutMs: TIMEOUT_MS, cacheAtivo: true },
        curvas: { limitePontosApi: LIMITE_PONTOS_API, resolucaoMinimaMetros: RESOLUCAO_MINIMA_METROS, fatorDensificacao: FATOR_DENSIFICACAO }
      });
    }
    if (req.method === "GET" && url.pathname === "/api/elevation") {
      const [resultado] = await consultarLote([{ latitude: url.searchParams.get("lat") ?? url.searchParams.get("latitude"), longitude: url.searchParams.get("lng") ?? url.searchParams.get("longitude") }]);
      return responder(res, 200, resultado);
    }
    if (req.method === "POST" && url.pathname === "/api/elevation/batch") {
      return responder(res, 200, { resultados: await consultarLote(req.body?.coordenadas ?? []) });
    }
    if (req.method === "POST" && url.pathname === "/api/elevation/profile") {
      const amostras = normalizarGeometria(req.body?.geometria);
      const resultados = await consultarLote(amostras);
      const pontos = resultados.map((ponto, indice) => ({ ...ponto, distanciaMetros: amostras[indice].distanciaMetros }));
      const altitudes = pontos.map((p) => p.altitude).filter(Number.isFinite);
      return responder(res, 200, {
        tipo: req.body?.geometria?.type,
        pontos,
        estatisticas: {
          altitudeMinima: altitudes.length ? Math.min(...altitudes) : null,
          altitudeMaxima: altitudes.length ? Math.max(...altitudes) : null,
          altitudeMedia: altitudes.length ? altitudes.reduce((s, v) => s + v, 0) / altitudes.length : null,
          diferencaNivel: altitudes.length ? Math.max(...altitudes) - Math.min(...altitudes) : null,
          inclinacaoMediaPercentual: null,
          comprimentoTotalMetros: amostras.at(-1)?.distanciaMetros ?? 0,
          areaMetrosQuadrados: null,
          quantidadePontos: pontos.length,
          pontosSemDado: pontos.length - altitudes.length
        }
      });
    }
    if (req.method === "POST" && url.pathname === "/api/contours") return responder(res, 200, await gerarCurvas(req.body));
    throw new ErroAplicacao("Rota não encontrada.", 404);
  } catch (erro) {
    const status = erro instanceof ErroAplicacao ? erro.status : 500;
    return responder(res, status, { erro: erro.message ?? "Erro interno na API de altimetria.", detalhes: erro.detalhes ?? null });
  }
}
