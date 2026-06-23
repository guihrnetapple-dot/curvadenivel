import { FormEvent, useState } from "react";

import { aplicarPreferenciaDadosLogin, entrarComEmailSenha, entrarComGoogle } from "../../servicos/authService";
import { obterEmailLembrado } from "../../servicos/persistenciaLogin";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuth";

interface Props {
  aoCriarConta: () => void;
  aoRecuperarSenha: () => void;
  aviso?: string | null;
}

function GoogleIcon() {
  return (
    <svg className="auth-google-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="google-branco" d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.43Z" />
      <path className="google-branco" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path className="google-branco" d="M6.4 13.9a6.01 6.01 0 0 1 0-3.8V7.51H3.06a10.01 10.01 0 0 0 0 8.98L6.4 13.9Z" />
      <path className="google-branco" d="M12 5.98c1.47 0 2.8.51 3.84 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a9.99 9.99 0 0 0-8.94 5.51L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98Z" />
      <path className="google-cor google-azul" d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.43Z" />
      <path className="google-cor google-verde" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path className="google-cor google-amarelo" d="M6.4 13.9a6.01 6.01 0 0 1 0-3.8V7.51H3.06a10.01 10.01 0 0 0 0 8.98L6.4 13.9Z" />
      <path className="google-cor google-vermelho" d="M12 5.98c1.47 0 2.8.51 3.84 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a9.99 9.99 0 0 0-8.94 5.51L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  );
}

export function LoginPage({ aoCriarConta, aoRecuperarSenha, aviso }: Props) {
  const emailLembrado = obterEmailLembrado();
  const [email, setEmail] = useState(emailLembrado);
  const [password, setPassword] = useState("");
  const [lembrarDados, setLembrarDados] = useState(Boolean(emailLembrado));
  const [manterLogin, setManterLogin] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setCarregando(true);
    setMensagem(null);
    try {
      aplicarPreferenciaDadosLogin(email, lembrarDados || manterLogin);
      await entrarComEmailSenha(email, password, manterLogin);
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro));
    } finally {
      setCarregando(false);
    }
  }

  async function entrarGoogle() {
    setCarregando(true);
    setMensagem(null);
    try {
      await entrarComGoogle(manterLogin);
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro));
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario auth-formulario-login" onSubmit={enviar}>
      <button className="auth-botao-google" type="button" onClick={entrarGoogle} disabled={carregando}>
        <GoogleIcon />
        Entrar com Google
      </button>

      <div className="auth-divisor">
        <span>ou continue com e-mail</span>
      </div>

      <div className="auth-formulario-topo">
        <strong>Entrar</strong>
        <span>Acesse sua área de topografia, irrigação e engenharia.</span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}
      {aviso && <div className="auth-feedback sucesso">{aviso}</div>}

      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <label className="auth-lembrar-login">
        <input
          type="checkbox"
          checked={lembrarDados}
          onChange={(evento) => setLembrarDados(evento.target.checked)}
        />
        <span>Lembrar meu e-mail nesta máquina.</span>
      </label>
      <label className="auth-lembrar-login">
        <input
          type="checkbox"
          checked={manterLogin}
          onChange={(evento) => {
            setManterLogin(evento.target.checked);
            if (evento.target.checked) {
              setLembrarDados(true);
            }
          }}
        />
        <span>Não pedir login nesta máquina novamente.</span>
      </label>

      <button type="submit" disabled={carregando}>
        {carregando ? "Entrando..." : "Entrar"}
      </button>

      <div className="auth-links">
        <button type="button" onClick={aoRecuperarSenha}>
          Esqueci minha senha
        </button>
        <button type="button" onClick={aoCriarConta}>
          Criar conta grátis
        </button>
      </div>
    </form>
  );
}
