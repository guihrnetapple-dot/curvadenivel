import { request as requisicaoHttps } from "node:https";

const URL_OPEN_ELEVATION = process.env.OPEN_ELEVATION_API_URL ?? "https://api.open-elevation.com/api/v1/lookup";
const CACHE_TTL_MS = Number(process.env.OPEN_ELEVATION_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
const CACHE_MAX_ITENS = Number(process.env.OPEN_ELEVATION_CACHE_MAX_ITENS ?? 20000);
const TAMANHO_LOTE = Number(process.env.OPEN_ELEVATION_TAMANHO_LOTE ?? 400);
const TIMEOUT_MS = Number(process.env.OPEN_ELEVATION_TIMEOUT_MS ?? 20000);
const LIMITE_PONTOS_API = 5000;
const RESOLUCAO_GLOBAL_METROS = 100;
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
    avisoPrecisao: "Altitude consultada. A precisão depende da base altimétrica disponível.",
    mensagem:
      altitude === null
        ? "Não foi retornada altitude válida para esse ponto."
        : "Altitude consultada com sucesso.",
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

function numeroPtBr(valor, casas = 0) {
  if (!Number.isFinite(valor)) return "-";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(valor));
}

function metrosPtBr(valor, casas = 0) {
  return Number.isFinite(valor) ? `${numeroPtBr(Number(valor), casas)} m` : "-";
}

function areaPtBr(valor) {
  if (!Number.isFinite(valor)) return "-";
  return `${numeroPtBr(valor, 0)} m² / ${numeroPtBr(valor / 10000, 4)} ha`;
}

function coordenadaPtBr(coordenada) {
  if (!coordenada) return "-";
  return `${numeroPtBr(coordenada.latitude, 6)}, ${numeroPtBr(coordenada.longitude, 6)}`;
}

function metrica(chave, item, valor, coordenada = null, unidade = undefined) {
  return { chave, item, valor, unidade, coordenada: coordenada ? { latitude: coordenada.latitude, longitude: coordenada.longitude } : undefined, clicavel: Boolean(coordenada) };
}

function fecharCoordenadas(coordenadas) {
  if (coordenadas.length < 2) return coordenadas;
  const primeira = coordenadas[0], ultima = coordenadas.at(-1);
  return primeira.latitude === ultima.latitude && primeira.longitude === ultima.longitude ? coordenadas : [...coordenadas, primeira];
}

function comprimentoCoordenadas(coordenadas) {
  let total = 0;
  for (let i = 1; i < coordenadas.length; i += 1) total += distancia(coordenadas[i - 1], coordenadas[i]);
  return total;
}

function destinoGeografico(origem, distanciaMetros, anguloGraus) {
  const raio = 6371008.8;
  const distanciaAngular = distanciaMetros / raio;
  const angulo = (anguloGraus * Math.PI) / 180;
  const lat1 = (origem.latitude * Math.PI) / 180;
  const lng1 = (origem.longitude * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanciaAngular) + Math.cos(lat1) * Math.sin(distanciaAngular) * Math.cos(angulo));
  const lng2 = lng1 + Math.atan2(Math.sin(angulo) * Math.sin(distanciaAngular) * Math.cos(lat1), Math.cos(distanciaAngular) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: (lat2 * 180) / Math.PI, longitude: (((lng2 * 180) / Math.PI + 540) % 360) - 180 };
}

function projecaoLocal(coordenadas) {
  const latitudeOrigem = coordenadas.reduce((s, c) => s + c.latitude, 0) / Math.max(coordenadas.length, 1);
  const longitudeOrigem = coordenadas.reduce((s, c) => s + c.longitude, 0) / Math.max(coordenadas.length, 1);
  return { latitudeOrigem, longitudeOrigem, metrosPorGrauLongitude: Math.max(1, 111320 * Math.cos((latitudeOrigem * Math.PI) / 180)) };
}

