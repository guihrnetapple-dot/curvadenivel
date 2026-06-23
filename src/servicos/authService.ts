import { obterSupabase } from "../lib/supabaseClient";
import { registrarEventoAuditoria, registrarEventoAuditoriaSemBloquear } from "./auditoriaService";
import type { User } from "@supabase/supabase-js";
import type { DadosCadastro, DadosPerfilCadastro, PerfilUsuario, ResultadoCadastro } from "../tipos/autenticacao";
import { normalizarEmail, normalizarWhatsApp } from "../utilitarios/validacaoAuthBasica";
import { obterInformacaoCliente } from "./clientInfoService";
import { salvarPerfilUsuario } from "./profileService";
import { solicitarCodigoEmailAtual, traduzirErroVerificacao } from "./verificationService";
import {
  definirLoginPersistente,
  limparEmailLembrado,
  limparPreferenciaLoginPersistente,
  salvarEmailLembrado
} from "./persistenciaLogin";

const CHAVE_EMAIL_PENDENTE = "auth.emailConfirmacaoPendente";
const CHAVE_TELA_PENDENTE = "auth.telaPendente";
const CHAVE_ULTIMO_REENVIO = "auth.ultimoReenvioConfirmacao";
const CHAVE_PERFIL_PENDENTE = "auth.perfilConfirmacaoPendente";
const TEMPO_MAXIMO_PERFIL_PENDENTE_MS = 24 * 60 * 60 * 1000;
const CHAVE_DESAFIO_EMAIL_APP = "auth.desafioEmailApp";

interface PerfilConfirmacaoPendente {
  email: string;
  criadoEm: number;
  perfil: DadosPerfilCadastro;
}

interface DesafioEmailAppPendente {
  email: string;
  challengeId: string | null;
  destinationMasked: string | null;
  purpose: "signup_email" | "verify_current_email";
  criadoEm: number;
}

function modoVerificacaoEmail(): "auto" | "app" | "native" {
  const modo = String(import.meta.env.VITE_EMAIL_VERIFICATION_MODE ?? "auto").trim().toLowerCase();
  return modo === "app" || modo === "native" ? modo : "auto";
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

function obterPerfilMetadataUsuario(usuario: Pick<User, "email" | "user_metadata">): PerfilConfirmacaoPendente | null {
  const metadata = usuario.user_metadata?.cadastro_perfil_pendente;
  if (!metadata || typeof metadata !== "object") return null;

  const payload = metadata as PerfilConfirmacaoPendente;
  const email = normalizarEmail(String(payload.email || usuario.email || ""));
  const expirado = Date.now() - Number(payload.criadoEm) > TEMPO_MAXIMO_PERFIL_PENDENTE_MS;
  if (expirado || !email || !payload.perfil) return null;

  return {
    email,
    criadoEm: Number(payload.criadoEm),
    perfil: payload.perfil
  };
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
  sessionStorage.removeItem(CHAVE_DESAFIO_EMAIL_APP);
  obterLocalStorage()?.removeItem(CHAVE_PERFIL_PENDENTE);
}

export function salvarDesafioEmailAppPendente(
  email: string,
  challengeId: string | null,
  destinationMasked: string | null,
  purpose: "signup_email" | "verify_current_email" = "signup_email"
) {
  const payload: DesafioEmailAppPendente = {
    email: normalizarEmail(email),
    challengeId,
    destinationMasked,
    purpose,
    criadoEm: Date.now()
  };
  sessionStorage.setItem(CHAVE_DESAFIO_EMAIL_APP, JSON.stringify(payload));
}

export function obterDesafioEmailAppPendente(): DesafioEmailAppPendente | null {
  const bruto = sessionStorage.getItem(CHAVE_DESAFIO_EMAIL_APP);
  if (!bruto) return null;

  try {
    const payload = JSON.parse(bruto) as DesafioEmailAppPendente;
    if (!payload.email || Date.now() - Number(payload.criadoEm) > TEMPO_MAXIMO_PERFIL_PENDENTE_MS) {
      sessionStorage.removeItem(CHAVE_DESAFIO_EMAIL_APP);
      return null;
    }
    return {
      ...payload,
      purpose: payload.purpose === "verify_current_email" ? "verify_current_email" : "signup_email"
    };
  } catch {
    sessionStorage.removeItem(CHAVE_DESAFIO_EMAIL_APP);
    return null;
  }
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

export async function restaurarPerfilCadastroInicial(usuario: Pick<User, "id" | "email" | "user_metadata">): Promise<PerfilUsuario | null> {
  const pendenteLocal = obterPerfilConfirmacaoPendente(usuario.email);
  const pendenteMetadata = obterPerfilMetadataUsuario(usuario);
  const pendente = pendenteLocal ?? pendenteMetadata;
  if (!pendente) return null;

  const perfil = await salvarPerfilUsuario(usuario.id, pendente.perfil, await obterInformacaoCliente());
  limparConfirmacaoPendente();
  return perfil;
}

export async function entrarComEmailSenha(email: string, password: string, manterLogin = false) {
  definirLoginPersistente(manterLogin);
  const supabase = obterSupabase();
  const emailNormalizado = normalizarEmail(email);
  const { error } = await supabase.auth.signInWithPassword({
    email: emailNormalizado,
    password
  });

  if (error) {
    registrarEventoAuditoriaSemBloquear({
      event_type: "login_falha",
      email: emailNormalizado,
      metadata: { manterLogin }
    });
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "login_sucesso",
    email: emailNormalizado,
    metadata: { manterLogin }
  });
}

export async function reautenticarUsuario(email: string, password: string) {
  const supabase = obterSupabase();
  const emailNormalizado = normalizarEmail(email);
  const { error } = await supabase.auth.signInWithPassword({
    email: emailNormalizado,
    password
  });

  if (error) {
    registrarEventoAuditoriaSemBloquear({
      event_type: "reautenticacao_falha",
      email: emailNormalizado
    });
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "reautenticacao_sucesso",
    email: emailNormalizado
  });
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
      emailRedirectTo: `${obterUrlBase()}/confirmaremail?tipo=cadastro`,
      data: {
        cadastro_inicial: true,
        cadastro_perfil_pendente: {
          email,
          criadoEm: Date.now(),
          perfil: criarPerfilPendente(dados)
        }
      }
    }
  });

  if (error) {
    registrarEventoAuditoriaSemBloquear({
      event_type: "cadastro_falha",
      email,
      metadata: { codigo: error.code }
    });
    throw error;
  }

  const identities = data.user?.identities;
  if (data.user && Array.isArray(identities) && identities.length === 0) {
    throw { code: "email_exists" };
  }

  if (data.user && data.session) {
    const dadosPerfil: DadosPerfilCadastro = { ...dados, whatsapp };
    await salvarPerfilUsuario(data.user.id, dadosPerfil, await obterInformacaoCliente());
    registrarEventoAuditoriaSemBloquear({
      event_type: "cadastro_autenticado",
      email,
      metadata: { metodo: "email" }
    });

    if (modoVerificacaoEmail() !== "native") {
      try {
        const desafio = await solicitarCodigoEmailAtual("signup_email");
        salvarDesafioEmailAppPendente(email, desafio.challengeId, desafio.destinationMasked);
        return {
          status: "verificacao_app",
          email,
          challengeId: desafio.challengeId,
          destinationMasked: desafio.destinationMasked
        };
      } catch (erro) {
        const mensagem = traduzirErroVerificacao(erro);
        salvarDesafioEmailAppPendente(email, null, null);
        return {
          status: "verificacao_app",
          email,
          challengeId: null,
          destinationMasked: null,
          envioErro: mensagem
        };
      }
    }

    return { status: "autenticado" };
  }

  if (modoVerificacaoEmail() === "app") {
    registrarEventoAuditoriaSemBloquear({
      event_type: "cadastro_falha_configuracao_confirmacao",
      email,
      metadata: {
        metodo: "email",
        motivo: "supabase_confirm_email_ativo_sem_sessao"
      }
    });
    throw { code: "native_email_confirmation_enabled" };
  }

  salvarConfirmacaoPendente(email, dados);
  registrarEventoAuditoriaSemBloquear({
    event_type: "cadastro_confirmacao_pendente",
    email,
    metadata: { metodo: "email" }
  });
  return { status: "confirmacao_necessaria", email };
}

