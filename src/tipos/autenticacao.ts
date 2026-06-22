export interface PerfilUsuario {
  id: string;
  full_name: string;
  profession: string;
  work_area: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  country: string;
  accepted_terms_at: string;
  accepted_privacy_policy_at: string;
  accepted_cookies_at: string;
  accepted_free_use_communication_terms_at: string;
  communication_consent_email: boolean;
  communication_consent_whatsapp: boolean;
  communication_consent_ip: string | null;
  communication_consent_user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface DadosPerfilCadastro {
  full_name: string;
  profession: string;
  work_area: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  country: string;
  aceitaTermos: boolean;
  aceitaPrivacidadeLgpd: boolean;
  aceitaCookies: boolean;
  aceitaComunicacoes: boolean;
}

export interface DadosCadastro extends DadosPerfilCadastro {
  email: string;
  password: string;
}

export interface InformacaoCliente {
  ip: string | null;
  userAgent: string | null;
}
