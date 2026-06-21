import { request as requisicaoHttps } from "node:https";

const URL_OPEN_ELEVATION = process.env.OPEN_ELEVATION_API_URL ?? "https://api.open-elevation.com/api/v1/lookup";
const CACHE_TTL_MS = Number(process.env.OPEN_ELEVATION_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
const CACHE_MAX_ITENS = Number(process.env.OPEN_ELEVATION_CACHE_MAX_ITENS ?? 20000);
const TAMANHO_LOTE = Number(process.env.OPEN_ELEVATION_TAMANHO_LOTE ?? 400);
const TIMEOUT_MS = Number(process.env.OPEN_ELEVATION_TIMEOUT_MS ?? 20000);
const LIMITE_PONTOS_API = 5000;
const RESOLUCAO_GLOBAL_METROS = 50;
const FATOR_DENSIFICACAO = 4;
const LIMITE_NOS_DENSIFICADOS = 300000;
const RAIO_TERRA_WEB_MERCATOR = 6378137;
const LATITUDE_MAXIMA_WEB_MERCATOR = 85.05112878;
const CODIGOS_ERRO_CERTIFICADO = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);
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

function chaveCacheCoordenada(coordenada) {
  return coordenada.chaveGlobal ? `global:${coordenada.chaveGlobal}` : chaveCache(coordenada.latitude, coordenada.longitude);
}

