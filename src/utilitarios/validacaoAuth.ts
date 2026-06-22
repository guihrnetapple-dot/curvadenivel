import type { CountryCode } from "libphonenumber-js";
import { getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import { City, Country, State } from "country-state-city";

import type { DadosCadastro, DadosPerfilCadastro } from "../tipos/autenticacao";

export type ErrosCamposAuth = Partial<Record<keyof DadosCadastro | "confirmPassword" | "consentimentos", string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MENSAGEM_WHATSAPP_INVALIDO = "Informe um número de WhatsApp válido para o país selecionado.";

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validarEmail(email: string): string | null {
  const normalizado = normalizarEmail(email);
  if (!normalizado) {
    return "Informe seu e-mail.";
  }
  if (!EMAIL_REGEX.test(normalizado)) {
    return "Informe um e-mail válido.";
  }
  return null;
}

export function validarSenha(password: string): string | null {
  if (!password) {
    return "Informe uma senha.";
  }
  if (password.length < 8) {
    return "Use uma senha com pelo menos 8 caracteres.";
  }
  return null;
}

export function validarConfirmacaoSenha(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return "Confirme sua senha.";
  }
  if (password !== confirmPassword) {
    return "As senhas informadas não conferem.";
  }
  return null;
}

export function obterDdiPais(countryCode: string): string {
  try {
    return getCountryCallingCode(countryCode.toUpperCase() as CountryCode);
  } catch {
    return "55";
  }
}

export function normalizarWhatsApp(valor: string, countryCode = "BR"): string {
  const aparado = valor.trim();
  if (!aparado) {
    return "";
  }

  const codigoPais = countryCode.toUpperCase() as CountryCode;
  const numero = aparado.startsWith("+")
    ? parsePhoneNumberFromString(aparado)
    : parsePhoneNumberFromString(aparado, codigoPais);

  if (numero?.isValid()) {
    return numero.number;
  }

  const somenteDigitos = aparado.replace(/\D/g, "");
  if (!somenteDigitos) {
    return "";
  }

  const comDdi = somenteDigitos.startsWith(obterDdiPais(countryCode))
    ? `+${somenteDigitos}`
    : `+${obterDdiPais(countryCode)}${somenteDigitos}`;
  const reparado = parsePhoneNumberFromString(comDdi);
  return reparado?.isValid() ? reparado.number : comDdi;
}

export function limparWhatsApp(valor: string, countryCode = "BR"): string {
  return normalizarWhatsApp(valor, countryCode);
}

export function validarWhatsApp(valor: string, countryCode = "BR"): string | null {
  const aparado = valor.trim();
  if (!aparado) {
    return "Informe seu WhatsApp.";
  }

  const numero = aparado.startsWith("+")
    ? parsePhoneNumberFromString(aparado)
    : parsePhoneNumberFromString(aparado, countryCode.toUpperCase() as CountryCode);

  if (!numero?.isValid()) {
    return MENSAGEM_WHATSAPP_INVALIDO;
  }

  return null;
}

function validarTextoObrigatorio(valor: string, rotulo: string): string | null {
  if (!valor.trim()) {
    return `Preencha o campo ${rotulo}.`;
  }
  return null;
}

export function validarLocalizacaoPerfil(dados: DadosPerfilCadastro): ErrosCamposAuth {
  const erros: ErrosCamposAuth = {};
  const countryCode = dados.countryCode?.toUpperCase();
  const stateCode = dados.stateCode?.trim();

  if (!dados.country.trim()) {
    erros.country = "Selecione o país.";
    return erros;
  }

  const estados = countryCode ? State.getStatesOfCountry(countryCode) : [];
  if (estados.length > 0 && !dados.state.trim()) {
    erros.state = "Selecione o estado ou província.";
  }

  if (estados.length > 0 && !dados.estadoManual && stateCode && !State.getStateByCodeAndCountry(stateCode, countryCode!)) {
    erros.state = "Selecione um estado ou província válido para o país.";
  }

  if (!dados.city.trim()) {
    erros.city = "Selecione ou informe a cidade.";
  }

  if (countryCode && !Country.getCountryByCode(countryCode)) {
    erros.country = "Selecione um país válido.";
  }

  if (countryCode && dados.city.trim() && !dados.cidadeManual) {
    const cidades = stateCode
      ? City.getCitiesOfState(countryCode, stateCode)
      : City.getCitiesOfCountry(countryCode) ?? [];
    const existeCidade = cidades.some((cidade) => cidade.name.toLocaleLowerCase("pt-BR") === dados.city.trim().toLocaleLowerCase("pt-BR"));
    if (cidades.length > 0 && !existeCidade) {
      erros.city = "Selecione uma cidade válida ou use a opção de entrada manual.";
    }
  }

  return erros;
}

