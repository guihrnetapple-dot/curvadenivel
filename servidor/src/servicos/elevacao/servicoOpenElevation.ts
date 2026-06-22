import {
  obterOpenElevationCacheMaxItens,
  obterOpenElevationCacheTtlMs,
  obterOpenElevationMaxConcorrencia,
  obterOpenElevationTamanhoLote,
  obterOpenElevationTimeoutMs
} from "../../configuracao";
import type { Coordenada, OpcoesConsultaElevacao, ProvedorElevacao, ResultadoAltitude } from "../../tipos";
import { obterTokenUsuarioAtual } from "../../utilitarios/contextoRequisicaoApi";
import { ErroAplicacao } from "../../utilitarios/erros";
import { CacheElevacao, criarChaveCacheElevacao } from "./cacheElevacao";
import type { RespostaOpenElevation } from "./tiposElevacao";

const STATUS_RETRY = new Set([502, 503, 504]);
const AVISO_PRECISAO =
  "Altitude consultada. A precisão depende da base altimétrica disponível.";
function aguardar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function extrairRetryAfterMs(resposta: Response): number | null {
  const valor = resposta.headers.get("retry-after");
  return extrairRetryAfterMsDoValor(valor);
}

function extrairRetryAfterMsDoValor(valor: string | undefined | null): number | null {
  if (!valor) {
    return null;
  }

  const segundos = Number(valor);
  if (Number.isFinite(segundos)) {
    return Math.max(0, segundos * 1000);
  }

  const data = Date.parse(valor);
  return Number.isFinite(data) ? Math.max(0, data - Date.now()) : null;
}

function criarResultadoOpenElevation(coordenada: Coordenada, altitude: number | null): ResultadoAltitude {
  return {
    latitude: coordenada.latitude,
    longitude: coordenada.longitude,
    altitude,
    status: altitude === null ? "sem_dado" : "valido",
    fonte: "open_elevation",
    metodo: "api",
    precisaoReal: "media",
    avisoPrecisao: AVISO_PRECISAO,
    mensagem:
      altitude === null
        ? "Não foi retornada altitude válida para esse ponto."
        : "Altitude consultada com sucesso.",
    consultadoEm: new Date().toISOString()
  };
}

export class ServicoOpenElevation implements ProvedorElevacao {
  private readonly urlApi: string;
  private readonly tamanhoLote: number;
  private readonly timeoutMs: number;
  private readonly maxConcorrencia: number;
  private readonly cache: CacheElevacao;
  private readonly requisicoesPendentes = new Map<string, Promise<ResultadoAltitude>>();

  constructor() {
    this.urlApi = process.env.SUPABASE_ELEVATION_PROXY_URL ?? "";
    this.tamanhoLote = obterOpenElevationTamanhoLote();
    this.timeoutMs = obterOpenElevationTimeoutMs();
    this.maxConcorrencia = obterOpenElevationMaxConcorrencia();
    this.cache = new CacheElevacao(obterOpenElevationCacheTtlMs(), obterOpenElevationCacheMaxItens());
  }

  async consultarPonto(coordenada: Coordenada, opcoes: OpcoesConsultaElevacao = {}): Promise<ResultadoAltitude> {
    const [resultado] = await this.consultarLote([coordenada], opcoes);
    return resultado;
  }

  async consultarLote(coordenadas: Coordenada[], opcoes: OpcoesConsultaElevacao = {}): Promise<ResultadoAltitude[]> {
    if (!Array.isArray(coordenadas) || coordenadas.length === 0) {
      return [];
    }

    const coordenadasNormalizadas = coordenadas.map((coordenada) => this.normalizarCoordenada(coordenada));
    const resultados = new Array<ResultadoAltitude>(coordenadasNormalizadas.length);
    const faltantesPorChave = new Map<string, Coordenada>();
    const indicesPorChave = new Map<string, number[]>();

    coordenadasNormalizadas.forEach((coordenada, indice) => {
      const chave = criarChaveCacheElevacao(coordenada.latitude, coordenada.longitude);
      const emCache = this.cache.obter(coordenada.latitude, coordenada.longitude);
      if (emCache) {
        resultados[indice] = { ...emCache, latitude: coordenada.latitude, longitude: coordenada.longitude };
        return;
      }

      faltantesPorChave.set(chave, coordenada);
      indicesPorChave.set(chave, [...(indicesPorChave.get(chave) ?? []), indice]);
    });

    const faltantes = [...faltantesPorChave.entries()];
    const respostasFaltantes = await this.consultarFaltantes(faltantes, this.obterTokenUsuario(opcoes));

    for (const [chave, resultado] of respostasFaltantes) {
      for (const indice of indicesPorChave.get(chave) ?? []) {
        const coordenadaOriginal = coordenadasNormalizadas[indice];
        resultados[indice] = {
          ...resultado,
          latitude: coordenadaOriginal.latitude,
          longitude: coordenadaOriginal.longitude
        };
      }
    }

    return resultados;
  }

  obterStatus() {
    return {
      fonte: "Open-Elevation API",
      configurada: Boolean(this.urlApi),
      tamanhoLote: this.tamanhoLote,
      timeoutMs: this.timeoutMs,
      cacheAtivo: true,
      cache: this.cache.obterEstatisticas()
    };
  }

  private normalizarCoordenada(coordenada: Coordenada): Coordenada {
    const latitude = Number(coordenada.latitude);
    const longitude = Number(coordenada.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
    }
    if (latitude < -90 || latitude > 90) {
      throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
    }
    if (longitude < -180 || longitude > 180) {
      throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
    }

    return { latitude, longitude };
  }

