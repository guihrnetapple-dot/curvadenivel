import { obterSupabase } from "../lib/supabaseClient";
import type { DadosPerfilCadastro, InformacaoCliente, PerfilUsuario } from "../tipos/autenticacao";
import { limparWhatsApp, validarPerfilObrigatorio } from "../utilitarios/validacaoAuth";

function criarPayloadPerfil(
  idUsuario: string,
  dados: DadosPerfilCadastro,
  infoCliente: InformacaoCliente
): Omit<PerfilUsuario, "created_at" | "updated_at"> {
  const agora = new Date().toISOString();

  return {
    id: idUsuario,
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
  };
}

export async function buscarPerfilUsuario(idUsuario: string): Promise<PerfilUsuario | null> {
  const supabase = obterSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", idUsuario)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PerfilUsuario | null;
}

export async function salvarPerfilUsuario(
  idUsuario: string,
  dados: DadosPerfilCadastro,
  infoCliente: InformacaoCliente
): Promise<PerfilUsuario> {
  const erroValidacao = validarPerfilObrigatorio(dados);
  if (erroValidacao) {
    throw new Error(erroValidacao);
  }

  const supabase = obterSupabase();
  const payload = criarPayloadPerfil(idUsuario, dados, infoCliente);
  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PerfilUsuario;
}
