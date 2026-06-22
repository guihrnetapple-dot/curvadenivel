import type { DadosPerfilCadastro } from "../../tipos/autenticacao";

interface Props {
  valores: DadosPerfilCadastro;
  aoAlterar: (campo: keyof DadosPerfilCadastro, valor: string) => void;
}

export function ProfileFields({ valores, aoAlterar }: Props) {
  return (
    <div className="auth-grade-campos">
      <label>
        Nome completo
        <input value={valores.full_name} onChange={(e) => aoAlterar("full_name", e.target.value)} required />
      </label>
      <label>
        Profissão
        <input value={valores.profession} onChange={(e) => aoAlterar("profession", e.target.value)} required />
      </label>
      <label>
        Área de atuação
        <input value={valores.work_area} onChange={(e) => aoAlterar("work_area", e.target.value)} required />
      </label>
      <label>
        Nome da empresa
        <input value={valores.company_name} onChange={(e) => aoAlterar("company_name", e.target.value)} required />
      </label>
      <label>
        WhatsApp
        <input
          value={valores.whatsapp}
          onChange={(e) => aoAlterar("whatsapp", e.target.value)}
          placeholder="+55 38 99999-9999"
          inputMode="tel"
          required
        />
      </label>
      <label>
        Cidade
        <input value={valores.city} onChange={(e) => aoAlterar("city", e.target.value)} required />
      </label>
      <label>
        Estado
        <input value={valores.state} onChange={(e) => aoAlterar("state", e.target.value)} required />
      </label>
      <label>
        País
        <input value={valores.country} onChange={(e) => aoAlterar("country", e.target.value)} required />
      </label>
    </div>
  );
}
