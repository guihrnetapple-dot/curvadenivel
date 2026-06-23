import { FormEvent, useState } from "react";

import { aplicarPreferenciaDadosLogin, entrarComEmailSenha } from "../../servicos/authService";
import { obterEmailLembrado } from "../../servicos/persistenciaLogin";
import { traduzirErroAuth } from "../../utilitarios/validacaoAuthBasica";

interface Props {
  aoCriarConta: () => void;
  aoRecuperarSenha: () => void;
  aviso?: string | null;
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

  return (
    <form className="auth-formulario auth-formulario-login" onSubmit={enviar}>
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
