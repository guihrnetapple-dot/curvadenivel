import { obterSupabase } from "../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import type { DadosPerfilCadastro, InformacaoCliente, PerfilUsuario } from "../tipos/autenticacao";
import { normalizarWhatsApp, validarPerfilObrigatorio } from "../utilitarios/validacaoAuth";

type DatasConsentimento = Partial<
  Pick<
    PerfilUsuario,
    | "accepted_terms_at"
    | "accepted_privacy_policy_at"
    | "accepted_cookies_at"
    | "accepted_free_use_communication_terms_at"
  >
>;

function criarPayloadPerfil(
  dados: DadosPerfilCadastro,
  infoCliente: InformacaoCliente,
  datas: DatasConsentimento = {}
) {
  const whatsappCountryCode = dados.whatsappCountryCode || dados.countryCode || "BR";

  return {
    full_name: dados.full_name.trim(),
    profession: dados.profession.trim(),
    work_area: dados.work_area.trim(),
    company_name: dados.company_name.trim(),
    whatsapp: normalizarWhatsApp(dados.whatsapp, whatsappCountryCode),
    city: dados.city.trim(),
    state: dados.state.trim(),
    country: dados.country.trim(),
    accepted_terms_at: datas.accepted_terms_at,
    accepted_privacy_policy_at: datas.accepted_privacy_policy_at,
    accepted_cookies_at: datas.accepted_cookies_at,
    accepted_free_use_communication_terms_at: datas.accepted_free_use_communication_terms_at,
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
  infoCliente: InformacaoCliente,
  datas?: DatasConsentimento
): Promise<PerfilUsuario> {
  const erroValidacao = validarPerfilObrigatorio(dados);
  if (erroValidacao) {
    throw new Error(erroValidacao);
  }

  const supabase = obterSupabase();
  const payload = criarPayloadPerfil(dados, infoCliente, datas);
  const { data, error } = await supabase.functions.invoke("complete-profile", {
    body: payload
  });

  if (error) {
    throw error;
  }

  const perfil = (data as { perfil?: PerfilUsuario } | null)?.perfil;
  if (!perfil || perfil.id !== idUsuario) {
    throw new Error("Não foi possível salvar o perfil do usuário.");
  }

  return perfil;
}

export async function garantirPerfilUsuario(usuario: User): Promise<PerfilUsuario | null> {
  const existente = await buscarPerfilUsuario(usuario.id);
  if (existente) {
    return existente;
  }

  return null;
}
