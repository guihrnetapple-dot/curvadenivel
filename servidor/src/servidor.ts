import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import {
  obterCaminhoArquivoAltitude,
  obterFonteElevacao,
  obterMetodoInterpolacao,
  obterPerfilIntervaloMinimoMetros,
  obterPerfilIntervaloPadraoMetros,
  obterPerfilLimiteAmostras,
  obterPortaServidor
} from "./configuracao";
import { ServicoAltitude } from "./servicos/servicoAltitude";
import { ServicoOpenElevation } from "./servicos/servicoOpenElevation";
import { ServicoCurvasOpenElevation } from "./servicos/curvas/servicoCurvasOpenElevation";
import { ServicoCurvasRaw } from "./servicos/curvas/servicoCurvasRaw";
import { ServicoPerfil } from "./servicos/servicoPerfil";
import type { Coordenada } from "./tipos";
import { ErroAplicacao } from "./utilitarios/erros";

const aplicacao = express();
const porta = obterPortaServidor();
const servicoAltitude = new ServicoAltitude(obterCaminhoArquivoAltitude());
const servicoOpenElevation = new ServicoOpenElevation();
const servicoPerfil = new ServicoPerfil(servicoAltitude);
const servicoCurvasRaw = new ServicoCurvasRaw(servicoAltitude);
const servicoCurvasOpenElevation = new ServicoCurvasOpenElevation(servicoOpenElevation);

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
    resposta.json({
      backendOnline: true,
      dataHora: new Date().toISOString(),
      configuracao: {
        fonteElevacao: obterFonteElevacao(),
        metodoInterpolacao: obterMetodoInterpolacao(),
        perfilIntervaloPadraoMetros: obterPerfilIntervaloPadraoMetros(),
        perfilIntervaloMinimoMetros: obterPerfilIntervaloMinimoMetros(),
        perfilLimiteAmostras: obterPerfilLimiteAmostras()
      },
      altitude: servicoAltitude.obterStatus()
    });
  })
);

aplicacao.get(
  "/api/elevation",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoAltitude.consultarPonto(lerCoordenadaDaQuery(requisicao));
    resposta.json(resultado);
  })
);

aplicacao.get(
  "/api/elevation/open-elevation",
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
    if (coordenadas.length > 1000) {
      throw new ErroAplicacao("A consulta em lote aceita até 1000 pontos por requisição.");
    }

    const resultados = await Promise.all(
      coordenadas.map((coordenada) =>
        servicoAltitude.consultarPonto(normalizarCoordenadaEntrada(coordenada))
      )
    );
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
  "/api/contours/raw",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoCurvasRaw.gerarCurvas(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/contours/open-elevation",
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoCurvasOpenElevation.gerarCurvas(requisicao.body);
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

await servicoAltitude.carregarArquivo().catch((erro) => {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  console.error(`API iniciada, mas o arquivo RAW ainda não foi carregado: ${mensagem}`);
});

aplicacao.listen(porta, "127.0.0.1", () => {
  console.log(`API Curva de Nível disponível em http://127.0.0.1:${porta}`);
});
