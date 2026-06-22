import type { DadosPerfilCadastro } from "../../tipos/autenticacao";

interface Props {
  valores: DadosPerfilCadastro;
  aoAlterar: (campo: keyof DadosPerfilCadastro, valor: boolean) => void;
}

export function ConsentBox({ valores, aoAlterar }: Props) {
  return (
    <div className="auth-consentimentos">
      <label>
        <input
          type="checkbox"
          checked={valores.aceitaTermos}
          onChange={(evento) => aoAlterar("aceitaTermos", evento.target.checked)}
        />
        <span>Li e aceito os Termos de Uso.</span>
      </label>

      <label>
        <input
          type="checkbox"
          checked={valores.aceitaPrivacidadeLgpd}
          onChange={(evento) => aoAlterar("aceitaPrivacidadeLgpd", evento.target.checked)}
        />
        <span>Li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais conforme a LGPD.</span>
      </label>

      <label>
        <input
          type="checkbox"
          checked={valores.aceitaCookies}
          onChange={(evento) => aoAlterar("aceitaCookies", evento.target.checked)}
        />
        <span>Entendo que o sistema utiliza cookies essenciais para login, segurança, sessão e funcionamento da plataforma.</span>
      </label>

      <label className="auth-consentimento-destaque">
        <input
          type="checkbox"
          checked={valores.aceitaComunicacoes}
          onChange={(evento) => aoAlterar("aceitaComunicacoes", evento.target.checked)}
        />
        <span>
          Entendo que o sistema é gratuito e autorizo o recebimento de comunicações profissionais, informativas,
          promocionais e comerciais por e-mail e WhatsApp como condição para uso da plataforma.
        </span>
      </label>
    </div>
  );
}
