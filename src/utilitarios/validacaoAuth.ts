import type { DadosPerfilCadastro } from "../tipos/autenticacao";

export function limparWhatsApp(valor: string): string {
  const somenteNumeros = valor.replace(/\D/g, "");

  if (somenteNumeros.length === 11) {
    return `55${somenteNumeros}`;
  }

  return somenteNumeros;
}

export function validarWhatsApp(valor: string): string | null {
  const limpo = limparWhatsApp(valor);
  if (!/^[0-9]{10,15}$/.test(limpo)) {
    return "Informe um WhatsApp válido com DDI, DDD e número.";
  }

  return null;
}

export function validarPerfilObrigatorio(dados: DadosPerfilCadastro): string | null {
  const campos: Array<[keyof DadosPerfilCadastro, string]> = [
    ["full_name", "Nome completo"],
    ["profession", "Profissão"],
    ["work_area", "Área de atuação"],
    ["company_name", "Nome da empresa"],
    ["whatsapp", "WhatsApp"],
    ["city", "Cidade"],
    ["state", "Estado"],
    ["country", "País"]
  ];

  for (const [chave, rotulo] of campos) {
    if (typeof dados[chave] === "string" && !String(dados[chave]).trim()) {
      return `Preencha o campo ${rotulo}.`;
    }
  }

  const erroWhatsApp = validarWhatsApp(dados.whatsapp);
  if (erroWhatsApp) {
    return erroWhatsApp;
  }

  if (!dados.aceitaTermos || !dados.aceitaPrivacidadeLgpd || !dados.aceitaCookies) {
    return "É necessário aceitar os Termos de Uso, a Política de Privacidade/LGPD e o uso de cookies essenciais.";
  }

  if (!dados.aceitaComunicacoes) {
    return "Para usar gratuitamente a plataforma, é necessário aceitar os termos de comunicação por e-mail e WhatsApp.";
  }

  return null;
}

export function traduzirErroAuth(mensagem: string): string {
  const texto = mensagem.toLowerCase();
  if (texto.includes("invalid login") || texto.includes("invalid credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (texto.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (texto.includes("already registered") || texto.includes("already been registered")) {
    return "Este e-mail já está cadastrado.";
  }
  if (texto.includes("password")) {
    return "Verifique a senha informada. Ela precisa atender aos requisitos de segurança.";
  }
  if (texto.includes("rate limit")) {
    return "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.";
  }
  return "Não foi possível concluir a autenticação. Tente novamente.";
}