export function validarPerfilCampos(dados: DadosPerfilCadastro): ErrosCamposAuth {
  const erros: ErrosCamposAuth = {};
  const campos: Array<[keyof DadosPerfilCadastro, string]> = [
    ["full_name", "Nome completo"],
    ["profession", "Profissão"],
    ["work_area", "Área de atuação"],
    ["company_name", "Nome da empresa"]
  ];

  for (const [chave, rotulo] of campos) {
    const erro = validarTextoObrigatorio(String(dados[chave] ?? ""), rotulo);
    if (erro) {
      erros[chave] = erro;
    }
  }

  Object.assign(erros, validarLocalizacaoPerfil(dados));

  const erroWhatsApp = validarWhatsApp(dados.whatsapp, dados.whatsappCountryCode || dados.countryCode || "BR");
  if (erroWhatsApp) {
    erros.whatsapp = erroWhatsApp;
  }

  if (!dados.aceitaTermos || !dados.aceitaPrivacidadeLgpd || !dados.aceitaCookies || !dados.aceitaComunicacoes) {
    erros.consentimentos = "Aceite os termos obrigatórios para continuar.";
  }

  return erros;
}

export function validarPerfilObrigatorio(dados: DadosPerfilCadastro): string | null {
  const erros = validarPerfilCampos(dados);
  return Object.values(erros)[0] ?? null;
}

export function validarCadastroCompleto(dados: DadosCadastro, confirmPassword: string): ErrosCamposAuth {
  const erros: ErrosCamposAuth = {};
  const erroEmail = validarEmail(dados.email);
  const erroSenha = validarSenha(dados.password);
  const erroConfirmacao = validarConfirmacaoSenha(dados.password, confirmPassword);

  if (erroEmail) erros.email = erroEmail;
  if (erroSenha) erros.password = erroSenha;
  if (erroConfirmacao) erros.confirmPassword = erroConfirmacao;

  return { ...erros, ...validarPerfilCampos(dados) };
}

function obterCodigoErroAuth(erro: unknown): string {
  if (!erro || typeof erro !== "object") {
    return "";
  }

  const registro = erro as Record<string, unknown>;
  return String(registro.code ?? registro.error_code ?? registro.name ?? "").toLowerCase();
}

export function traduzirErroAuth(erro: unknown): string {
  const codigo = obterCodigoErroAuth(erro);

  if (codigo === "otp_expired") {
    return "O código de confirmação expirou ou já foi usado. Solicite um novo código de confirmação.";
  }

  const mensagensPorCodigo: Record<string, string> = {
    email_exists: "Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.",
    user_already_exists: "Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.",
    email_address_invalid: "Informe um e-mail válido.",
    email_not_confirmed: "Confirme seu e-mail antes de entrar.",
    invalid_credentials: "E-mail ou senha inválidos.",
    weak_password: "A senha precisa atender aos requisitos de segurança.",
    otp_expired: "O link de confirmação expirou ou já foi usado. Solicite um novo link de confirmação.",
    over_email_send_rate_limit: "Aguarde um pouco antes de solicitar outro e-mail.",
    over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.",
    signup_disabled: "O cadastro está temporariamente indisponível."
  };

  if (codigo && mensagensPorCodigo[codigo]) {
    return mensagensPorCodigo[codigo];
  }

  const mensagem = erro instanceof Error ? erro.message.toLowerCase() : "";
  if (mensagem.includes("invalid login") || mensagem.includes("invalid credentials")) {
    return mensagensPorCodigo.invalid_credentials;
  }
  if (mensagem.includes("email not confirmed")) {
    return mensagensPorCodigo.email_not_confirmed;
  }
  if (mensagem.includes("already registered") || mensagem.includes("already been registered")) {
    return mensagensPorCodigo.email_exists;
  }
  if (mensagem.includes("password")) {
    return mensagensPorCodigo.weak_password;
  }
  if (mensagem.includes("rate limit")) {
    return mensagensPorCodigo.over_request_rate_limit;
  }

  return "Não foi possível concluir a autenticação. Tente novamente.";
}
