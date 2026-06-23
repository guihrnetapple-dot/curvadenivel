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
  account_email?: string | null;
  email_verified_at?: string | null;
  verified_email?: string | null;
  whatsapp_verified_at?: string | null;
  verified_whatsapp?: string | null;
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
  countryCode?: string;
  stateCode?: string;
  whatsappCountryCode?: string;
  cidadeManual?: boolean;
  estadoManual?: boolean;
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
  countryCode?: string;
}

export type ResultadoCadastro =
  | { status: "autenticado" }
  | {
      status: "verificacao_app";
      email: string;
      challengeId: string | null;
      destinationMasked: string | null;
      envioErro?: string;
    }
  | { status: "confirmacao_necessaria"; email: string };
