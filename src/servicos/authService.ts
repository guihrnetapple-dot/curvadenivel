import { obterSupabase } from "../lib/supabaseClient";
import type { DadosCadastro, DadosPerfilCadastro } from "../tipos/autenticacao";
import { limparWhatsApp } from "../utilitarios/validacaoAuth";
import { obterInformacaoCliente } from "./clientInfoService";
import { salvarPerfilUsuario } from "./profileService";

function obterUrlBase(): string {
  return window.location.origin;
}

export async function entrarComEmailSenha(email: string, password: string) {
  const supabase = obterSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) {
    throw error;
  }
}

export async function cadastrarComEmailSenha(dados: DadosCadastro) {
  const supabase = obterSupabase();
  const infoCliente = await obterInformacaoCliente();
  const agora = new Date().toISOString();
  const { data, error } = await supabase.auth.signUp({
    email: dados.email.trim(),
    password: dados.password,
    options: {
      emailRedirectTo: obterUrlBase(),
      data: {
        full_name: dados.full_name.trim(),
        profession: dados.profession.trim(),
        work_area: dados.work_area.trim(),
        company_name: dados.company_name.trim(),
        whatsapp: limparWhatsApp(dados.whatsapp),
        city: dados.city.trim(),
        state: dados.state.trim(),
        country: dados.country.trim(),
        accepted_terms_at: agora,
        accepted_privacy_policy_at: agora,
        accepted_cookies_at: agora,
        accepted_free_use_communication_terms_at: agora,
        communication_consent_email: true,
        communication_consent_whatsapp: true,
        communication_consent_ip: infoCliente.ip,
        communication_consent_user_agent: infoCliente.userAgent
      }
    }
  });

  if (error) {
    throw error;
  }

  if (data.user && data.session) {
    await salvarPerfilUsuario(data.user.id, dados, infoCliente);
  }
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
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
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
