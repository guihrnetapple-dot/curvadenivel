import { FormEvent, useState } from "react";

import { entrarComEmailSenha, entrarComGoogle } from "../../servicos/authService";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuth";

interface Props {
  aoCriarConta: () => void;
  aoRecuperarSenha: () => void;
}

export function LoginPage({ aoCriarConta, aoRecuperarSenha }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setCarregando(true);
    setMensagem(null);
    try {
      await entrarComEmailSenha(email, password);
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
    } finally {
      setCarregando(false);
    }
  }

  async function entrarGoogle() {
    setCarregando(true);
    setMensagem(null);
    try {
      await entrarComGoogle();
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario" onSubmit={enviar}>
      <div className="auth-formulario-topo">
        <strong>Entrar</strong>
        <span>Acesse sua área de topografia, irrigação e engenharia.</span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}

      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>

      <button type="submit" disabled={carregando}>
        {carregando ? "Entrando..." : "Entrar"}
      </button>
      <button className="auth-botao-google" type="button" onClick={entrarGoogle} disabled={carregando}>
        Entrar com Google
      </button>

      <div className="auth-links">
        <button type="button" onClick={aoRecuperarSenha}>Esqueci minha senha</button>
        <button type="button" onClick={aoCriarConta}>Criar conta grátis</button>
      </div>
    </form>
  );
}
