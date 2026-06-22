import type { AnalisePropriedade, ElementoMapa } from "../tipos/altimetria";
import { fetchApiProtegida, lerRespostaJson } from "./apiClient";

const MENSAGEM_ERRO_PROPRIEDADE = "Falha ao analisar a propriedade.";

export async function analisarPropriedadeElemento(elemento: ElementoMapa): Promise<AnalisePropriedade> {
  const resposta = await fetchApiProtegida("/api/properties/analyze", {
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

  return lerRespostaJson<AnalisePropriedade>(resposta, MENSAGEM_ERRO_PROPRIEDADE);
}