function projetarLocal(coordenada, projecao) {
  return { x: (coordenada.longitude - projecao.longitudeOrigem) * projecao.metrosPorGrauLongitude, y: (coordenada.latitude - projecao.latitudeOrigem) * 111320 };
}

function desprojetarLocal(ponto, projecao) {
  return { latitude: projecao.latitudeOrigem + ponto.y / 111320, longitude: projecao.longitudeOrigem + ponto.x / projecao.metrosPorGrauLongitude };
}

function areaPoligono(coordenadas) {
  const anel = fecharCoordenadas(coordenadas);
  if (anel.length < 4) return null;
  const projecao = projecaoLocal(anel);
  const pontos = anel.map((c) => projetarLocal(c, projecao));
  let soma = 0;
  for (let i = 0; i < pontos.length - 1; i += 1) soma += pontos[i].x * pontos[i + 1].y - pontos[i + 1].x * pontos[i].y;
  return Math.abs(soma) / 2;
}

function dentroPoligono(ponto, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const pi = poligono[i], pj = poligono[j];
    if (pi.y > ponto.y !== pj.y > ponto.y) {
      const x = ((pj.x - pi.x) * (ponto.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;
      if (ponto.x < x) dentro = !dentro;
    }
  }
  return dentro;
}

function centroidePoligono(coordenadas) {
  const anel = fecharCoordenadas(coordenadas);
  const projecao = projecaoLocal(anel);
  const pontos = anel.map((c) => projetarLocal(c, projecao));
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const fator = pontos[i].x * pontos[i + 1].y - pontos[i + 1].x * pontos[i].y;
    area2 += fator;
    cx += (pontos[i].x + pontos[i + 1].x) * fator;
    cy += (pontos[i].y + pontos[i + 1].y) * fator;
  }
  if (Math.abs(area2) < 0.000001) {
    return { latitude: coordenadas.reduce((s, c) => s + c.latitude, 0) / coordenadas.length, longitude: coordenadas.reduce((s, c) => s + c.longitude, 0) / coordenadas.length };
  }
  return desprojetarLocal({ x: cx / (3 * area2), y: cy / (3 * area2) }, projecao);
}

function amostrarCaminho(coordenadas, espacamento = 30, limite = 180) {
  const total = comprimentoCoordenadas(coordenadas);
  if (coordenadas.length === 1 || total <= 0) return [{ ...coordenadas[0], distanciaMetros: 0 }];
  const quantidade = Math.min(limite, Math.max(2, Math.ceil(total / espacamento) + 1));
  const passo = total / (quantidade - 1);
  const segmentos = [];
  let antes = 0;
  for (let i = 1; i < coordenadas.length; i += 1) {
    const comp = distancia(coordenadas[i - 1], coordenadas[i]);
    segmentos.push({ inicio: coordenadas[i - 1], fim: coordenadas[i], comprimento: comp, antes });
    antes += comp;
  }
  const amostras = [];
  let si = 0;
  for (let i = 0; i < quantidade; i += 1) {
    const alvo = i === quantidade - 1 ? total : i * passo;
    while (si < segmentos.length - 1 && segmentos[si].antes + segmentos[si].comprimento < alvo) si += 1;
    const seg = segmentos[si];
    const t = seg.comprimento > 0 ? Math.min(Math.max((alvo - seg.antes) / seg.comprimento, 0), 1) : 0;
    amostras.push({ ...interpolar(seg.inicio, seg.fim, t), distanciaMetros: alvo });
  }
  return amostras;
}

