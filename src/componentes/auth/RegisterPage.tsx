import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cadastrarComEmailSenha } from "../../servicos/authService";
import { obterInformacaoCliente } from "../../servicos/clientInfoService";
import type { DadosCadastro, DadosPerfilCadastro } from "../../tipos/autenticacao";
import { obterNomePais, normalizarCodigoPais } from "../../utilitarios/localizacaoAuth";
import {
  normalizarEmail,
  traduzirErroAuth,
  validarConfirmacaoSenha,
  validarEmail,
  validarPerfilCampos,
  validarSenha,
  type ErrosCamposAuth
} from "../../utilitarios/validacaoAuth";
import { ConsentBox } from "./ConsentBox";
import { LocationFields } from "./LocationFields";
import { ProfileFields } from "./ProfileFields";
import { WhatsAppField } from "./WhatsAppField";
import { InfoTooltip } from "../ui/InfoTooltip";

interface Props {
  aoEntrar: () => void;
  aoConfirmacaoNecessaria: (
    email: string,
    dados?: {
      modo?: "app" | "native";
      challengeId?: string | null;
      destinationMasked?: string | null;
      envioErro?: string;
    }
  ) => void;
}

const codigoPaisPadrao = "BR";

function criarPerfilInicial(countryCode = codigoPaisPadrao): DadosPerfilCadastro {
  return {
    full_name: "",
    profession: "",
    work_area: "",
    company_name: "",
    whatsapp: "",
    city: "",
    state: "",
    country: obterNomePais(countryCode),
    countryCode,
    stateCode: "",
    whatsappCountryCode: countryCode,
    cidadeManual: false,
    estadoManual: false,
    aceitaTermos: false,
    aceitaPrivacidadeLgpd: false,
    aceitaCookies: false,
    aceitaComunicacoes: false
  };
}

