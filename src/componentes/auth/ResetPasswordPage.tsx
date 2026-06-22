import { FormEvent, useState } from "react";

import { atualizarSenha } from "../../servicos/authService";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuth";

export function ResetPasswordPage({ aoConcluir }: { aoConcluir: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    if (password.length < 8) {
      setMensagem("Use uma senha com pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmacao) {
      setMensagem("As senhas informadas não conferem.");
      return;
    }

    setCarregando(true);
    try {
      await atualizarSenha(password);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      aoConcluir();
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
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
        Nova senha
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
