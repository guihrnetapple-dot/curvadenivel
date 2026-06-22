import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  resend: vi.fn(),
  salvarPerfilUsuario: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("../lib/supabaseClient", () => ({
  obterSupabase: () => ({
    auth: {
      signUp: mocks.signUp,
      resend: mocks.resend,
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut
    }
  })
}));

vi.mock("./clientInfoService", () => ({
  obterInformacaoCliente: async () => ({ ip: "127.0.0.1", userAgent: "vitest", countryCode: "BR" })
}));

vi.mock("./profileService", () => ({
  salvarPerfilUsuario: mocks.salvarPerfilUsuario
}));

import {
  cadastrarComEmailSenha,
  entrarComEmailSenha,
  obterUltimoReenvioConfirmacao,
  restaurarPerfilConfirmacaoPendente,
  reenviarCodigoConfirmacao
} from "./authService";

function criarStorage() {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => dados.set(chave, valor),
    removeItem: (chave: string) => dados.delete(chave),
    clear: () => dados.clear()
  };
}

function criarCadastro() {
  return {
    email: "USUARIO@EXEMPLO.COM",
    password: "senha123",
    full_name: "Usuário Teste",
    profession: "Engenheiro",
    work_area: "Topografia",
    company_name: "Curva de Nível",
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
    aceitaComunicacoes: true
  };
}

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sessionStorageMock = criarStorage();
    const localStorageMock = criarStorage();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173" },
      sessionStorage: sessionStorageMock,
      localStorage: localStorageMock
    });
  });

  it("retorna confirmação necessária quando o cadastro não cria sessão", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    const resultado = await cadastrarComEmailSenha(criarCadastro());
    expect(resultado).toEqual({ status: "confirmacao_necessaria", email: "usuario@exemplo.com" });
  });

  it("retorna autenticado quando o cadastro cria sessão", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: { access_token: "token" } },
      error: null
    });
    mocks.salvarPerfilUsuario.mockResolvedValueOnce({});
    const resultado = await cadastrarComEmailSenha(criarCadastro());
    expect(resultado).toEqual({ status: "autenticado" });
    expect(mocks.salvarPerfilUsuario).toHaveBeenCalledOnce();
  });

  it("não grava senha no sessionStorage durante confirmação pendente", async () => {
    const storage = criarStorage();
    vi.stubGlobal("sessionStorage", storage);
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    await cadastrarComEmailSenha(criarCadastro());
    expect(storage.getItem("auth.emailConfirmacaoPendente")).toBe("usuario@exemplo.com");
    expect(storage.getItem("auth.perfilConfirmacaoPendente")).toBeNull();
    expect(localStorage.getItem("auth.perfilConfirmacaoPendente")).not.toContain("senha123");
  });

  it("restaura perfil preenchido antes da confirmaÃ§Ã£o de e-mail", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    mocks.salvarPerfilUsuario.mockResolvedValueOnce({ id: "u1", full_name: "UsuÃ¡rio Teste" });

    await cadastrarComEmailSenha(criarCadastro());
    const perfil = await restaurarPerfilConfirmacaoPendente("u1", "usuario@exemplo.com");

    expect(perfil).toEqual({ id: "u1", full_name: "UsuÃ¡rio Teste" });
    expect(mocks.salvarPerfilUsuario).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ full_name: "Usuário Teste", whatsapp: "+5538999999999" }),
      expect.objectContaining({ userAgent: "vitest" })
    );
    expect(localStorage.getItem("auth.perfilConfirmacaoPendente")).toBeNull();
  });

  it("usa preferÃªncia persistente somente quando o usuÃ¡rio pede para nÃ£o solicitar login novamente", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: null });

    await entrarComEmailSenha("usuario@exemplo.com", "senha123", true);

    expect(localStorage.getItem("auth.loginPersistenteNestaMaquina")).toBe("true");
  });

  it("registra cooldown após reenviar código", async () => {
    mocks.resend.mockResolvedValueOnce({ error: null });
    await reenviarCodigoConfirmacao("usuario@exemplo.com");
    expect(obterUltimoReenvioConfirmacao()).toBeGreaterThan(0);
  });
});
