import { criarCabecalhosCors } from "./cors.ts";

export class ErroHttp extends Error {
  status: number;
  codigo: string;

  constructor(codigo: string, mensagem: string, status = 400) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

const CABECALHOS_JSON = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store"
};

export function criarRequestId(): string {
  return crypto.randomUUID();
}

export function responderJson(requisicao: Request, status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CABECALHOS_JSON,
      ...criarCabecalhosCors(requisicao)
    }
  });
}

export function responderOptions(requisicao: Request) {
  return new Response(null, {
    status: 204,
    headers: criarCabecalhosCors(requisicao)
  });
}

export function responderErro(requisicao: Request, requestId: string, erro: unknown) {
  const status = erro instanceof ErroHttp ? erro.status : 500;
  const code = erro instanceof ErroHttp ? erro.codigo : "INTERNAL_ERROR";
  const message = erro instanceof ErroHttp ? erro.message : "Não foi possível concluir a solicitação.";

  if (!(erro instanceof ErroHttp)) {
    console.error("Erro inesperado em verificação:", { requestId, erro });
  }

  return responderJson(requisicao, status, {
    ok: false,
    code,
    message,
    requestId
  });
}

