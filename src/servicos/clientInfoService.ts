import type { InformacaoCliente } from "../tipos/autenticacao";
import { obterRegiaoNavegador, normalizarCodigoPais } from "../utilitarios/localizacaoAuth";

export async function obterInformacaoCliente(): Promise<InformacaoCliente> {
  try {
    const resposta = await fetch("/api/client-info");
    if (!resposta.ok) {
      throw new Error("Falha ao obter informações do cliente.");
    }
    const dados = (await resposta.json()) as InformacaoCliente;
    return {
      ip: dados.ip ?? null,
      userAgent: dados.userAgent ?? navigator.userAgent ?? null,
      countryCode: normalizarCodigoPais(dados.countryCode ?? obterRegiaoNavegador())
    };
  } catch {
    return {
      ip: null,
      userAgent: navigator.userAgent || null,
      countryCode: obterRegiaoNavegador()
    };
  }
}
