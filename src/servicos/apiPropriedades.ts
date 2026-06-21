import type { AnalisePropriedade, ElementoMapa } from "../tipos/altimetria";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function lerRespostaJson<T>(resposta: Response): Promise<T> {
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === "object" && "erro" in corpo
        ? String((corpo as { erro: unknown }).erro)
        : "Falha ao analisar a propriedade.";
    throw new Error(mensagem);
  }

  return corpo as T;
}

export async function analisarPropriedadeElemento(elemento: ElementoMapa): Promise<AnalisePropriedade> {
  const resposta = await fetch(`${API_BASE}/api/properties/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nome: elemento.nome,
      tipo: elemento.tipo,
      geometria: elemento.geometria
    })
  });

  return lerRespostaJson<AnalisePropriedade>(resposta);
}
