import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn()
}));

vi.mock("../lib/supabaseClient", () => ({
  obterSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession
    }
  })
}));

import { fetchApiProtegida } from "./apiClient";

describe("apiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("envia o JWT Supabase no Authorization", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-atual" } },
      error: null
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await fetchApiProtegida("/api/status");

    const [, opcoes] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(opcoes?.headers).get("Authorization")).toBe("Bearer token-atual");
  });

  it("renova a sessão uma vez quando a API responde 401", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-expirado" } },
      error: null
    });
    mocks.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "token-renovado" } },
      error: null
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await fetchApiProtegida("/api/elevation");

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, segundaRequisicao] = vi.mocked(fetch).mock.calls[1];
    expect(new Headers(segundaRequisicao?.headers).get("Authorization")).toBe("Bearer token-renovado");
  });
});
