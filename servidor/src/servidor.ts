import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import {
  CURVAS_FATOR_DENSIFICACAO,
  CURVAS_LIMITE_PONTOS_API,
  CURVAS_RESOLUCAO_GLOBAL_METROS,
  obterPerfilIntervaloMinimoMetros,
  obterPerfilIntervaloPadraoMetros,
  obterPerfilLimiteAmostras,
  obterPortaServidor
} from "./configuracao";
import { ServicoCurvas } from "./servicos/curvas/servicoCurvas";
import { ServicoOpenElevation } from "./servicos/elevacao/servicoOpenElevation";
import { ServicoPropriedades } from "./servicos/propriedades/servicoPropriedades";
import { ServicoPerfil } from "./servicos/servicoPerfil";
import type { Coordenada } from "./tipos";
import { ErroAplicacao } from "./utilitarios/erros";

const aplicacao = express();
const porta = obterPortaServidor();
const servicoOpenElevation = new ServicoOpenElevation();
const servicoPerfil = new ServicoPerfil(servicoOpenElevation);
const servicoCurvas = new ServicoCurvas(servicoOpenElevation);
const servicoPropriedades = new ServicoPropriedades(servicoOpenElevation);

aplicacao.use(cors({ origin: true }));
aplicacao.use(express.json({ limit: "4mb" }));

function rotaAssincrona(
  manipulador: (requisicao: Request, resposta: Response, proximo: NextFunction) => Promise<void>
) {
  return (requisicao: Request, resposta: Response, proximo: NextFunction) => {
    manipulador(requisicao, resposta, proximo).catch(proximo);
  };
}

function lerCoordenadaDaQuery(requisicao: Request): Coordenada {
  return {
    latitude: Number(requisicao.query.lat ?? requisicao.query.latitude),
    longitude: Number(requisicao.query.lng ?? requisicao.query.longitude)
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

aplicacao.get(
  "/api/status",
  rotaAssincrona(async (_requisicao, resposta) => {
    const statusElevacao = servicoOpenElevation.obterStatus();
    resposta.json({
      backendOnline: true,
      dataHora: new Date().toISOString(),
      elevacao: {
        fonte: statusElevacao.fonte,
        configurada: statusElevacao.configurada,
        tamanhoLote: statusElevacao.tamanhoLote,
        timeoutMs: statusElevacao.timeoutMs,
        cacheAtivo: statusElevacao.cacheAtivo
      },
      curvas: {
        limitePontosApi: CURVAS_LIMITE_PONTOS_API,
        resolucaoGradeGlobalMetros: CURVAS_RESOLUCAO_GLOBAL_METROS,
        gradeTravada: true,
        sistemaGrade: "web_mercator_global",
        fatorDensificacao: CURVAS_FATOR_DENSIFICACAO
      },
      perfil: {
        intervaloPadraoMetros: obterPerfilIntervaloPadraoMetros(),
        intervaloMinimoMetros: obterPerfilIntervaloMinimoMetros(),
        limiteAmostras: obterPerfilLimiteAmostras()
      }
    });
  })
);

aplicacao.get(
  "/api/elevation",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoOpenElevation.consultarPonto(lerCoordenadaDaQuery(requisicao));
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/elevation/batch",
  rotaAssincrona(async (requisicao, resposta) => {
    const coordenadas = requisicao.body?.coordenadas;
    if (!Array.isArray(coordenadas)) {
      throw new ErroAplicacao("Envie uma lista no campo coordenadas.");
    }
    if (coordenadas.length > 5000) {
      throw new ErroAplicacao("A consulta em lote aceita até 5000 pontos por requisição.");
    }

    const resultados = await servicoOpenElevation.consultarLote(coordenadas.map(normalizarCoordenadaEntrada));
    resposta.json({ resultados });
  })
);

aplicacao.post(
  "/api/elevation/profile",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoPerfil.analisarPerfil(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/properties/analyze",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoPropriedades.analisarPropriedade(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/contours",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoCurvas.gerarCurvas(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.use((_requisicao, _resposta, proximo) => {
  proximo(new ErroAplicacao("Rota não encontrada.", 404));
});

aplicacao.use((erro: unknown, _requisicao: Request, resposta: Response, _proximo: NextFunction) => {
  if (erro instanceof ErroAplicacao) {
    resposta.status(erro.statusHttp).json({
      erro: erro.message,
      detalhes: erro.detalhes ?? null
    });
    return;
  }

  const mensagem = erro instanceof Error ? erro.message : "Erro interno desconhecido.";
  console.error("Erro inesperado na API:", erro);
  resposta.status(500).json({
    erro: "Erro interno na API de altimetria.",
    detalhes: mensagem
  });
});

aplicacao.listen(porta, "127.0.0.1", () => {
  console.log(`API Curva de Nível disponível em http://127.0.0.1:${porta}`);
});