function amostrarAreaPoligono(coordenadas) {
  const anel = fecharCoordenadas(coordenadas);
  const projecao = projecaoLocal(anel);
  const plano = anel.map((c) => projetarLocal(c, projecao));
  const xs = plano.map((p) => p.x), ys = plano.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const largura = Math.max(1, maxX - minX), altura = Math.max(1, maxY - minY);
  const ideal = Math.ceil(largura / 35) * Math.ceil(altura / 35);
  const passo = Math.max(35, Math.sqrt((largura * altura) / 220));
  const pontos = [];
  for (let y = minY + passo / 2; y <= maxY; y += passo) {
    for (let x = minX + passo / 2; x <= maxX; x += passo) {
      if (dentroPoligono({ x, y }, plano)) pontos.push(desprojetarLocal({ x, y }, projecao));
    }
  }
  if (!pontos.length) pontos.push(centroidePoligono(coordenadas));
  return { pontos: pontos.slice(0, 220), ajustada: ideal > 220 };
}

function amostrarAreaCirculo(centro, raio) {
  const area = Math.PI * raio * raio;
  const passo = Math.max(35, Math.sqrt(area / 220));
  const pontos = [centro];
  for (let y = -raio; y <= raio; y += passo) {
    for (let x = -raio; x <= raio; x += passo) {
      if (x === 0 && y === 0) continue;
      const d = Math.sqrt(x * x + y * y);
      if (d <= raio) pontos.push(destinoGeografico(centro, d, (Math.atan2(x, y) * 180) / Math.PI));
    }
  }
  return { pontos: pontos.slice(0, 220), ajustada: Math.ceil(area / (35 * 35)) > 220 };
}

function pontosComAltitude(resultados, amostras) {
  return resultados.map((resultado, indice) => ({ latitude: amostras[indice].latitude, longitude: amostras[indice].longitude, altitude: Number.isFinite(resultado.altitude) ? resultado.altitude : null, distanciaMetros: amostras[indice].distanciaMetros }));
}

function extremo(pontos, modo) {
  const validos = pontos.filter((p) => Number.isFinite(p.altitude));
  if (!validos.length) return null;
  return validos.reduce((melhor, ponto) => modo === "max" ? (ponto.altitude > melhor.altitude ? ponto : melhor) : (ponto.altitude < melhor.altitude ? ponto : melhor), validos[0]);
}

function mediaAltitude(pontos) {
  const validos = pontos.filter((p) => Number.isFinite(p.altitude));
  return validos.length ? validos.reduce((s, p) => s + p.altitude, 0) / validos.length : null;
}

function direcaoQueda(alto, baixo) {
  if (!alto || !baixo) return "-";
  const dLat = baixo.latitude - alto.latitude, dLng = baixo.longitude - alto.longitude;
  if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) return "-";
  const vertical = dLat >= 0 ? "sul" : "norte", horizontal = dLng >= 0 ? "leste" : "oeste";
  if (Math.abs(dLat) > Math.abs(dLng) * 1.7) return vertical;
  if (Math.abs(dLng) > Math.abs(dLat) * 1.7) return horizontal;
  return `${vertical}-${horizontal}`;
}

function metricasAltimetria(prefixo, rotulo, pontos, referencia) {
  const alto = extremo(pontos, "max"), baixo = extremo(pontos, "min");
  const dif = alto && baixo ? alto.altitude - baixo.altitude : null;
  const inc = Number.isFinite(dif) && referencia > 0 ? (dif / referencia) * 100 : null;
  const ang = Number.isFinite(inc) ? (Math.atan(inc / 100) * 180) / Math.PI : null;
  return [
    metrica(`${prefixo}_ponto_mais_alto`, `Ponto mais alto ${rotulo}`, coordenadaPtBr(alto), alto),
    metrica(`${prefixo}_altitude_mais_alta`, `Altitude do ponto mais alto ${rotulo}`, metrosPtBr(alto?.altitude, 2), alto, "m"),
    metrica(`${prefixo}_ponto_mais_baixo`, `Ponto mais baixo ${rotulo}`, coordenadaPtBr(baixo), baixo),
    metrica(`${prefixo}_altitude_mais_baixa`, `Altitude do ponto mais baixo ${rotulo}`, metrosPtBr(baixo?.altitude, 2), baixo, "m"),
    metrica(`${prefixo}_diferenca_elevacao`, `Diferença de elevação ${rotulo}`, metrosPtBr(dif, 2), null, "m"),
    metrica(`${prefixo}_altitude_media`, `Altitude média ${rotulo}`, metrosPtBr(mediaAltitude(pontos), 2), null, "m"),
    metrica(`${prefixo}_inclinacao_media`, `Inclinação média estimada ${rotulo}`, Number.isFinite(inc) ? `${numeroPtBr(inc, 2)} %` : "-"),
    metrica(`${prefixo}_angulo_medio`, `Ângulo médio estimado ${rotulo}`, Number.isFinite(ang) ? `${numeroPtBr(ang, 2)}°` : "-"),
    metrica(`${prefixo}_direcao_queda`, `Direção aproximada de queda ${rotulo}`, direcaoQueda(alto, baixo))
  ];
}

