import { obterSupabase } from "../lib/supabaseClient";
import type { DadosCadastro, DadosPerfilCadastro, ResultadoCadastro } from "../tipos/autenticacao";
import { normalizarEmail, normalizarWhatsApp } from "../utilitarios/validacaoAuth";
import { obterInformacaoCliente } from "./clientInfoService";
import { salvarPerfilUsuario } from "./profileService";

const CHAVE_EMAIL_PENDENTE = "auth.emailConfirmacaoPendente";
const CHAVE_TELA_PENDENTE = "auth.telaPendente";
const CHAVE_ULTIMO_REENVIO = "auth.ultimoReenvioConfirmacao";

export function obterUrlBase(): string {
  const configurada = String(import.meta.env.VITE_PUBLIC_SITE_URL ?? "").trim();
  const origem = configurada || window.location.origin;
  return origem.replace(/\/+$/, "");
}

export function salvarConfirmacaoPendente(email: string) {
  sessionStorage.setItem(CHAVE_EMAIL_PENDENTE, normalizarEmail(email));
  sessionStorage.setItem(CHAVE_TELA_PENDENTE, "confirmacao-email");
}

export function obterEmailConfirmacaoPendente(): string | null {
  return sessionStorage.getItem(CHAVE_EMAIL_PENDENTE);
}

export function limparConfirmacaoPendente() {
  sessionStorage.removeItem(CHAVE_EMAIL_PENDENTE);
  sessionStorage.removeItem(CHAVE_TELA_PENDENTE);
  sessionStorage.removeItem(CHAVE_ULTIMO_REENVIO);
}

export function obterUltimoReenvioConfirmacao(): number {
  return Number(sessionStorage.getItem(CHAVE_ULTIMO_REENVIO) ?? 0);
}

function marcarUltimoReenvioConfirmacao() {
  sessionStorage.setItem(CHAVE_ULTIMO_REENVIO, String(Date.now()));
}

export async function entrarComEmailSenha(email: string, password: string) {
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
      emailRedirectTo: obterUrlBase(),
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

  salvarConfirmacaoPendente(email);
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
      emailRedirectTo: obterUrlBase()
    }
  });

  if (error) {
    throw error;
  }

  marcarUltimoReenvioConfirmacao();
}

export async function entrarComGoogle() {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: obterUrlBase()
    }
  });

  if (error) {
    throw error;
  }
}

export async function enviarRecuperacaoSenha(email: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizarEmail(email), {
    redirectTo: `${obterUrlBase()}#recuperar-senha`
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
}

export async function completarPerfilSocial(idUsuario: string, dados: DadosPerfilCadastro) {
  const infoCliente = await obterInformacaoCliente();
  return salvarPerfilUsuario(idUsuario, dados, infoCliente);
}
