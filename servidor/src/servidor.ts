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
import { exigirAutenticacaoApi } from "./utilitarios/autenticacaoApi";
import { ErroAplicacao } from "./utilitarios/erros";

const aplicacao = express();
const porta = obterPortaServidor();
const servicoOpenElevation = new ServicoOpenElevation();
const servicoPerfil = new ServicoPerfil(servicoOpenElevation);
const servicoCurvas = new ServicoCurvas(servicoOpenElevation);
const servicoPropriedades = new ServicoPropriedades(servicoOpenElevation);

const origensPermitidas = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);

aplicacao.use(
  cors({
    origin(origem, callback) {
      if (!origem || origensPermitidas.has(origem)) {
        callback(null, true);
        return;
      }
      callback(new ErroAplicacao("Origem não permitida.", 403));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
aplicacao.use(express.json({ limit: "2mb" }));
aplicacao.use("/api", (_requisicao, resposta, proximo) => {
  resposta.setHeader("Cache-Control", "private, no-store");
  proximo();
});

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

function normalizarCountryCode(valor: unknown): string | null {
  const codigo = String(valor ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(codigo) ? codigo : null;
}

function obterCountryCode(requisicao: Request): string {
  const cabecalhos = [
    requisicao.headers["x-vercel-ip-country"],
    requisicao.headers["cf-ipcountry"],
    requisicao.headers["x-country-code"],
    requisicao.headers["x-appengine-country"]
  ];

  for (const cabecalho of cabecalhos) {
    const codigo = normalizarCountryCode(Array.isArray(cabecalho) ? cabecalho[0] : cabecalho);
    if (codigo && codigo !== "XX") return codigo;
  }

  const acceptLanguage = String(requisicao.headers["accept-language"] ?? "");
  const idiomaComRegiao = acceptLanguage.match(/(?:^|,)\s*[a-z]{2,3}-([A-Za-z]{2})/);
  return normalizarCountryCode(idiomaComRegiao?.[1]) ?? "BR";
}

aplicacao.get(
  "/api/health",
  rotaAssincrona(async (_requisicao, resposta) => {
    resposta.json({ ok: true });
  })
);

aplicacao.get(
  "/api/status",
  exigirAutenticacaoApi,
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
  "/api/client-info",
  rotaAssincrona(async (requisicao, resposta) => {
    const ipEncaminhado = requisicao.headers["x-forwarded-for"];
    resposta.json({
      ip: Array.isArray(ipEncaminhado) ? ipEncaminhado[0] : ipEncaminhado?.split(",")[0]?.trim() ?? requisicao.ip ?? null,
      userAgent: requisicao.headers["user-agent"] ?? null,
      countryCode: obterCountryCode(requisicao)
    });
  })
);

aplicacao.get(
  "/api/elevation",
  exigirAutenticacaoApi,
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoOpenElevation.consultarPonto(lerCoordenadaDaQuery(requisicao));
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/elevation/batch",
  exigirAutenticacaoApi,
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
  exigirAutenticacaoApi,
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoPerfil.analisarPerfil(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/properties/analyze",
  exigirAutenticacaoApi,
  rotaAssincrona(async (requisicao, resposta) => {
    const resultado = await servicoPropriedades.analisarPropriedade(requisicao.body);
    resposta.json(resultado);
  })
);

aplicacao.post(
  "/api/contours",
  exigirAutenticacaoApi,
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
      erro: erro.message
    });
    return;
  }

  console.error("Erro inesperado na API:", erro);
  resposta.status(500).json({
    erro: "Erro interno na API de altimetria."
  });
});

aplicacao.listen(porta, "127.0.0.1", () => {
  console.log(`API Curva de Nível disponível em http://127.0.0.1:${porta}`);
});