async function analisarPropriedade(body) {
  const geometria = body?.geometria;
  if (!geometria?.type) throw new ErroAplicacao("Informe uma geometria para analisar a propriedade.");
  const nome = body?.nome ?? "Elemento";
  const tipo = body?.tipo ?? geometria.type;

  if (geometria.type === "Point") {
    const coordenada = { latitude: geometria.coordinates[1], longitude: geometria.coordinates[0] };
    const [ponto] = pontosComAltitude(await consultarLote([coordenada]), [coordenada]);
    return { tipo, nome, resumo: { nome, tipo, quantidadePontos: 1, coordenadaCentral: coordenada }, metricas: [
      metrica("latitude", "Latitude", numeroPtBr(coordenada.latitude, 6), coordenada),
      metrica("longitude", "Longitude", numeroPtBr(coordenada.longitude, 6), coordenada),
      metrica("altitude_ponto", "Altitude do ponto", metrosPtBr(ponto.altitude, 2), coordenada, "m"),
      metrica("data_consulta", "Data/hora da consulta", new Date().toLocaleString("pt-BR")),
      metrica("fonte_altitude", "Fonte da altitude", "Open-Elevation"),
      metrica("precisao_estimada", "Precisão estimada", "Média"),
      metrica("coordenada_formatada", "Coordenada formatada", coordenadaPtBr(coordenada), coordenada)
    ] };
  }

  if (geometria.type === "LineString") {
    const coordenadas = geometria.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
    if (coordenadas.length < 2) throw new ErroAplicacao("A linha precisa ter pelo menos dois pontos.");
    const comprimento = comprimentoCoordenadas(coordenadas);
    const amostras = amostrarCaminho(coordenadas, 30, 180);
    const pontos = pontosComAltitude(await consultarLote(amostras), amostras);
    const alto = extremo(pontos, "max"), baixo = extremo(pontos, "min"), inicio = pontos[0], fim = pontos.at(-1);
    const dif = alto && baixo ? alto.altitude - baixo.altitude : null;
    const dec = Number.isFinite(dif) && comprimento > 0 ? (dif / comprimento) * 100 : null;
    const ang = Number.isFinite(dec) ? (Math.atan(dec / 100) * 180) / Math.PI : null;
    return { tipo, nome, aviso: amostras.length >= 180 ? "Amostragem ajustada automaticamente para evitar excesso de consultas." : undefined, resumo: { nome, tipo, quantidadePontos: coordenadas.length, coordenadaCentral: coordenadas[Math.floor(coordenadas.length / 2)] }, metricas: [
      metrica("tipo", "Tipo", "Linha"),
      metrica("quantidade_pontos", "Quantidade de pontos", numeroPtBr(coordenadas.length, 0)),
      metrica("comprimento_total", "Comprimento total", metrosPtBr(comprimento, 2), null, "m"),
      metrica("altitude_inicial", "Altitude no ponto inicial", metrosPtBr(inicio?.altitude, 2), inicio, "m"),
      metrica("altitude_final", "Altitude no ponto final", metrosPtBr(fim?.altitude, 2), fim, "m"),
      metrica("ponto_mais_alto_linha", "Ponto mais alto na linha", coordenadaPtBr(alto), alto),
      metrica("altitude_mais_alta_linha", "Altitude do ponto mais alto na linha", metrosPtBr(alto?.altitude, 2), alto, "m"),
      metrica("ponto_mais_baixo_linha", "Ponto mais baixo na linha", coordenadaPtBr(baixo), baixo),
      metrica("altitude_mais_baixa_linha", "Altitude do ponto mais baixo na linha", metrosPtBr(baixo?.altitude, 2), baixo, "m"),
      metrica("diferenca_elevacao", "Diferença de elevação", metrosPtBr(dif, 2), null, "m"),
      metrica("declividade_media", "Declividade média percentual", Number.isFinite(dec) ? `${numeroPtBr(dec, 2)} %` : "-"),
      metrica("angulo_medio", "Ângulo médio", Number.isFinite(ang) ? `${numeroPtBr(ang, 2)}°` : "-"),
      metrica("sentido_queda", "Sentido predominante de queda", direcaoQueda(alto, baixo)),
      metrica("distancia_ate_ponto_alto", "Comprimento acumulado até o ponto mais alto", metrosPtBr(alto?.distanciaMetros, 2), alto, "m"),
      metrica("distancia_ate_ponto_baixo", "Comprimento acumulado até o ponto mais baixo", metrosPtBr(baixo?.distanciaMetros, 2), baixo, "m")
    ] };
  }

  if (geometria.type === "Circle") {
    const centro = { latitude: geometria.center[1], longitude: geometria.center[0] };
    const raio = Number(geometria.radiusMeters);
    if (!Number.isFinite(raio) || raio <= 0) throw new ErroAplicacao("O círculo precisa ter raio válido em metros.");
    const area = Math.PI * raio * raio, perimetro = 2 * Math.PI * raio;
    const borda = Array.from({ length: 96 }, (_, i) => destinoGeografico(centro, raio, (i / 96) * 360));
    const areaAmostrada = amostrarAreaCirculo(centro, raio);
    const amostrasBorda = amostrarCaminho(fecharCoordenadas(borda), 30, 180);
    const [pontosArea, pontosBorda, pontoCentro] = await Promise.all([consultarLote(areaAmostrada.pontos), consultarLote(amostrasBorda), consultarLote([centro])]);
    return { tipo, nome, aviso: areaAmostrada.ajustada || amostrasBorda.length >= 180 ? "Amostragem ajustada automaticamente para evitar excesso de consultas." : undefined, resumo: { nome, tipo, quantidadePontos: 1, coordenadaCentral: centro }, metricas: [
      metrica("tipo", "Tipo", "Círculo"),
      metrica("raio", "Raio", metrosPtBr(raio, 2), null, "m"),
      metrica("diametro", "Diâmetro", metrosPtBr(raio * 2, 2), null, "m"),
      metrica("area", "Área", areaPtBr(area)),
      metrica("circunferencia", "Perímetro ou circunferência", metrosPtBr(perimetro, 2), null, "m"),
      metrica("centro", "Centro", coordenadaPtBr(centro), centro),
      metrica("altitude_centro", "Altitude no centro", metrosPtBr(pontoCentro[0]?.altitude, 2), centro, "m"),
      ...metricasAltimetria("area", "dentro da área útil do círculo", pontosComAltitude(pontosArea, areaAmostrada.pontos), raio * 2),
      ...metricasAltimetria("borda", "na borda do círculo", pontosComAltitude(pontosBorda, amostrasBorda), perimetro)
    ] };
  }

  if (geometria.type === "Polygon") {
    const coordenadas = fecharCoordenadas((geometria.coordinates?.[0] ?? []).map(([longitude, latitude]) => ({ latitude, longitude })));
    if (coordenadas.length < 4) throw new ErroAplicacao("O polígono precisa ter pelo menos três vértices.");
    const rotuloTipo = String(tipo).toLowerCase().includes("ret") ? "Retângulo" : "Polígono";
    const area = areaPoligono(coordenadas), perimetro = comprimentoCoordenadas(coordenadas), centro = centroidePoligono(coordenadas);
    const areaAmostrada = amostrarAreaPoligono(coordenadas);
    const amostrasPerimetro = amostrarCaminho(coordenadas, 30, 180);
    const [pontosArea, pontosPerimetro, pontoCentro] = await Promise.all([consultarLote(areaAmostrada.pontos), consultarLote(amostrasPerimetro), consultarLote([centro])]);
    const base = [
      metrica("tipo", "Tipo", rotuloTipo),
      metrica("quantidade_vertices", "Quantidade de vértices", numeroPtBr(Math.max(0, coordenadas.length - 1), 0)),
      metrica("area_util", "Área útil interna", areaPtBr(area)),
      metrica("perimetro", "Perímetro", metrosPtBr(perimetro, 2), null, "m")
    ];
    if (rotuloTipo === "Retângulo") {
      base.push(metrica("largura", "Largura aproximada", metrosPtBr(distancia(coordenadas[0], coordenadas[1]), 2), null, "m"));
      base.push(metrica("altura", "Altura aproximada", metrosPtBr(distancia(coordenadas[1], coordenadas[2]), 2), null, "m"));
    }
    base.push(metrica("centro", rotuloTipo === "Retângulo" ? "Centro do retângulo" : "Centroide aproximado", coordenadaPtBr(centro), centro));
    base.push(metrica("altitude_centro", rotuloTipo === "Retângulo" ? "Altitude no centro" : "Altitude no centroide", metrosPtBr(pontoCentro[0]?.altitude, 2), centro, "m"));
    return { tipo, nome, aviso: areaAmostrada.ajustada || amostrasPerimetro.length >= 180 ? "Amostragem ajustada automaticamente para evitar excesso de consultas." : undefined, resumo: { nome, tipo, quantidadePontos: Math.max(0, coordenadas.length - 1), coordenadaCentral: centro }, metricas: [
      ...base,
      ...metricasAltimetria("area", "dentro da área útil", pontosComAltitude(pontosArea, areaAmostrada.pontos), Math.sqrt(area ?? 0)),
      ...metricasAltimetria("perimetro", "no perímetro", pontosComAltitude(pontosPerimetro, amostrasPerimetro), perimetro)
    ] };
  }

  throw new ErroAplicacao("Tipo de geometria não suportado para análise de propriedade.");
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
    throw new ErroAplicacao("Área muito grande para a grade fixa de 100 m. Selecione uma área menor para manter curvas estáveis.");
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

function calcularBboxGeometriaCurvas(geometria) {
  if (!geometria?.type) throw new ErroAplicacao("Informe uma geometria válida para gerar curvas de nível.");

  if (geometria.type === "Circle") {
    const longitude = Number(geometria.center?.[0]);
    const latitude = Number(geometria.center?.[1]);
    const raio = Number(geometria.radiusMeters);
    if (![latitude, longitude, raio].every(Number.isFinite) || raio <= 0) {
      throw new ErroAplicacao("O círculo selecionado precisa ter centro e raio válidos.");
    }

    const deltaLat = raio / 111320;
    const deltaLng = raio / Math.max(1, 111320 * Math.cos((latitude * Math.PI) / 180));
    return validarBbox({
      minLat: latitude - deltaLat,
      minLng: longitude - deltaLng,
      maxLat: latitude + deltaLat,
      maxLng: longitude + deltaLng
    });
  }

  if (geometria.type !== "Polygon") {
    throw new ErroAplicacao("Selecione um retângulo, círculo ou polígono para gerar curvas.");
  }

  const pontos = geometria.coordinates?.[0] ?? [];
  if (pontos.length < 4) throw new ErroAplicacao("O polígono selecionado precisa ter pelo menos três vértices.");
  const latitudes = pontos.map((p) => Number(p[1]));
  const longitudes = pontos.map((p) => Number(p[0]));
  return validarBbox({
    minLat: Math.min(...latitudes),
    minLng: Math.min(...longitudes),
    maxLat: Math.max(...latitudes),
    maxLng: Math.max(...longitudes)
  });
}

function pontoDentroPoligonoCurvas(ponto, poligono) {
  const longitude = ponto[0], latitude = ponto[1];
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const lngI = poligono[i][0], latI = poligono[i][1], lngJ = poligono[j][0], latJ = poligono[j][1];
    if (latI > latitude !== latJ > latitude) {
      const lngIntersecao = ((lngJ - lngI) * (latitude - latI)) / (latJ - latI || 1) + lngI;
      if (longitude < lngIntersecao) dentro = !dentro;
    }
  }
  return dentro;
}

