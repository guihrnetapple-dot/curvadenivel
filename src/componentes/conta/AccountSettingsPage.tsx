import { FormEvent, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { obterInformacaoCliente } from "../../servicos/clientInfoService";
import { salvarPerfilUsuario } from "../../servicos/profileService";
import { atualizarSenha, salvarDesafioEmailAppPendente } from "../../servicos/authService";
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

export function AccountSettingsPage({ aoVoltar, aoConfirmarEmail }: Props) {
  const { usuario, perfil, emailAtual, emailVerificado, whatsappVerificado, recarregarPerfil } = useAuth();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
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
      await salvarPerfilUsuario(usuario.id, dados, await obterInformacaoCliente(), {
        accepted_terms_at: perfil.accepted_terms_at,
        accepted_privacy_policy_at: perfil.accepted_privacy_policy_at,
        accepted_cookies_at: perfil.accepted_cookies_at,
        accepted_free_use_communication_terms_at: perfil.accepted_free_use_communication_terms_at
      });
      await recarregarPerfil();
      setMensagem("Alterações salvas.");
    } catch {
      setErro("Não foi possível salvar as alterações.");
    } finally {
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

  async function trocarSenha(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setMensagem(null);
    const erroSenha = validarSenha(novaSenha) || validarConfirmacaoSenha(novaSenha, confirmacaoSenha);
    if (erroSenha) {
      setErro(erroSenha);
      return;
    }
    setAlterandoSenha(true);
    try {
      await atualizarSenha(novaSenha);
      setNovaSenha("");
      setConfirmacaoSenha("");
      setMensagem("Senha atualizada.");
    } catch {
      setErro("Não foi possível atualizar a senha.");
    } finally {
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
          <button type="submit" disabled={salvandoPerfil}>{salvandoPerfil ? "Salvando..." : "Salvar alterações"}</button>
        </form>

        <section className="configuracoes-bloco">
          <h2>E-mail</h2>
          <span className={emailVerificado ? "badge-verificado" : "badge-pendente"}>{emailVerificado ? "Confirmado" : "Não confirmado"}</span>
          <p>{emailAtual}</p>
          {emailVerificado && <small>Confirmado em {dataCurta(perfil?.email_verified_at)}</small>}
          {!emailVerificado && <button type="button" onClick={confirmarEmail} disabled={enviandoCodigo}>{enviandoCodigo ? "Enviando..." : "Confirmar e-mail"}</button>}
        </section>

        <section className="configuracoes-bloco">
          <h2>WhatsApp</h2>
          <span className={whatsappVerificado ? "badge-verificado" : "badge-pendente"}>{whatsappVerificado ? "Confirmado" : "Não confirmado"}</span>
          <p>{perfil?.whatsapp ?? "-"}</p>
          {whatsappVerificado && <small>Confirmado em {dataCurta(perfil?.whatsapp_verified_at)}</small>}
          {!whatsappVerificado && <small>A confirmação por WhatsApp depende da configuração do Twilio Verify.</small>}
        </section>

        <form className="configuracoes-bloco" onSubmit={trocarSenha}>
          <h2>Segurança</h2>
          <label>Nova senha<input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" /></label>
          <label>Confirmar nova senha<input type="password" value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)} autoComplete="new-password" /></label>
          <button type="submit" disabled={alterandoSenha}>{alterandoSenha ? "Atualizando..." : "Atualizar senha"}</button>
        </form>
      </section>
    </main>
  );
}