function idsCamposComErro(erros: ErrosCamposAuth): string[] {
  return Object.keys(erros).map((campo) => `cadastro-${campo}`);
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

export function RegisterPage({ aoEntrar, aoConfirmacaoNecessaria }: Props) {
  const [etapa, setEtapa] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [perfil, setPerfil] = useState<DadosPerfilCadastro>(() => criarPerfilInicial());
  const [paisTelefoneManual, setPaisTelefoneManual] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<ErrosCamposAuth>({});
  const usuarioAlterouPais = useRef(false);

  useEffect(() => {
    let ativo = true;
    obterInformacaoCliente().then((info) => {
      if (!ativo || usuarioAlterouPais.current) return;
      const countryCode = normalizarCodigoPais(info.countryCode);
      setPerfil((atual) => ({
        ...atual,
        countryCode,
        country: obterNomePais(countryCode),
        whatsappCountryCode: paisTelefoneManual ? atual.whatsappCountryCode : countryCode
      }));
    });
    return () => {
      ativo = false;
    };
  }, [paisTelefoneManual]);

  function alterarPerfil(campo: keyof DadosPerfilCadastro, valor: string | boolean) {
    if (campo === "countryCode") {
      usuarioAlterouPais.current = true;
    }
    setPerfil((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function focarPrimeiroErro(novosErros: ErrosCamposAuth) {
    requestAnimationFrame(() => {
      for (const id of idsCamposComErro(novosErros)) {
        const elemento = document.getElementById(id) ?? document.querySelector(`[aria-describedby="${id}-erro"]`);
        if (elemento instanceof HTMLElement) {
          elemento.focus();
          return;
        }
      }
    });
  }

  function validarEtapaAtual(): boolean {
    let novosErros: ErrosCamposAuth = {};

    if (etapa === 1) {
      const erroEmail = validarEmail(email);
      const erroSenha = validarSenha(password);
      const erroConfirmacao = validarConfirmacaoSenha(password, confirmPassword);
      if (erroEmail) novosErros.email = erroEmail;
      if (erroSenha) novosErros.password = erroSenha;
      if (erroConfirmacao) novosErros.confirmPassword = erroConfirmacao;
    }

    if (etapa === 2) {
      const errosPerfil = validarPerfilCampos({ ...perfil, whatsapp: "+5538999999999", city: "Temporária", state: "Temporário", country: perfil.country || "Brasil" });
      novosErros = {
        full_name: errosPerfil.full_name,
        profession: errosPerfil.profession,
        work_area: errosPerfil.work_area,
        company_name: errosPerfil.company_name
      };
      Object.keys(novosErros).forEach((chave) => {
        if (!novosErros[chave as keyof ErrosCamposAuth]) delete novosErros[chave as keyof ErrosCamposAuth];
      });
    }

    if (etapa === 3) {
      novosErros = validarPerfilCampos(aplicarAceiteGeral(perfil));
    }

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      focarPrimeiroErro(novosErros);
      return false;
    }
    return true;
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    if (etapa < 3) {
      if (validarEtapaAtual()) {
        setEtapa((atual) => atual + 1);
      }
      return;
    }

    if (!validarEtapaAtual()) {
      return;
    }

    setCarregando(true);
    try {
      const dados: DadosCadastro = { ...aplicarAceiteGeral(perfil), email: normalizarEmail(email), password };
      const resultado = await cadastrarComEmailSenha(dados);
      if (resultado.status === "verificacao_app") {
        aoConfirmacaoNecessaria(resultado.email, {
          modo: "app",
          challengeId: resultado.challengeId,
          destinationMasked: resultado.destinationMasked,
          envioErro: resultado.envioErro
        });
      }
      if (resultado.status === "confirmacao_necessaria") {
        aoConfirmacaoNecessaria(resultado.email, { modo: "native" });
      }
    } catch (erro) {
      setMensagem(traduzirErroAuth(erro));
    } finally {
      setCarregando(false);
    }
  }

  const feedbackConfirmacao =
    confirmPassword.length > 0
      ? password === confirmPassword
        ? "As senhas coincidem."
        : "As senhas ainda não coincidem."
      : null;

  return (
    <form className="auth-formulario auth-formulario-cadastro" onSubmit={enviar} noValidate>
      <div className="auth-formulario-topo">
        <strong>Criar conta</strong>
        <span>Etapa {etapa} de 3</span>
      </div>

      <div className="auth-stepper" aria-label={`Etapa ${etapa} de 3`}>
        {[1, 2, 3].map((numero) => (
          <span key={numero} className={numero <= etapa ? "ativo" : ""} />
        ))}
      </div>

      {(mensagem || Object.keys(erros).length > 0) && (
        <div className="auth-feedback erro" role="alert" aria-live="polite">
          {mensagem ?? Object.values(erros)[0]}
        </div>
      )}

      {etapa === 1 && (
        <div className="auth-grade-campos auth-grade-acesso">
          <label>
            E-mail
            <input
              id="cadastro-email"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(erros.email)}
              aria-describedby={erros.email ? "cadastro-email-erro" : undefined}
            />
            {erros.email && <small id="cadastro-email-erro" className="auth-erro-campo">{erros.email}</small>}
          </label>

          <label>
            <span className="rotulo-campo-formulario">
              <span>Senha</span>
              {!erros.password && <InfoTooltip texto="Mínimo de oito caracteres." />}
            </span>
            <div className="auth-campo-senha">
              <input
                id="cadastro-password"
                type={mostrarSenha ? "text" : "password"}
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                autoComplete="new-password"
                aria-invalid={Boolean(erros.password)}
                aria-describedby={erros.password ? "cadastro-password-erro" : undefined}
              />
              <button type="button" onClick={() => setMostrarSenha((atual) => !atual)} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
                {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {erros.password && <small id="cadastro-password-erro" className="auth-erro-campo">{erros.password}</small>}
          </label>

          <label>
            <span className="rotulo-campo-formulario">
              <span>Confirmar senha</span>
              {feedbackConfirmacao && !erros.confirmPassword && (
                <InfoTooltip texto={feedbackConfirmacao} />
              )}
            </span>
            <div className="auth-campo-senha">
              <input
                id="cadastro-confirmPassword"
                type={mostrarConfirmacao ? "text" : "password"}
                value={confirmPassword}
                onChange={(evento) => setConfirmPassword(evento.target.value)}
                autoComplete="new-password"
                aria-invalid={Boolean(erros.confirmPassword)}
                aria-describedby={erros.confirmPassword ? "cadastro-confirmPassword-erro" : undefined}
              />
              <button type="button" onClick={() => setMostrarConfirmacao((atual) => !atual)} aria-label={mostrarConfirmacao ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}>
                {mostrarConfirmacao ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {erros.confirmPassword && <small id="cadastro-confirmPassword-erro" className="auth-erro-campo">{erros.confirmPassword}</small>}
          </label>
        </div>
      )}

      {etapa === 2 && <ProfileFields valores={perfil} erros={erros} aoAlterar={(campo, valor) => alterarPerfil(campo, valor)} />}

      {etapa === 3 && (
        <>
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
        </>
      )}

      <div className="auth-acoes-fluxo">
        {etapa > 1 && (
          <button className="auth-botao-secundario" type="button" onClick={() => setEtapa((atual) => atual - 1)} disabled={carregando}>
            Voltar
          </button>
        )}
        <button type="submit" disabled={carregando}>
          {carregando ? "Criando conta..." : etapa === 3 ? "Criar conta e aceitar os Termos de Uso" : "Continuar"}
        </button>
      </div>

      <button className="auth-botao-secundario" type="button" onClick={aoEntrar} disabled={carregando}>
        Já tenho conta
      </button>
    </form>
  );
}