function pontoDentroGeometriaCurvas(ponto, geometria) {
  if (!geometria) return true;
  if (geometria.type === "Circle") {
    return distancia(
      { latitude: geometria.center[1], longitude: geometria.center[0] },
      { latitude: ponto[1], longitude: ponto[0] }
    ) <= Number(geometria.radiusMeters);
  }
  return pontoDentroPoligonoCurvas(ponto, geometria.coordinates?.[0] ?? []);
}

function filtrarLinhaGeometriaCurvas(linha, geometria) {
  if (!geometria) return [linha];
  const linhas = [];
  let atual = [];
  for (let i = 1; i < linha.length; i += 1) {
    const inicio = linha[i - 1], fim = linha[i];
    const meio = [(inicio[0] + fim[0]) / 2, (inicio[1] + fim[1]) / 2];
    if (!pontoDentroGeometriaCurvas(meio, geometria)) {
      if (atual.length >= 2) linhas.push(atual);
      atual = [];
      continue;
    }
    if (!atual.length) atual.push(inicio);
    atual.push(fim);
  }
  if (atual.length >= 2) linhas.push(atual);
  return linhas;
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
  const geometriaFiltro = body?.geometria ?? null;
  const bboxOriginal = geometriaFiltro ? calcularBboxGeometriaCurvas(geometriaFiltro) : validarBbox(body?.bbox);
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
        const linhasCortadasBbox = cortarLinhaParaBbox(suave, bboxOriginal);
        const linhasCortadas = geometriaFiltro
          ? linhasCortadasBbox.flatMap((linhaCortada) => filtrarLinhaGeometriaCurvas(linhaCortada, geometriaFiltro))
          : linhasCortadasBbox;
        for (const linhaCortada of linhasCortadas) {
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
    if (req.method === "GET" && url.pathname === "/api/client-info") {
      const ipHeader = req.headers["x-forwarded-for"];
      const ip = Array.isArray(ipHeader) ? ipHeader[0] : String(ipHeader ?? "").split(",")[0].trim() || null;
      return responder(res, 200, { ip, userAgent: req.headers["user-agent"] ?? null });
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
    if (req.method === "POST" && url.pathname === "/api/properties/analyze") return responder(res, 200, await analisarPropriedade(req.body));
    if (req.method === "POST" && url.pathname === "/api/contours") return responder(res, 200, await gerarCurvas(req.body));
    throw new ErroAplicacao("Rota não encontrada.", 404);
  } catch (erro) {
    const status = erro instanceof ErroAplicacao ? erro.status : 500;
    return responder(res, status, { erro: erro.message ?? "Erro interno na API de altimetria.", detalhes: erro.detalhes ?? null });
  }
}
