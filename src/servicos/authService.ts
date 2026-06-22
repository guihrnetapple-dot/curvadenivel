import { obterSupabase } from "../lib/supabaseClient";
import type { DadosCadastro, DadosPerfilCadastro, PerfilUsuario, ResultadoCadastro } from "../tipos/autenticacao";
import { normalizarEmail, normalizarWhatsApp } from "../utilitarios/validacaoAuth";
import { obterInformacaoCliente } from "./clientInfoService";
import { salvarPerfilUsuario } from "./profileService";
import { definirLoginPersistente, limparPreferenciaLoginPersistente } from "./persistenciaLogin";

const CHAVE_EMAIL_PENDENTE = "auth.emailConfirmacaoPendente";
const CHAVE_TELA_PENDENTE = "auth.telaPendente";
const CHAVE_ULTIMO_REENVIO = "auth.ultimoReenvioConfirmacao";
const CHAVE_PERFIL_PENDENTE = "auth.perfilConfirmacaoPendente";
const TEMPO_MAXIMO_PERFIL_PENDENTE_MS = 24 * 60 * 60 * 1000;

interface PerfilConfirmacaoPendente {
  email: string;
  criadoEm: number;
  perfil: DadosPerfilCadastro;
}

export function obterUrlBase(): string {
  const configurada = String(import.meta.env.VITE_PUBLIC_SITE_URL ?? "").trim();
  const origem = configurada || window.location.origin;
  return origem.replace(/\/+$/, "");
}

function obterLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function criarPerfilPendente(dados: DadosCadastro): DadosPerfilCadastro {
  const whatsappCountryCode = dados.whatsappCountryCode || dados.countryCode || "BR";
  return {
    full_name: dados.full_name,
    profession: dados.profession,
    work_area: dados.work_area,
    company_name: dados.company_name,
    whatsapp: normalizarWhatsApp(dados.whatsapp, whatsappCountryCode),
    city: dados.city,
    state: dados.state,
    country: dados.country,
    countryCode: dados.countryCode,
    stateCode: dados.stateCode,
    whatsappCountryCode,
    cidadeManual: dados.cidadeManual,
    estadoManual: dados.estadoManual,
    aceitaTermos: dados.aceitaTermos,
    aceitaPrivacidadeLgpd: dados.aceitaPrivacidadeLgpd,
    aceitaCookies: dados.aceitaCookies,
    aceitaComunicacoes: dados.aceitaComunicacoes
  };
}

function salvarPerfilConfirmacaoPendente(email: string, dados: DadosCadastro) {
  const payload: PerfilConfirmacaoPendente = {
    email: normalizarEmail(email),
    criadoEm: Date.now(),
    perfil: criarPerfilPendente(dados)
  };
  obterLocalStorage()?.setItem(CHAVE_PERFIL_PENDENTE, JSON.stringify(payload));
}

export function salvarConfirmacaoPendente(email: string, dados?: DadosCadastro) {
  sessionStorage.setItem(CHAVE_EMAIL_PENDENTE, normalizarEmail(email));
  sessionStorage.setItem(CHAVE_TELA_PENDENTE, "confirmacao-email");
  if (dados) {
    salvarPerfilConfirmacaoPendente(email, dados);
  }
}

export function obterEmailConfirmacaoPendente(): string | null {
  const emailSessao = sessionStorage.getItem(CHAVE_EMAIL_PENDENTE);
  if (emailSessao) return emailSessao;

  return obterPerfilConfirmacaoPendente()?.email ?? null;
}

export function limparConfirmacaoPendente() {
  sessionStorage.removeItem(CHAVE_EMAIL_PENDENTE);
  sessionStorage.removeItem(CHAVE_TELA_PENDENTE);
  sessionStorage.removeItem(CHAVE_ULTIMO_REENVIO);
  obterLocalStorage()?.removeItem(CHAVE_PERFIL_PENDENTE);
}

export function obterUltimoReenvioConfirmacao(): number {
  return Number(sessionStorage.getItem(CHAVE_ULTIMO_REENVIO) ?? 0);
}