function validarCoordenada(coordenada) {
  const latitude = Number(coordenada?.latitude ?? coordenada?.lat);
  const longitude = Number(coordenada?.longitude ?? coordenada?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
  }
  if (latitude < -90 || latitude > 90) throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
  if (longitude < -180 || longitude > 180) throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
  return { latitude, longitude, chaveGlobal: coordenada?.chaveGlobal };
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
  const chave = chaveCacheCoordenada(coordenada);
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

function salvarCache(resultado, chave = null) {
  cacheElevacao.set(chave ?? chaveCacheCoordenada(resultado), { resultado, criadoEm: Date.now() });
  while (cacheElevacao.size > CACHE_MAX_ITENS) {
    cacheElevacao.delete(cacheElevacao.keys().next().value);
  }
}

async function aguardar(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function obterCodigoErro(erro) {
  const origem = erro?.cause && typeof erro.cause === "object" ? erro.cause : erro;
  return origem && typeof origem === "object" && "code" in origem ? String(origem.code) : "";
}

function deveTentarOpenElevationSemValidarCertificado(erro) {
  let hostname = "";
  try {
    hostname = new URL(URL_OPEN_ELEVATION).hostname;
  } catch {
    return false;
  }

  const mensagem = String(erro?.message ?? "").toLowerCase();
  return (
    hostname === "api.open-elevation.com" &&
    (CODIGOS_ERRO_CERTIFICADO.has(obterCodigoErro(erro)) ||
      mensagem.includes("certificate") ||
      mensagem.includes("certificado"))
  );
}

function consultarOpenElevationSemValidarCertificado(coordenadas) {
  const url = new URL(URL_OPEN_ELEVATION);
  const corpoRequisicao = JSON.stringify({ locations: coordenadas });

  return new Promise((resolve, reject) => {
    const requisicao = requisicaoHttps(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        port: url.port || 443,
        rejectUnauthorized: false,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(corpoRequisicao)
        },
        timeout: TIMEOUT_MS
      },
      (resposta) => {
        const partes = [];
        resposta.on("data", (parte) => partes.push(Buffer.from(parte)));
        resposta.on("end", () => {
          let corpo = null;
          try {
            const texto = Buffer.concat(partes).toString("utf8");
            corpo = texto ? JSON.parse(texto) : null;
          } catch (erro) {
            reject(new ErroAplicacao("A resposta da Open-Elevation veio em formato inválido.", 502, erro.message));
            return;
          }

          const status = resposta.statusCode ?? 502;
          if (status < 200 || status >= 300) {
            reject(new ErroAplicacao(`Open-Elevation respondeu com status ${status}.`, status, corpo));
            return;
          }
          if (!Array.isArray(corpo?.results) || corpo.results.length !== coordenadas.length) {
            reject(new ErroAplicacao("A resposta da Open-Elevation veio em formato inesperado.", 502, corpo));
            return;
          }

          resolve(
            corpo.results.map((item, indice) => {
              const altitude = Number(item.elevation);
              return criarResultado(coordenadas[indice], Number.isFinite(altitude) ? altitude : null);
            })
          );
        });
      }
    );

    requisicao.on("timeout", () => {
      requisicao.destroy(new ErroAplicacao("A consulta à Open-Elevation excedeu o tempo limite.", 504));
    });
    requisicao.on("error", reject);
    requisicao.write(corpoRequisicao);
    requisicao.end();
  });
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
    } catch (erro) {
      if (deveTentarOpenElevationSemValidarCertificado(erro)) {
        return consultarOpenElevationSemValidarCertificado(coordenadas);
      }
      throw erro;
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
    const chave = chaveCacheCoordenada(coordenada);
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
        salvarCache(resultado, chave);
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

function limitarNumero(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
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

function mercatorFromLatLng(latitude, longitude) {
  const latitudeLimitada = limitarNumero(latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR);
  const latRad = (latitudeLimitada * Math.PI) / 180;
  return {
    x: RAIO_TERRA_WEB_MERCATOR * ((longitude * Math.PI) / 180),
    y: RAIO_TERRA_WEB_MERCATOR * Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  };
}

function latLngFromMercator(x, y) {
  return {
    latitude: (Math.atan(Math.sinh(y / RAIO_TERRA_WEB_MERCATOR)) * 180) / Math.PI,
    longitude: (x / RAIO_TERRA_WEB_MERCATOR) * (180 / Math.PI)
  };
}

function criarChaveNoGlobal(x, y, resolucaoMetros) {
  const indiceX = Math.round(x / resolucaoMetros);
  const indiceY = Math.round(y / resolucaoMetros);
  return `${indiceX}:${indiceY}`;
}

function expandirBboxPorMercator(bboxEntrada, paddingMetros) {
  const bbox = validarBbox(bboxEntrada);
  const sudoeste = mercatorFromLatLng(bbox.minLat, bbox.minLng);
  const nordeste = mercatorFromLatLng(bbox.maxLat, bbox.maxLng);
  const min = latLngFromMercator(sudoeste.x - paddingMetros, sudoeste.y - paddingMetros);
  const max = latLngFromMercator(nordeste.x + paddingMetros, nordeste.y + paddingMetros);
  return validarBbox({
    minLat: limitarNumero(min.latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR),
    minLng: limitarNumero(min.longitude, -180, 180),
    maxLat: limitarNumero(max.latitude, -LATITUDE_MAXIMA_WEB_MERCATOR, LATITUDE_MAXIMA_WEB_MERCATOR),
    maxLng: limitarNumero(max.longitude, -180, 180)
  });
}

function snapBboxParaGradeGlobal(bboxEntrada, resolucaoMetros) {
  const bbox = validarBbox(bboxEntrada);
  const sudoeste = mercatorFromLatLng(bbox.minLat, bbox.minLng);
  const nordeste = mercatorFromLatLng(bbox.maxLat, bbox.maxLng);
  const indiceMinX = Math.floor(sudoeste.x / resolucaoMetros);
  const indiceMaxX = Math.ceil(nordeste.x / resolucaoMetros);
  const indiceMinY = Math.floor(sudoeste.y / resolucaoMetros);
  const indiceMaxY = Math.ceil(nordeste.y / resolucaoMetros);
  const colunas = indiceMaxX - indiceMinX + 1;
  const linhas = indiceMaxY - indiceMinY + 1;
  return {
    indiceMinX,
    indiceMaxX,
    indiceMinY,
    indiceMaxY,
    linhas,
    colunas,
    pontos: linhas * colunas
  };
}

function validarGradeGlobal(bbox, resolucaoMetros) {
  const info = snapBboxParaGradeGlobal(bbox, resolucaoMetros);
  if (info.pontos > LIMITE_PONTOS_API) {
    throw new ErroAplicacao("Área muito grande para a grade fixa de 50 m. Selecione uma área menor para manter curvas estáveis.");
  }
  return info;
}

function normalizarIntervaloCurvas(intervaloMetros) {
  const valor = Number(intervaloMetros ?? 5);
  return Number.isFinite(valor) && valor > 0 ? valor : 5;
}

async function gerarGrade(bbox, resolucaoMetros) {
  const info = validarGradeGlobal(bbox, resolucaoMetros);
  const coordenadas = [];
  for (let indiceY = info.indiceMaxY; indiceY >= info.indiceMinY; indiceY -= 1) {
    const y = indiceY * resolucaoMetros;
    for (let indiceX = info.indiceMinX; indiceX <= info.indiceMaxX; indiceX += 1) {
      const x = indiceX * resolucaoMetros;
      coordenadas.push({ ...latLngFromMercator(x, y), chaveGlobal: criarChaveNoGlobal(x, y, resolucaoMetros) });
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
  return {
    bbox,
    bboxAmostragem: bbox,
    ...info,
    resolucaoSolicitadaMetros: resolucaoMetros,
    resolucaoEfetivaMetros: resolucaoMetros,
    ajustada: false,
    gradeTravada: true,
    sistemaGrade: "web_mercator_global",
    nos
  };
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

function clipSegmentoBbox(inicio, fim, bbox) {
  const x0 = inicio[0], y0 = inicio[1], x1 = fim[0], y1 = fim[1];
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const limites = [[-dx, x0 - bbox.minLng], [dx, bbox.maxLng - x0], [-dy, y0 - bbox.minLat], [dy, bbox.maxLat - y0]];
  for (const [p, q] of limites) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) return null;
      t1 = Math.min(t1, r);
    }
  }
  return [[x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1, y0 + dy * t1]];
}

function pontosLinhaIguais(a, b) {
  return Math.abs(a[0] - b[0]) <= 1e-10 && Math.abs(a[1] - b[1]) <= 1e-10;
}

function cortarLinhaParaBbox(linha, bbox) {
  const linhas = [];
  let atual = [];
  for (let i = 1; i < linha.length; i += 1) {
    const segmento = clipSegmentoBbox(linha[i - 1], linha[i], bbox);
    if (!segmento) {
      if (atual.length >= 2) linhas.push(atual);
      atual = [];
      continue;
    }
    const [inicio, fim] = segmento;
    if (atual.length === 0) {
      atual.push(inicio, fim);
      continue;
    }
    if (!pontosLinhaIguais(atual.at(-1), inicio)) {
      if (atual.length >= 2) linhas.push(atual);
      atual = [inicio];
    }
    if (!pontosLinhaIguais(atual.at(-1), fim)) atual.push(fim);
  }
  if (atual.length >= 2) linhas.push(atual);
  return linhas;
}

async function gerarCurvas(body) {
  const bboxOriginal = validarBbox(body?.bbox);
  const intervaloSolicitado = normalizarIntervaloCurvas(body?.intervaloMetros);
  const resolucao = RESOLUCAO_GLOBAL_METROS;
  const bboxAmostragem = expandirBboxPorMercator(bboxOriginal, resolucao * 2);
  const dimensoesOriginais = calcularDimensoesMetrosCurvas(bboxOriginal);
  const grade = await gerarGrade(bboxAmostragem, resolucao);
  const nos = densificar(suavizar(grade.nos));
  const ex = extremos(grade.nos);
  const features = [];
  if (ex.min !== null && ex.max !== null) {
    for (
      let nivel = Math.ceil(ex.min / intervaloSolicitado) * intervaloSolicitado;
      nivel <= Math.floor(ex.max / intervaloSolicitado) * intervaloSolicitado;
      nivel += intervaloSolicitado
    ) {
      for (const linha of unir(segmentosNivel(nos, nivel))) {
        const suave = chaikin(linha);
        for (const linhaCortada of cortarLinhaParaBbox(suave, bboxOriginal)) {
          const suaveCortada = chaikin(linhaCortada);
          const comp = comprimentoLinha(suaveCortada);
          if (suaveCortada.length < 2 || comp < Math.max(grade.resolucaoEfetivaMetros * 0.5, 3)) continue;
          features.push({
            type: "Feature",
            properties: { elevacao: nivel, tipo: nivel % (intervaloSolicitado * 5) === 0 ? "mestra" : "normal", fonte: "Open-Elevation", comprimentoMetros: comp, fechada: chavePonto(suaveCortada[0]) === chavePonto(suaveCortada.at(-1)) },
            geometry: { type: "LineString", coordinates: suaveCortada }
          });
        }
      }
    }
  }
  return {
    type: "FeatureCollection",
    features,
    metadados: {
      fonte: "Open-Elevation API",
      metodo: "open_elevation_api_marching_squares_suavizado",
      modoParametros: null,
      resolucaoAutomatica: null,
      resolucaoPorIntervaloMetros: null,
      resolucaoPorAreaMetros: null,
      resolucaoOriginalMetros: null,
      criterioResolucaoAutomatica: null,
      motivoAjusteAutomatico: null,
      maiorDimensaoMetros: dimensoesOriginais.maiorDimensaoMetros,
      areaMetrosQuadrados: dimensoesOriginais.areaMetrosQuadrados,
      intervaloMetros: intervaloSolicitado,
      resolucaoGradeGlobalMetros: resolucao,
      gradeTravada: true,
      sistemaGrade: "web_mercator_global",
      bboxOriginal,
      bboxAmostragem,
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
        curvas: {
          limitePontosApi: LIMITE_PONTOS_API,
          resolucaoGradeGlobalMetros: RESOLUCAO_GLOBAL_METROS,
          gradeTravada: true,
          sistemaGrade: "web_mercator_global",
          fatorDensificacao: FATOR_DENSIFICACAO
        }
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
