import { FormEvent, useState } from "react";

import { atualizarSenha } from "../../servicos/authService";
import { traduzirErroAuth, validarConfirmacaoSenha, validarSenha } from "../../utilitarios/validacaoAuth";
import { InfoTooltip } from "../ui/InfoTooltip";

export function ResetPasswordPage({ aoConcluir }: { aoConcluir: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    const erroSenha = validarSenha(password);
    if (erroSenha) {
      setMensagem(erroSenha);
      return;
    }

    const erroConfirmacao = validarConfirmacaoSenha(password, confirmacao);
    if (erroConfirmacao) {
      setMensagem(erroConfirmacao);
      return;
    }

    setCarregando(true);
    try {
      await atualizarSenha(password);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      aoConcluir();
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario" onSubmit={enviar}>
      <div className="auth-formulario-topo">
        <strong>Nova senha</strong>
        <span>Crie uma senha segura para continuar usando a plataforma.</span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}

      <label>
        <span className="rotulo-campo-formulario">
          <span>Nova senha</span>
          <InfoTooltip texto="Use uma senha com pelo menos oito caracteres." />
        </span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      </label>
      <label>
        Confirmar senha
        <input
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          minLength={8}
          required
        />
      </label>

      <button type="submit" disabled={carregando}>
        {carregando ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
