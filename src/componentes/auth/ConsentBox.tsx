import type { DadosPerfilCadastro } from "../../tipos/autenticacao";

interface Props {
  valores: DadosPerfilCadastro;
  aoAlterar: (campo: keyof DadosPerfilCadastro, valor: boolean) => void;
  erro?: string;
}

const todosConsentimentosAceitos = (valores: DadosPerfilCadastro) =>
  valores.aceitaTermos && valores.aceitaPrivacidadeLgpd && valores.aceitaCookies && valores.aceitaComunicacoes;

export function ConsentBox({ valores, aoAlterar, erro }: Props) {
  const consentimentosCompletos = todosConsentimentosAceitos(valores);

  return (
    <div
      className="auth-consentimentos"
      aria-invalid={Boolean(erro)}
      aria-describedby={erro ? "consentimentos-erro" : undefined}
    >
      <div className="auth-consentimentos-topo">
        <strong>Termos e consentimentos</strong>
        <span>{consentimentosCompletos ? "Todos os consentimentos foram aceitos." : "Marque todas as caixas para continuar."}</span>
      </div>

      <div className="auth-termos-legais">
        <details>
          <summary>Termos de Uso</summary>
          <p>
            A plataforma GeoCampo fornece ferramentas para consulta altimétrica, análise topográfica e apoio ao planejamento rural.
            Os resultados dependem das bases de dados disponíveis, da qualidade das coordenadas informadas e da conexão com serviços externos.
            O usuário deve conferir os dados antes de aplicar decisões técnicas, operacionais ou comerciais.
          </p>
        </details>

        <details>
          <summary>Política de Privacidade e LGPD</summary>
          <p>
            Coletamos dados de cadastro, contato, sessão e uso necessários para autenticação, segurança, suporte e funcionamento da plataforma.
            Os dados pessoais são tratados conforme a LGPD, com medidas de segurança compatíveis e uso restrito às finalidades informadas.
          </p>
        </details>

        <details>
          <summary>Cookies e comunicações</summary>
          <p>
            Cookies essenciais mantêm login, sessão, proteção contra abuso e preferências básicas. Comunicações profissionais por e-mail ou
            WhatsApp podem envolver suporte, avisos importantes, atualizações da plataforma e informações relacionadas ao uso contratado.
          </p>
        </details>
      </div>

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
        <span>Autorizo o recebimento de comunicações profissionais por e-mail e WhatsApp.</span>
      </label>

      {erro && (
        <small id="consentimentos-erro" className="auth-erro-campo">
          {erro}
        </small>
      )}
    </div>
  );
}