function marcarUltimoReenvioConfirmacao() {
  sessionStorage.setItem(CHAVE_ULTIMO_REENVIO, String(Date.now()));
}

export function obterPerfilConfirmacaoPendente(email?: string | null): PerfilConfirmacaoPendente | null {
  const bruto = obterLocalStorage()?.getItem(CHAVE_PERFIL_PENDENTE);
  if (!bruto) return null;

  try {
    const payload = JSON.parse(bruto) as PerfilConfirmacaoPendente;
    const expirado = Date.now() - Number(payload.criadoEm) > TEMPO_MAXIMO_PERFIL_PENDENTE_MS;
    const emailNormalizado = email ? normalizarEmail(email) : null;
    if (expirado || !payload.email || !payload.perfil || (emailNormalizado && payload.email !== emailNormalizado)) {
      obterLocalStorage()?.removeItem(CHAVE_PERFIL_PENDENTE);
      return null;
    }
    return payload;
  } catch {
    obterLocalStorage()?.removeItem(CHAVE_PERFIL_PENDENTE);
    return null;
  }
}

export async function restaurarPerfilConfirmacaoPendente(idUsuario: string, email?: string | null): Promise<PerfilUsuario | null> {
  const pendente = obterPerfilConfirmacaoPendente(email);
  if (!pendente) return null;

  const perfil = await salvarPerfilUsuario(idUsuario, pendente.perfil, await obterInformacaoCliente());
  limparConfirmacaoPendente();
  return perfil;
}

export async function entrarComEmailSenha(email: string, password: string, manterLogin = false) {
  definirLoginPersistente(manterLogin);
  const supabase = obterSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizarEmail(email),
    password
  });

  if (error) {
    throw error;
  }
}

export async function cadastrarComEmailSenha(dados: DadosCadastro): Promise<ResultadoCadastro> {
  const supabase = obterSupabase();
  const email = normalizarEmail(dados.email);
  const whatsappCountryCode = dados.whatsappCountryCode || dados.countryCode || "BR";
  const whatsapp = normalizarWhatsApp(dados.whatsapp, whatsappCountryCode);

  const { data, error } = await supabase.auth.signUp({
    email,
    password: dados.password,
    options: {
      emailRedirectTo: `${obterUrlBase()}/confirmaremail`,
      data: {
        cadastro_inicial: true
      }
    }
  });

  if (error) {
    throw error;
  }

  const identities = data.user?.identities;
  if (data.user && Array.isArray(identities) && identities.length === 0) {
    throw { code: "email_exists" };
  }

  if (data.user && data.session) {
    const dadosPerfil: DadosPerfilCadastro = { ...dados, whatsapp };
    await salvarPerfilUsuario(data.user.id, dadosPerfil, await obterInformacaoCliente());
    return { status: "autenticado" };
  }

  salvarConfirmacaoPendente(email, dados);
  return { status: "confirmacao_necessaria", email };
}

export async function confirmarEmailComCodigo(email: string, token: string) {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizarEmail(email),
    token,
    type: "email"
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function reenviarCodigoConfirmacao(email: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizarEmail(email),
    options: {
      emailRedirectTo: `${obterUrlBase()}/confirmaremail`
    }
  });

  if (error) {
    throw error;
  }

  marcarUltimoReenvioConfirmacao();
}

export async function entrarComGoogle(manterLogin = false) {
  definirLoginPersistente(manterLogin);
  const supabase = obterSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${obterUrlBase()}/home`
    }
  });

  if (error) {
    throw error;
  }
}

export async function enviarRecuperacaoSenha(email: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizarEmail(email), {
    redirectTo: `${obterUrlBase()}/novasenha`
  });

  if (error) {
    throw error;
  }
}

export async function atualizarSenha(password: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }
}

export async function sair() {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  limparPreferenciaLoginPersistente();
}

export async function completarPerfilSocial(idUsuario: string, dados: DadosPerfilCadastro) {
  const infoCliente = await obterInformacaoCliente();
  return salvarPerfilUsuario(idUsuario, dados, infoCliente);
}