export async function confirmarEmailComCodigo(email: string, token: string) {
  const supabase = obterSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizarEmail(email),
    token,
    type: "signup"
  });

  if (error) {
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "confirmacao_email_codigo",
    email: normalizarEmail(email)
  });
  return data;
}

export async function reenviarCodigoConfirmacao(email: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizarEmail(email),
    options: {
      emailRedirectTo: `${obterUrlBase()}/confirmaremail?tipo=cadastro`
    }
  });

  if (error) {
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "reenvio_confirmacao_email",
    email: normalizarEmail(email)
  });
  marcarUltimoReenvioConfirmacao();
}

export async function enviarRecuperacaoSenha(email: string) {
  const supabase = obterSupabase();
  const emailNormalizado = normalizarEmail(email);
  registrarEventoAuditoriaSemBloquear({
    event_type: "recuperacao_senha_solicitada",
    email: emailNormalizado
  });
  const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
    redirectTo: `${obterUrlBase()}/novasenha`
  });

  if (error) {
    registrarEventoAuditoriaSemBloquear({
      event_type: "recuperacao_senha_falha",
      email: emailNormalizado,
      metadata: { codigo: error.code }
    });
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "recuperacao_senha_email_enviado",
    email: emailNormalizado
  });
}

export async function atualizarSenha(password: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }

  registrarEventoAuditoriaSemBloquear({
    event_type: "senha_atualizada"
  });
}

export async function sair() {
  const supabase = obterSupabase();
  await registrarEventoAuditoria({
    event_type: "logout"
  });
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  limparPreferenciaLoginPersistente();
}

export function aplicarPreferenciaDadosLogin(email: string, lembrarDados: boolean) {
  if (lembrarDados) {
    salvarEmailLembrado(email);
    return;
  }

  limparEmailLembrado();
}

export async function completarPerfilSocial(idUsuario: string, dados: DadosPerfilCadastro) {
  const infoCliente = await obterInformacaoCliente();
  return salvarPerfilUsuario(idUsuario, dados, infoCliente);
}
