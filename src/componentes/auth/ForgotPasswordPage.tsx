import { FormEvent, useState } from "react";

import { enviarRecuperacaoSenha } from "../../servicos/authService";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuth";

export function ForgotPasswordPage({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    setSucesso(null);
    setCarregando(true);

    try {
      await enviarRecuperacaoSenha(email);
      setSucesso("Enviamos o link de recuperação para o e-mail informado.");
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario" onSubmit={enviar}>
      <div className="auth-formulario-topo">
        <strong>Recuperar senha</strong>
        <span>Informe seu e-mail para receber um link seguro de redefinição.</span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}
      {sucesso && <div className="auth-feedback sucesso">{sucesso}</div>}

      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>

      <button type="submit" disabled={carregando}>
        {carregando ? "Enviando..." : "Enviar link"}
      </button>
      <button className="auth-botao-secundario" type="button" onClick={aoEntrar} disabled={carregando}>
        Voltar para login
      </button>
    </form>
  );
}
