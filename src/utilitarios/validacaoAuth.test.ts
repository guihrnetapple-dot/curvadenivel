import { describe, expect, it } from "vitest";

import type { DadosCadastro } from "../tipos/autenticacao";
import {
  normalizarWhatsApp,
  traduzirErroAuth,
  validarCadastroCompleto,
  validarEmail,
  validarSenha,
  validarWhatsApp
} from "./validacaoAuth";

function criarCadastro(parcial: Partial<DadosCadastro> = {}): DadosCadastro {
  return {
    email: "usuario@exemplo.com",
    password: "senha123",
    full_name: "Usuário Teste",
    profession: "Engenheiro",
    work_area: "Topografia",
    company_name: "GeoCampo",
    whatsapp: "+5538999999999",
    city: "Montes Claros",
    state: "Minas Gerais",
    country: "Brasil",
    countryCode: "BR",
    stateCode: "MG",
    whatsappCountryCode: "BR",
    aceitaTermos: true,
    aceitaPrivacidadeLgpd: true,
    aceitaCookies: true,
    aceitaComunicacoes: true,
    ...parcial
  };
}

describe("validação de autenticação", () => {
  it("rejeita campo obrigatório vazio", () => {
    const erros = validarCadastroCompleto(criarCadastro({ full_name: "" }), "senha123");
    expect(erros.full_name).toBe("Preencha o campo Nome completo.");
  });

  it("rejeita campo contendo somente espaços", () => {
    const erros = validarCadastroCompleto(criarCadastro({ company_name: "   " }), "senha123");
    expect(erros.company_name).toBe("Preencha o campo Nome da empresa.");
  });

  it("rejeita e-mail inválido", () => {
    expect(validarEmail("email-invalido")).toBe("Informe um e-mail válido.");
  });

  it("rejeita senha com menos de oito caracteres", () => {
    expect(validarSenha("1234567")).toBe("Use uma senha com pelo menos 8 caracteres.");
  });

  it("rejeita senhas diferentes", () => {
    const erros = validarCadastroCompleto(criarCadastro(), "outra123");
    expect(erros.confirmPassword).toBe("As senhas informadas não conferem.");
  });

  it("valida número brasileiro", () => {
    expect(validarWhatsApp("+5538999999999", "BR")).toBeNull();
  });

  it("valida número de outro país", () => {
    expect(validarWhatsApp("+14155552671", "US")).toBeNull();
  });

  it("rejeita número inválido", () => {
    expect(validarWhatsApp("123", "BR")).toBe("Informe um número de WhatsApp válido para o país selecionado.");
  });

  it("normaliza WhatsApp para E.164", () => {
    expect(normalizarWhatsApp("(38) 99999-9999", "BR")).toBe("+5538999999999");
  });

  it("mapeia email_exists", () => {
    expect(traduzirErroAuth({ code: "email_exists" })).toContain("Este e-mail já está cadastrado");
  });

  it("mapeia user_already_exists", () => {
    expect(traduzirErroAuth({ code: "user_already_exists" })).toContain("Este e-mail já está cadastrado");
  });

  it("mapeia otp_expired", () => {
    expect(traduzirErroAuth({ code: "otp_expired" })).toBe("O código de confirmação expirou ou já foi usado. Solicite um novo código de confirmação.");
  });
});
