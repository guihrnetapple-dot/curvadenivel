import { FormEvent, useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { WhatsAppField } from "../auth/WhatsAppField";
import { InfoTooltip } from "../ui/InfoTooltip";
import { useAuth } from "../../context/AuthContext";
import { obterInformacaoCliente } from "../../servicos/clientInfoService";
import { salvarPerfilUsuario } from "../../servicos/profileService";
import { atualizarSenha, reautenticarUsuario, salvarDesafioEmailAppPendente } from "../../servicos/authService";
import { solicitarCodigoEmailAtual, traduzirErroVerificacao } from "../../servicos/verificationService";
import type { DadosPerfilCadastro } from "../../tipos/autenticacao";
import { validarConfirmacaoSenha, validarPerfilObrigatorio, validarSenha } from "../../utilitarios/validacaoAuth";

interface Props {
  aoVoltar: () => void;
  aoConfirmarEmail: () => void;
}

function dataCurta(valor?: string | null): string {
  if (!valor) return "";
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function normalizarWhatsAppConta(valor?: string | null): string {
  const aparado = valor?.trim() ?? "";
  if (!aparado) return "";
  return aparado.startsWith("+") ? aparado : `+${aparado.replace(/\D/g, "")}`;
}

function obterPaisWhatsAppConta(valor?: string | null): string {
  const numero = parsePhoneNumberFromString(normalizarWhatsAppConta(valor));
  return numero?.country ?? "BR";
}

export function AccountSettingsPage({ aoVoltar, aoConfirmarEmail }: Props) {
  const { usuario, perfil, emailAtual, emailVerificado, whatsappVerificado, recarregarPerfil } = useAuth();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [salvandoWhatsApp, setSalvandoWhatsApp] = useState(false);
  const [senhaAtualPerfil, setSenhaAtualPerfil] = useState("");
  const [senhaAtualSeguranca, setSenhaAtualSeguranca] = useState("");
  const [senhaAtualWhatsApp, setSenhaAtualWhatsApp] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [whatsappEditado, setWhatsAppEditado] = useState(() => ({
    valor: normalizarWhatsAppConta(perfil?.whatsapp),
    countryCode: obterPaisWhatsAppConta(perfil?.whatsapp)
  }));
  const [perfilEditado, setPerfilEditado] = useState(() => ({
    full_name: perfil?.full_name ?? "",
    profession: perfil?.profession ?? "",
    work_area: perfil?.work_area ?? "",
    company_name: perfil?.company_name ?? ""
  }));

  async function salvarPerfil(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario || !perfil) return;
    setErro(null);
    setMensagem(null);
    const emailReautenticacao = emailAtual || usuario.email || "";
    if (!emailReautenticacao) {
      setErro("Não foi possível confirmar sua conta para salvar as alterações.");
      return;
    }
    if (!senhaAtualPerfil) {
      setErro("Informe sua senha atual para salvar as alterações.");
      return;
    }

    const dados: DadosPerfilCadastro = {
      ...perfil,
      ...perfilEditado,
      aceitaTermos: true,
      aceitaPrivacidadeLgpd: true,
      aceitaCookies: true,
      aceitaComunicacoes: true
    };
    const erroPerfil = validarPerfilObrigatorio(dados);
    if (erroPerfil) {
      setErro(erroPerfil);
      return;
    }

    setSalvandoPerfil(true);
    try {
      await reautenticarUsuario(emailReautenticacao, senhaAtualPerfil);
      await salvarPerfilUsuario(usuario.id, dados, await obterInformacaoCliente(), {
        accepted_terms_at: perfil.accepted_terms_at,
        accepted_privacy_policy_at: perfil.accepted_privacy_policy_at,
        accepted_cookies_at: perfil.accepted_cookies_at,
        accepted_free_use_communication_terms_at: perfil.accepted_free_use_communication_terms_at
      });
      await recarregarPerfil();
      setMensagem("Alterações salvas.");
    } catch {
      setErro("Não foi possível salvar as alterações. Confira sua senha atual e tente novamente.");
    } finally {
      setSenhaAtualPerfil("");
      setSalvandoPerfil(false);
    }
  }

  async function confirmarEmail() {
    setErro(null);
    setMensagem(null);
    setEnviandoCodigo(true);
    try {
      const desafio = await solicitarCodigoEmailAtual("verify_current_email");
      if (emailAtual) {
        salvarDesafioEmailAppPendente(emailAtual, desafio.challengeId, desafio.destinationMasked, "verify_current_email");
      }
      aoConfirmarEmail();
    } catch (erroVerificacao) {
      setErro(traduzirErroVerificacao(erroVerificacao));
    } finally {
      setEnviandoCodigo(false);
    }
  }

  async function salvarWhatsApp(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario || !perfil) return;
    setErro(null);
    setMensagem(null);
    const emailReautenticacao = emailAtual || usuario.email || "";
    if (!emailReautenticacao) {
      setErro("Não foi possível confirmar sua conta para alterar o WhatsApp.");
      return;
    }
    if (!senhaAtualWhatsApp) {
      setErro("Informe sua senha atual para alterar o WhatsApp.");
      return;
    }

    const dados: DadosPerfilCadastro = {
      ...perfil,
      whatsapp: whatsappEditado.valor,
      whatsappCountryCode: whatsappEditado.countryCode,
      aceitaTermos: true,
      aceitaPrivacidadeLgpd: true,
      aceitaCookies: true,
      aceitaComunicacoes: true
    };
    const erroPerfil = validarPerfilObrigatorio(dados);
    if (erroPerfil) {
      setErro(erroPerfil);
      return;
    }

    setSalvandoWhatsApp(true);
    try {
      await reautenticarUsuario(emailReautenticacao, senhaAtualWhatsApp);
      await salvarPerfilUsuario(usuario.id, dados, await obterInformacaoCliente(), {
        accepted_terms_at: perfil.accepted_terms_at,
        accepted_privacy_policy_at: perfil.accepted_privacy_policy_at,
        accepted_cookies_at: perfil.accepted_cookies_at,
        accepted_free_use_communication_terms_at: perfil.accepted_free_use_communication_terms_at
      });
      await recarregarPerfil();
      setMensagem("WhatsApp atualizado.");
    } catch {
      setErro("Não foi possível atualizar o WhatsApp. Confira sua senha atual e tente novamente.");
    } finally {
      setSenhaAtualWhatsApp("");
      setSalvandoWhatsApp(false);
    }
  }

  async function trocarSenha(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario) return;
    setErro(null);
    setMensagem(null);
    const emailReautenticacao = emailAtual || usuario.email || "";
    if (!emailReautenticacao) {
      setErro("Não foi possível confirmar sua conta para atualizar a senha.");
      return;
    }
    if (!senhaAtualSeguranca) {
      setErro("Informe sua senha atual para criar uma nova senha.");
      return;
    }
    const erroSenha = validarSenha(novaSenha) || validarConfirmacaoSenha(novaSenha, confirmacaoSenha);
    if (erroSenha) {
      setErro(erroSenha);
      return;
    }
    setAlterandoSenha(true);
    try {
      await reautenticarUsuario(emailReautenticacao, senhaAtualSeguranca);
      await atualizarSenha(novaSenha);
      setNovaSenha("");
      setConfirmacaoSenha("");
      setMensagem("Senha atualizada.");
    } catch {
      setErro("Não foi possível atualizar a senha. Confira sua senha atual e tente novamente.");
    } finally {
      setSenhaAtualSeguranca("");
      setAlterandoSenha(false);
    }
  }

  return (
    <main className="pagina-configuracoes-conta">
      <section className="configuracoes-cabecalho">
        <div>
          <h1>Configurações da conta</h1>
          <p>Gerencie seus dados pessoais e confirmações de contato.</p>
        </div>
        <button type="button" className="botao-secundario" onClick={aoVoltar}>Voltar</button>
      </section>

      {erro && <div className="auth-feedback erro" role="alert">{erro}</div>}
      {mensagem && <div className="auth-feedback sucesso" role="status">{mensagem}</div>}

      <section className="configuracoes-grade">
        <form className="configuracoes-bloco" onSubmit={salvarPerfil}>
          <h2>Perfil</h2>
          <label>Nome completo<input value={perfilEditado.full_name} onChange={(e) => setPerfilEditado((a) => ({ ...a, full_name: e.target.value }))} /></label>
          <label>Profissão<input value={perfilEditado.profession} onChange={(e) => setPerfilEditado((a) => ({ ...a, profession: e.target.value }))} /></label>
          <label>Área de atuação<input value={perfilEditado.work_area} onChange={(e) => setPerfilEditado((a) => ({ ...a, work_area: e.target.value }))} /></label>
          <label>Empresa<input value={perfilEditado.company_name} onChange={(e) => setPerfilEditado((a) => ({ ...a, company_name: e.target.value }))} /></label>
          <label>Senha atual<input type="password" value={senhaAtualPerfil} onChange={(e) => setSenhaAtualPerfil(e.target.value)} autoComplete="current-password" required /></label>
          <button type="submit" disabled={salvandoPerfil}>{salvandoPerfil ? "Salvando..." : "Salvar alterações"}</button>
        </form>

        <section className="configuracoes-bloco">
          <h2>E-mail</h2>
          <span className={emailVerificado ? "badge-verificado" : "badge-pendente"}>{emailVerificado ? "Confirmado" : "Não confirmado"}</span>
          <p>{emailAtual}</p>
          {emailVerificado && <small>Confirmado em {dataCurta(perfil?.email_verified_at)}</small>}
          {!emailVerificado && <button type="button" onClick={confirmarEmail} disabled={enviandoCodigo}>{enviandoCodigo ? "Enviando..." : "Confirmar e-mail"}</button>}
        </section>

        <form className="configuracoes-bloco" onSubmit={salvarWhatsApp}>
          <h2>WhatsApp</h2>
          <span className={whatsappVerificado ? "badge-verificado" : "badge-pendente"}>{whatsappVerificado ? "Confirmado" : "Não confirmado"}</span>
          <WhatsAppField
            valor={whatsappEditado.valor}
            countryCode={whatsappEditado.countryCode}
            aoAlterar={(valorE164) => setWhatsAppEditado((atual) => ({ ...atual, valor: valorE164 }))}
            aoAlterarPais={(countryCode) => setWhatsAppEditado((atual) => ({ ...atual, countryCode }))}
          />
          <label>Senha atual<input type="password" value={senhaAtualWhatsApp} onChange={(e) => setSenhaAtualWhatsApp(e.target.value)} autoComplete="current-password" required /></label>
          {whatsappVerificado && <small>Confirmado em {dataCurta(perfil?.whatsapp_verified_at)}</small>}
          {!whatsappVerificado && (
            <div className="linha-ajuda-formulario">
              <span>Confirmação pendente</span>
              <InfoTooltip texto="A confirmação do WhatsApp será incluída depois." />
            </div>
          )}
          <button type="submit" disabled={salvandoWhatsApp}>{salvandoWhatsApp ? "Salvando..." : "Salvar WhatsApp"}</button>
        </form>

        <form className="configuracoes-bloco" onSubmit={trocarSenha}>
          <h2>Segurança</h2>
          <label>Senha atual<input type="password" value={senhaAtualSeguranca} onChange={(e) => setSenhaAtualSeguranca(e.target.value)} autoComplete="current-password" required /></label>
          <label>
            <span className="rotulo-campo-formulario">
              <span>Nova senha</span>
              <InfoTooltip texto="Use uma senha com pelo menos oito caracteres." />
            </span>
            <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" />
          </label>
          <label>Confirmar nova senha<input type="password" value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)} autoComplete="new-password" /></label>
          <button type="submit" disabled={alterandoSenha}>{alterandoSenha ? "Atualizando..." : "Atualizar senha"}</button>
        </form>
      </section>

      <footer className="configuracoes-rodape">
        <strong>GeoCampo</strong>
        <span>Topografia, irrigação e engenharia.</span>
        <small>© {new Date().getFullYear()} GeoCampo. Todos os direitos reservados.</small>
      </footer>
    </main>
  );
}
