import { FormEvent, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { completarPerfilSocial } from "../../servicos/authService";
import type { DadosPerfilCadastro } from "../../tipos/autenticacao";
import { obterNomePais } from "../../utilitarios/localizacaoAuth";
import { traduzirErroAuth, validarPerfilCampos, type ErrosCamposAuth } from "../../utilitarios/validacaoAuth";
import { ConsentBox } from "./ConsentBox";
import { LocationFields } from "./LocationFields";
import { ProfileFields } from "./ProfileFields";
import { WhatsAppField } from "./WhatsAppField";

const codigoPaisPadrao = "BR";

function criarPerfilInicial(nome = ""): DadosPerfilCadastro {
  return {
    full_name: nome,
    profession: "",
    work_area: "",
    company_name: "",
    whatsapp: "",
    city: "",
    state: "",
    country: obterNomePais(codigoPaisPadrao),
    countryCode: codigoPaisPadrao,
    stateCode: "",
    whatsappCountryCode: codigoPaisPadrao,
    cidadeManual: false,
    estadoManual: false,
    aceitaTermos: false,
    aceitaPrivacidadeLgpd: false,
    aceitaCookies: false,
    aceitaComunicacoes: false
  };
}

function aplicarAceiteGeral(perfil: DadosPerfilCadastro): DadosPerfilCadastro {
  return {
    ...perfil,
    aceitaTermos: true,
    aceitaPrivacidadeLgpd: true,
    aceitaCookies: true,
    aceitaComunicacoes: true
  };
}

export function CompleteProfilePage() {
  const { usuario, recarregarPerfil } = useAuth();
  const [perfil, setPerfil] = useState<DadosPerfilCadastro>(() =>
    criarPerfilInicial(usuario?.user_metadata?.full_name || usuario?.user_metadata?.name || "")
  );
  const [paisTelefoneManual, setPaisTelefoneManual] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<ErrosCamposAuth>({});

  function alterarPerfil(campo: keyof DadosPerfilCadastro, valor: string | boolean) {
    setPerfil((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    if (!usuario) {
      setMensagem("Sessão não encontrada. Entre novamente.");
      return;
    }

    const perfilComAceite = aplicarAceiteGeral(perfil);
    const novosErros = validarPerfilCampos(perfilComAceite);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      return;
    }

    setCarregando(true);
    try {
      await completarPerfilSocial(usuario.id, perfilComAceite);
      await recarregarPerfil();
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form className="auth-formulario auth-formulario-cadastro" onSubmit={enviar} noValidate>
      <div className="auth-formulario-topo">
        <strong>Complete seu perfil</strong>
        <span>Esses dados são obrigatórios para liberar o uso profissional da plataforma.</span>
      </div>

      {(mensagem || Object.keys(erros).length > 0) && (
        <div className="auth-feedback erro" role="alert">
          {mensagem ?? Object.values(erros)[0]}
        </div>
      )}

      <ProfileFields valores={perfil} erros={erros} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />
      <LocationFields
        valores={perfil}
        erros={erros}
        aoAlterar={(campo, valor) => alterarPerfil(campo, valor)}
        aoPaisEnderecoAlterado={(countryCode) => {
          if (!paisTelefoneManual) {
            alterarPerfil("whatsappCountryCode", countryCode);
          }
        }}
      />
      <WhatsAppField
        valor={perfil.whatsapp}
        countryCode={perfil.whatsappCountryCode || perfil.countryCode || codigoPaisPadrao}
        erro={erros.whatsapp}
        aoAlterar={(valorE164) => alterarPerfil("whatsapp", valorE164)}
        aoAlterarPais={(countryCode, manual) => {
          setPaisTelefoneManual(manual);
          alterarPerfil("whatsappCountryCode", countryCode);
        }}
      />
      <ConsentBox erro={erros.consentimentos} />

      <button type="submit" disabled={carregando}>
        {carregando ? "Salvando..." : "Liberar acesso e aceitar os Termos de Uso"}
      </button>
    </form>
  );
}
