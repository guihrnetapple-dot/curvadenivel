import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  invoke: vi.fn()
}));

vi.mock("../lib/supabaseClient", () => ({
  obterSupabase: () => ({
    functions: {
      invoke: mocks.invoke
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle
        })
      })
    })
  })
}));

import { garantirPerfilUsuario, salvarPerfilUsuario } from "./profileService";

function criarPerfil() {
  return {
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

describe("profileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("salva perfil pela Edge Function autenticada", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: { perfil: { id: "u1", full_name: "Usuário Teste" } },
      error: null
    });

    const perfil = await salvarPerfilUsuario("u1", criarPerfil(), {
      ip: "127.0.0.1",
      userAgent: "vitest",
      countryCode: "BR"
    });

    expect(perfil?.id).toBe("u1");
    expect(mocks.invoke).toHaveBeenCalledWith("complete-profile", {
      body: expect.objectContaining({
        full_name: "Usuário Teste",
        whatsapp: "+5538999999999",
        communication_consent_email: true,
        communication_consent_whatsapp: true
      })
    });
  });

  it("não restaura perfil por user_metadata quando o perfil ainda não existe", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const perfil = await garantirPerfilUsuario({
      id: "u1",
      user_metadata: {
        full_name: "Usuário Teste",
        profession: "Engenheiro"
      }
    } as never);

    expect(perfil).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
