import { obterCaminhoArquivoAltitude } from "../servidor/src/configuracao";
import { ServicoAltitude } from "../servidor/src/servicos/servicoAltitude";
import { ServicoPerfil } from "../servidor/src/servicos/servicoPerfil";
import type { Coordenada } from "../servidor/src/tipos";
import { ErroAplicacao } from "../servidor/src/utilitarios/erros";

const servicoAltitude = new ServicoAltitude(obterCaminhoArquivoAltitude());
const servicoPerfil = new ServicoPerfil(servicoAltitude);

interface RequisicaoHttp {
  method?: string;
  url?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

interface RespostaHttp {
  status(codigo: number): RespostaHttp;
  json(dados: unknown): void;
  setHeader(nome: string, valor: string): void;
  end(): void;
}

function enviarCors(resposta: RespostaHttp): void {
  resposta.setHeader("Access-Control-Allow-Origin", "*");
  resposta.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resposta.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function lerCoordenadaDaQuery(requisicao: RequisicaoHttp): Coordenada {
  const query = requisicao.query ?? {};
  return {
    latitude: Number(query.lat ?? query.latitude),
    longitude: Number(query.lng ?? query.longitude)
  };
}

function normalizarCoordenadaEntrada(entrada: unknown): Coordenada {
  if (!entrada || typeof entrada !== "object") {
    throw new ErroAplicacao("Cada coordenada precisa ser um objeto com latitude e longitude.");
  }

  const registro = entrada as Record<string, unknown>;
  return {
    latitude: Number(registro.latitude ?? registro.lat),
    longitude: Number(registro.longitude ?? registro.lng)
  };
}

function lerCorpo(requisicao: RequisicaoHttp): Record<string, unknown> {
  if (!requisicao.body) return {};
  if (typeof requisicao.body === "string") {
    try {
      return JSON.parse(requisicao.body) as Record<string, unknown>;
    } catch {
      throw new ErroAplicacao("JSON inválido no corpo da requisição.");
    }
  }
  if (typeof requisicao.body === "object") {
    return requisicao.body as Record<string, unknown>;
  }
  throw new ErroAplicacao("Corpo da requisição inválido.");
}

function obterCaminhoRota(requisicao: RequisicaoHttp): string {
  const url = new URL(requisicao.url ?? "/api/status", "http://localhost");
  return url.pathname.replace(/\/+$/, "");
}

async function manipularRota(requisicao: RequisicaoHttp, resposta: RespostaHttp): Promise<void> {
  enviarCors(resposta);

  if (requisicao.method === "OPTIONS") {
    resposta.status(204).end();
    return;
  }

  const caminho = obterCaminhoRota(requisicao);

  if (requisicao.method === "GET" && caminho === "/api/status") {
    await servicoAltitude.carregarArquivo().catch(() => undefined);
    resposta.status(200).json({
      backendOnline: true,
      dataHora: new Date().toISOString(),
      ambiente: "vercel",
      altitude: servicoAltitude.obterStatus()
    });
    return;
  }

  if (requisicao.method === "GET" && caminho === "/api/elevation") {
    const resultado = await servicoAltitude.consultarPonto(lerCoordenadaDaQuery(requisicao));
    resposta.status(200).json(resultado);
    return;
  }

  if (requisicao.method === "POST" && caminho === "/api/elevation/batch") {
    const corpo = lerCorpo(requisicao);
    const coordenadas = corpo.coordenadas;
    if (!Array.isArray(coordenadas)) {
      throw new ErroAplicacao("Envie uma lista no campo coordenadas.");
    }
    if (coordenadas.length > 1000) {
      throw new ErroAplicacao("A consulta em lote aceita até 1000 pontos por requisição.");
    }

    const resultados = await Promise.all(
      coordenadas.map((coordenada) =>
        servicoAltitude.consultarPonto(normalizarCoordenadaEntrada(coordenada))
      )
    );
    resposta.status(200).json({ resultados });
    return;
  }

  if (requisicao.method === "POST" && caminho === "/api/elevation/profile") {
    const resultado = await servicoPerfil.analisarPerfil(lerCorpo(requisicao) as never);
    resposta.status(200).json(resultado);
    return;
  }

  throw new ErroAplicacao("Rota não encontrada.", 404);
}

export default async function handler(
  requisicao: RequisicaoHttp,
  resposta: RespostaHttp
): Promise<void> {
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

    const mensagem = erro instanceof Error ? erro.message : "Erro interno desconhecido.";
    resposta.status(500).json({
      erro: "Erro interno na API de altimetria.",
      detalhes: mensagem
    });
  }
}
