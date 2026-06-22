import type { DadosPerfilCadastro } from "../../tipos/autenticacao";
import type { ErrosCamposAuth } from "../../utilitarios/validacaoAuth";

interface Props {
  valores: DadosPerfilCadastro;
  erros?: ErrosCamposAuth;
  aoAlterar: (campo: keyof DadosPerfilCadastro, valor: string) => void;
}

const campos = [
  ["full_name", "Nome completo", "Seu nome e sobrenome"],
  ["profession", "Profissão", "Ex.: Engenheiro agrônomo"],
  ["work_area", "Área de atuação", "Ex.: Topografia rural"],
  ["company_name", "Nome da empresa", "Empresa, escritório ou propriedade"]
] as const;

export function ProfileFields({ valores, erros, aoAlterar }: Props) {
  return (
    <div className="auth-grade-campos">
      {campos.map(([campo, rotulo, placeholder]) => {
        const erro = erros?.[campo];
        const erroId = `${campo}-erro`;
        return (
          <label key={campo}>
            {rotulo}
            <input
              id={`cadastro-${campo}`}
              value={valores[campo]}
              onChange={(evento) => aoAlterar(campo, evento.target.value)}
              placeholder={placeholder}
              aria-invalid={Boolean(erro)}
              aria-describedby={erro ? erroId : undefined}
            />
            {erro && (
              <small id={erroId} className="auth-erro-campo">
                {erro}
              </small>
            )}
          </label>
        );
      })}
    </div>
  );
}