  private obterTokenUsuario(opcoes: OpcoesConsultaElevacao): string {
    const token = opcoes.tokenUsuario ?? obterTokenUsuarioAtual();
    if (!token) {
      throw new ErroAplicacao("Autenticação obrigatória para consultar altitude.", 401);
    }
    return token;
  }

  private obterUrlProxy(): string {
    if (!this.urlApi) {
      throw new ErroAplicacao("Proxy de altitude do Supabase não configurado.", 503);
    }
    return this.urlApi;
  }

  private async consultarFaltantes(faltantes: Array<[string, Coordenada]>, tokenUsuario: string): Promise<Map<string, ResultadoAltitude>> {
    const respostas = new Map<string, ResultadoAltitude>();
    const lotes: Array<Array<[string, Coordenada]>> = [];

    for (let indice = 0; indice < faltantes.length; indice += this.tamanhoLote) {
      lotes.push(faltantes.slice(indice, indice + this.tamanhoLote));
    }

    let cursor = 0;
    const executarProximo = async (): Promise<void> => {
      while (cursor < lotes.length) {
        const lote = lotes[cursor];
        cursor += 1;
        const resultadoLote = await this.consultarLoteUnico(lote, tokenUsuario);
        for (const [chave, resultado] of resultadoLote) {
          respostas.set(chave, resultado);
        }
      }
    };

    const trabalhadores = Array.from({ length: Math.min(this.maxConcorrencia, lotes.length) }, executarProximo);
    await Promise.all(trabalhadores);
    return respostas;
  }

  private async consultarLoteUnico(lote: Array<[string, Coordenada]>, tokenUsuario: string): Promise<Map<string, ResultadoAltitude>> {
    const resultados = new Map<string, ResultadoAltitude>();
    const pendentes: Array<[string, Coordenada]> = [];

    for (const [chave, coordenada] of lote) {
      const requisicaoPendente = this.requisicoesPendentes.get(chave);
      if (requisicaoPendente) {
        resultados.set(chave, await requisicaoPendente);
        continue;
      }
      pendentes.push([chave, coordenada]);
    }

    if (pendentes.length === 0) {
      return resultados;
    }

    const promessa = this.enviarLoteComRetry(pendentes.map(([, coordenada]) => coordenada), tokenUsuario);
    pendentes.forEach(([chave], indice) => {
      this.requisicoesPendentes.set(
        chave,
        promessa.then((lista) => lista[indice])
      );
    });

    try {
      const respostas = await promessa;
      respostas.forEach((resultado, indice) => {
        const [chave] = pendentes[indice];
        this.cache.definir(resultado);
        resultados.set(chave, resultado);
      });
    } finally {
      for (const [chave] of pendentes) {
        this.requisicoesPendentes.delete(chave);
      }
    }

    return resultados;
  }

  private async enviarLoteComRetry(coordenadas: Coordenada[], tokenUsuario: string): Promise<ResultadoAltitude[]> {
    let ultimoErro: unknown;

    for (let tentativa = 0; tentativa <= 2; tentativa += 1) {
      try {
        return await this.enviarLote(coordenadas, tokenUsuario);
      } catch (erro) {
        ultimoErro = erro;
        const status = erro instanceof ErroAplicacao ? erro.statusHttp : 0;
        if (!STATUS_RETRY.has(status) || tentativa === 2) {
          throw erro;
        }
        const esperaMs = erro instanceof ErroAplicacao && typeof erro.detalhes === "object"
          ? Number((erro.detalhes as { retryAfterMs?: number }).retryAfterMs ?? 0)
          : 0;
        await aguardar(esperaMs > 0 ? esperaMs : 500 * (tentativa + 1));
      }
    }

    throw ultimoErro;
  }

  private async enviarLote(coordenadas: Coordenada[], tokenUsuario: string): Promise<ResultadoAltitude[]> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);

    try {
      const resposta = await fetch(this.obterUrlProxy(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${tokenUsuario}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locations: coordenadas.map((coordenada) => ({
            latitude: coordenada.latitude,
            longitude: coordenada.longitude
          }))
        }),
        signal: controlador.signal
      });

      const corpo = (await resposta.json().catch(() => null)) as RespostaOpenElevation | null;

      if (!resposta.ok) {
        const mensagem = typeof (corpo as { erro?: unknown } | null)?.erro === "string"
          ? String((corpo as { erro: string }).erro)
          : `Proxy de altitude respondeu com status ${resposta.status}.`;
        throw new ErroAplicacao(mensagem, resposta.status, {
          retryAfterMs: extrairRetryAfterMs(resposta)
        });
      }

      if (!Array.isArray(corpo?.results) || corpo.results.length !== coordenadas.length) {
        throw new ErroAplicacao("A resposta do proxy de altitude veio em formato inesperado.", 502);
      }

      return corpo.results.map((resultado, indice) => {
        const altitude = Number(resultado.elevation);
        return criarResultadoOpenElevation(coordenadas[indice], Number.isFinite(altitude) ? altitude : null);
      });
    } catch (erro) {

      if (erro instanceof ErroAplicacao) {
        throw erro;
      }
      throw new ErroAplicacao("Não foi possível consultar o proxy de altitude. Verifique sua conexão e tente novamente.", 502);
    } finally {
      clearTimeout(temporizador);
    }
  }
}
