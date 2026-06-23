import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  resend: vi.fn(),
  salvarPerfilUsuario: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  invoke: vi.fn()
}));

vi.mock("../lib/supabaseClient", () => ({
  supabaseConfigurado: true,
  obterSupabase: () => ({
    auth: {
      signUp: mocks.signUp,
      resend: mocks.resend,
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut
    },
    functions: {
      invoke: mocks.invoke
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
  restaurarPerfilCadastroInicial,
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
    aceitaComunicacoes: true
  };
}

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const sessionStorageMock = criarStorage();
    const localStorageMock = criarStorage();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173" },
      sessionStorage: sessionStorageMock,
      localStorage: localStorageMock
    });
    mocks.invoke.mockResolvedValue({
      data: {
        challengeId: "11111111-1111-4111-8111-111111111111",
        destinationMasked: "us***@exemplo.com",
        expiresInSeconds: 600,
        resendAvailableInSeconds: 60
      },
      error: null
    });
  });

  it("retorna confirmação necessária quando o cadastro não cria sessão", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    const resultado = await cadastrarComEmailSenha(criarCadastro());
    expect(resultado).toEqual({ status: "confirmacao_necessaria", email: "usuario@exemplo.com" });
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        data: expect.objectContaining({
          cadastro_inicial: true,
          cadastro_perfil_pendente: expect.objectContaining({
            email: "usuario@exemplo.com",
            perfil: expect.objectContaining({
              whatsapp: "+5538999999999",
              city: "Montes Claros"
            })
          })
        })
      })
    }));
    expect(JSON.stringify(mocks.signUp.mock.calls[0][0].options.data)).not.toContain("senha123");
  });

  it("bloqueia fallback nativo quando o modo de verificacao da aplicacao esta ativo", async () => {
    vi.stubEnv("VITE_EMAIL_VERIFICATION_MODE", "app");
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });

    await expect(cadastrarComEmailSenha(criarCadastro())).rejects.toMatchObject({
      code: "native_email_confirmation_enabled"
    });

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("retorna verificação da aplicação quando o cadastro cria sessão", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: { access_token: "token" } },
      error: null
    });
    mocks.salvarPerfilUsuario.mockResolvedValueOnce({});
    const resultado = await cadastrarComEmailSenha(criarCadastro());
    expect(resultado).toEqual({
      status: "verificacao_app",
      email: "usuario@exemplo.com",
      challengeId: "11111111-1111-4111-8111-111111111111",
      destinationMasked: "us***@exemplo.com"
    });
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

  it("restaura perfil preenchido antes da confirmação de e-mail", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
    mocks.salvarPerfilUsuario.mockResolvedValueOnce({ id: "u1", full_name: "Usuário Teste" });

    await cadastrarComEmailSenha(criarCadastro());
    const perfil = await restaurarPerfilConfirmacaoPendente("u1", "usuario@exemplo.com");

    expect(perfil).toEqual({ id: "u1", full_name: "Usuário Teste" });
    expect(mocks.salvarPerfilUsuario).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ full_name: "Usuário Teste", whatsapp: "+5538999999999" }),
      expect.objectContaining({ userAgent: "vitest" })
    );
    expect(localStorage.getItem("auth.perfilConfirmacaoPendente")).toBeNull();
  });

  it("restaura perfil do metadata após confirmação em nova sessão", async () => {
    const cadastro = criarCadastro();
    mocks.salvarPerfilUsuario.mockResolvedValueOnce({ id: "u1", full_name: "Usuário Teste" });

    const perfil = await restaurarPerfilCadastroInicial({
      id: "u1",
      email: "usuario@exemplo.com",
      user_metadata: {
        cadastro_perfil_pendente: {
          email: "usuario@exemplo.com",
          criadoEm: Date.now(),
          perfil: {
            full_name: cadastro.full_name,
            profession: cadastro.profession,
            work_area: cadastro.work_area,
            company_name: cadastro.company_name,
            whatsapp: cadastro.whatsapp,
            city: cadastro.city,
            state: cadastro.state,
            country: cadastro.country,
            countryCode: cadastro.countryCode,
            stateCode: cadastro.stateCode,
            whatsappCountryCode: cadastro.whatsappCountryCode,
            aceitaTermos: cadastro.aceitaTermos,
            aceitaPrivacidadeLgpd: cadastro.aceitaPrivacidadeLgpd,
            aceitaCookies: cadastro.aceitaCookies,
            aceitaComunicacoes: cadastro.aceitaComunicacoes
          }
        }
      }
    } as never);

    expect(perfil).toEqual({ id: "u1", full_name: "Usuário Teste" });
    expect(mocks.salvarPerfilUsuario).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ whatsapp: "+5538999999999", city: "Montes Claros" }),
      expect.objectContaining({ userAgent: "vitest" })
    );
  });

  it("usa preferência persistente somente quando o usuário pede para não solicitar login novamente", async () => {
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
