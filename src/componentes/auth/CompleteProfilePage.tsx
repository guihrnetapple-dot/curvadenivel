import { FormEvent, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { completarPerfilSocial } from "../../servicos/authService";
import type { DadosPerfilCadastro } from "../../tipos/autenticacao";
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

export function CompleteProfilePage() {
  const { usuario, recarregarPerfil } = useAuth();
  const [perfil, setPerfil] = useState<DadosPerfilCadastro>({
    ...perfilInicial,
    full_name: usuario?.user_metadata?.full_name || usuario?.user_metadata?.name || ""
  });
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function alterarPerfil(campo: keyof DadosPerfilCadastro, valor: string | boolean) {
    setPerfil((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    if (!usuario) {
      setMensagem("Sessão não encontrada. Entre novamente.");
      return;
    }

    const erroValidacao = validarPerfilObrigatorio(perfil);
    if (erroValidacao) {
      setMensagem(erroValidacao);
      return;
    }

    setCarregando(true);
    try {
      await completarPerfilSocial(usuario.id, perfil);
      await recarregarPerfil();
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro instanceof Error ? erro.message : ""));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario auth-formulario-cadastro" onSubmit={enviar}>
      <div className="auth-formulario-topo">
        <strong>Complete seu perfil</strong>
        <span>Esses dados são obrigatórios para liberar o uso profissional da plataforma.</span>
      </div>

      {mensagem && <div className="auth-feedback erro">{mensagem}</div>}

      <ProfileFields valores={perfil} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />
      <ConsentBox valores={perfil} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />

      <button type="submit" disabled={carregando}>
        {carregando ? "Salvando..." : "Liberar acesso"}
      </button>
    </form>
  );
}
