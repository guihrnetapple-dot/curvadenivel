import { obterSupabase } from "../lib/supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface OpcoesApiProtegida extends RequestInit {
  repetirAposRenovar?: boolean;
}

async function obterAccessToken(): Promise<string> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error("Entre na sua conta para continuar.");
  }

  return token;
}

async function renovarAccessToken(): Promise<string | null> {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }
  return data.session?.access_token ?? null;
}

function montarUrlApi(caminho: string): string {
  const caminhoNormalizado = caminho.startsWith("/") ? caminho : "/" + caminho;
  return API_BASE + caminhoNormalizado;
}

function montarHeaders(headers: HeadersInit | undefined, token: string): Headers {
  const saida = new Headers(headers);
  saida.set("Authorization", "Bearer " + token);
  return saida;
}

export async function fetchApiProtegida(caminho: string, opcoes: OpcoesApiProtegida = {}): Promise<Response> {
  const { repetirAposRenovar = true, ...requestInit } = opcoes;
  const token = await obterAccessToken();
  const resposta = await fetch(montarUrlApi(caminho), {
    ...requestInit,
    headers: montarHeaders(requestInit.headers, token)
  });

  if (resposta.status !== 401 || !repetirAposRenovar) {
    return resposta;
  }

  const tokenRenovado = await renovarAccessToken();
  if (!tokenRenovado) {
    return resposta;
  }

  return fetch(montarUrlApi(caminho), {
    ...requestInit,
    headers: montarHeaders(requestInit.headers, tokenRenovado)
  });
}

function formatarHorarioLocal(dataIso: string): string | null {
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(data);
}

function formatarTempoRestante(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  if (minutos < 60) {
    return minutos === 1 ? "falta 1 minuto" : `faltam ${minutos} minutos`;
  }

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  if (minutosRestantes === 0) {
    return horas === 1 ? "falta 1 hora" : `faltam ${horas} horas`;
  }

  const textoHoras = horas === 1 ? "1 hora" : `${horas} horas`;
  const textoMinutos = minutosRestantes === 1 ? "1 minuto" : `${minutosRestantes} minutos`;
  return `faltam ${textoHoras} e ${textoMinutos}`;
}

function obterDetalhes(corpo: unknown): Record<string, unknown> | null {
  if (!corpo || typeof corpo !== "object" || !("detalhes" in corpo)) return null;
  const detalhes = (corpo as { detalhes?: unknown }).detalhes;
  return detalhes && typeof detalhes === "object" && !Array.isArray(detalhes)
    ? detalhes as Record<string, unknown>
    : null;
}

function montarMensagemLimitePontos(corpo: unknown): string | null {
  const detalhes = obterDetalhes(corpo);
  if (detalhes?.codigo !== "limite_pontos_hora") return null;

  const resetAt = typeof detalhes.resetAt === "string" ? detalhes.resetAt : null;
  const horario = resetAt ? formatarHorarioLocal(resetAt) : null;
  const segundos =
    typeof detalhes.segundosRestantes === "number"
      ? detalhes.segundosRestantes
      : resetAt
        ? Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000))
        : null;
  const restante = typeof segundos === "number" ? formatarTempoRestante(segundos) : null;

  if (horario && restante) {
    return `Limite de pontos por hora atingido. Tente novamente às ${horario}; ${restante}.`;
  }

  if (horario) {
    return `Limite de pontos por hora atingido. Tente novamente às ${horario}.`;
  }

  return "Limite de pontos por hora atingido. Espere cerca de 1 hora e tente novamente.";
}

export async function lerRespostaJson<T>(resposta: Response, mensagemPadrao: string): Promise<T> {
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagemLimite = montarMensagemLimitePontos(corpo);
    const mensagemApi =
      corpo && typeof corpo === "object" && "erro" in corpo
        ? String((corpo as { erro: unknown }).erro)
        : null;
    const mensagem = mensagemLimite ?? mensagemApi ?? mensagemPadrao;
    throw new Error(mensagem);
  }

  return corpo as T;
}
