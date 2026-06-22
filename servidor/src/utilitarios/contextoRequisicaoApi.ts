import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextoRequisicaoApi {
  tokenUsuario?: string;
}

const armazenamentoContextoApi = new AsyncLocalStorage<ContextoRequisicaoApi>();

export function executarComContextoApi<T>(contexto: ContextoRequisicaoApi, acao: () => T): T {
  return armazenamentoContextoApi.run(contexto, acao);
}

export function obterTokenUsuarioAtual(): string | undefined {
  return armazenamentoContextoApi.getStore()?.tokenUsuario;
}
