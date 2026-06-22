import { FormEvent, useState } from "react";

import { cadastrarComEmailSenha } from "../../servicos/authService";
import type { DadosCadastro, DadosPerfilCadastro } from "../../tipos/autenticacao";
import { traduzirErroAuth, validarPerfilObrigatorio } from "../../utilitarios/validacaoAuth";
import { ConsentBox } from "./ConsentBox";
import { ProfileFields } from "./ProfileFields";

const perfilInicial: DadosPerfilCadastro = {
  full_name: "",
  profession: "",
  work_area: "",
  company_name: "",
  whatsapp: "",
  city: "",
  state: "",
  country: "Brasil",
  aceitaTermos: false,
  aceitaPrivacidadeLgpd: false,
  aceitaCookies: false,
  aceitaComunicacoes: false
};

export function RegisterPage({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [perfil, setPerfil] = useState<DadosPerfilCadastro>(perfilInicial);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function alterarPerfil(campo: keyof DadosPerfilCadastro, valor: string | boolean) {
    setPerfil((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    setSucesso(null);

    const erroValidacao = validarPerfilObrigatorio(perfil);
    if (erroValidacao) {
      setMensagem(erroValidacao);
      return;
    }

    if (password.length < 8) {
      setMensagem("Use uma senha com pelo menos 8 caracteres.");
      return;
    }

    setCarregando(true);
    try {
      const dados: DadosCadastro = { ...perfil, email, password };
      await cadastrarComEmailSenha(dados);
      setSucesso("Conta criada. Se o Supabase exigir confirmação, verifique seu e-mail antes de entrar.");
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario auth-formulario-cadastro" onSubmit={enviar}>
      <div className="auth-formulario-topo">
        <strong>Criar conta grátis</strong>
        <span>
          Esta plataforma é gratuita. Como contrapartida pelo uso, você autoriza o recebimento de comunicações
          profissionais, informativas, promocionais e comerciais por e-mail e WhatsApp.
        </span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}
      {sucesso && <div className="auth-feedback sucesso">{sucesso}</div>}

      <div className="auth-grade-campos">
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
      </div>

      <ProfileFields valores={perfil} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />
      <ConsentBox valores={perfil} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />

      <button type="submit" disabled={carregando}>
        {carregando ? "Criando conta..." : "Criar conta grátis"}
      </button>
      <button className="auth-botao-secundario" type="button" onClick={aoEntrar} disabled={carregando}>
        Já tenho conta
      </button>
    </form>
  );
}
