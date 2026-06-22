// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../utilitarios/localizacaoAuth", async () => {
  const real = await vi.importActual<typeof import("../../utilitarios/localizacaoAuth")>(
    "../../utilitarios/localizacaoAuth"
  );

  return {
    ...real,
    obterOpcoesPaises: () => [
      { value: "BR", label: "Brasil", descricao: "Brazil · BR", busca: "Brazil BR 55" },
      { value: "AQ", label: "Antártida", descricao: "Antarctica · AQ", busca: "Antarctica AQ" }
    ]
  };
});

import { WhatsAppField } from "./WhatsAppField";

describe("WhatsAppField", () => {
  it("renderiza a etapa de WhatsApp ignorando países sem DDI", () => {
    render(
      <WhatsAppField
        valor=""
        countryCode="BR"
        aoAlterar={vi.fn()}
        aoAlterarPais={vi.fn()}
      />
    );

    expect(screen.getByText("País do WhatsApp")).toBeTruthy();
    expect(screen.getByText("+55")).toBeTruthy();
    expect(screen.queryByText("Antártida")).toBeNull();
  });
});
