import type { InformacaoCliente } from "../tipos/autenticacao";

export async function obterInformacaoCliente(): Promise<InformacaoCliente> {
  try {
    const resposta = await fetch("/api/client-info");
    if (!resposta.ok) {
      throw new Error("Falha ao obter informações do cliente.");
    }
    return (await resposta.json()) as InformacaoCliente;
  } catch {
    return {
      ip: null,
      userAgent: navigator.userAgent || null
    };
  }
}
