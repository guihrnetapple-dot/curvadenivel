import { describe, expect, it } from "vitest";

import {
  criarAtualizacaoEstadoEndereco,
  criarAtualizacaoPaisEndereco,
  obterCodigoEstadoPorNome,
  obterCodigoPaisPorNome
} from "./localizacaoAuth";

describe("localização do cadastro", () => {
  it("alteração do país limpa estado e cidade", () => {
    expect(criarAtualizacaoPaisEndereco("PT")).toMatchObject({
      countryCode: "PT",
      country: "Portugal",
      stateCode: "",
      state: "",
      city: ""
    });
  });

  it("alteração do estado limpa cidade", () => {
    expect(criarAtualizacaoEstadoEndereco("MG", "Minas Gerais")).toEqual({
      stateCode: "MG",
      state: "Minas Gerais",
      city: ""
    });
  });

  it("recupera códigos a partir dos nomes salvos no perfil", () => {
    expect(obterCodigoPaisPorNome("Brasil")).toBe("BR");
    expect(obterCodigoEstadoPorNome("BR", "Minas Gerais")).toBe("MG");
  });
});
