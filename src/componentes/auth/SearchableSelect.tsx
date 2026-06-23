import Select, { type FormatOptionLabelMeta, type StylesConfig } from "react-select";

export interface OpcaoSelecao {
  value: string;
  label: string;
  descricao?: string;
  bandeiraUrl?: string;
  busca?: string;
}

interface Props {
  id: string;
  label: string;
  value: OpcaoSelecao | null;
  options: OpcaoSelecao[];
  onChange: (opcao: OpcaoSelecao | null) => void;
  placeholder?: string;
  disabled?: boolean;
  erro?: string;
  helperText?: string;
}

const estilosSelect: StylesConfig<OpcaoSelecao, false> = {
  control: (base, estado) => ({
    ...base,
    minHeight: 40,
    borderColor: estado.isFocused ? "var(--verde)" : "color-mix(in srgb, var(--borda) 88%, transparent)",
    background: "var(--superficie-secundaria)",
    borderRadius: "var(--raio-menor)",
    boxShadow: "none",
    color: "var(--texto)",
    ":hover": { borderColor: "var(--verde)" }
  }),
  input: (base) => ({ ...base, color: "var(--texto)" }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
    overflow: "hidden",
    border: "1px solid var(--borda)",
    background: "var(--superficie)"
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, estado) => ({
    ...base,
    background: estado.isSelected
      ? "color-mix(in srgb, var(--verde) 24%, var(--superficie-secundaria))"
      : estado.isFocused
        ? "color-mix(in srgb, var(--verde) 14%, var(--superficie-secundaria))"
        : "var(--superficie)",
    color: "var(--texto)",
    cursor: "pointer"
  }),
  placeholder: (base) => ({ ...base, color: "var(--texto-suave)" }),
  singleValue: (base) => ({ ...base, color: "var(--texto)" }),
  noOptionsMessage: (base) => ({ ...base, color: "var(--texto-suave)" })
};

function renderizarOpcao(opcao: OpcaoSelecao, meta: FormatOptionLabelMeta<OpcaoSelecao>) {
  return (
    <div className="auth-opcao-select">
      {opcao.bandeiraUrl && <img src={opcao.bandeiraUrl} alt="" aria-hidden="true" />}
      <span>{opcao.label}</span>
      {meta.context === "menu" && opcao.descricao && <small>{opcao.descricao}</small>}
    </div>
  );
}

export function SearchableSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  erro,
  helperText
}: Props) {
  const descricaoId = `${id}-descricao`;
  const erroId = `${id}-erro`;

  return (
    <label className="auth-campo-select" htmlFor={id}>
      <span>{label}</span>
      <Select
        inputId={id}
        classNamePrefix="auth-react-select"
        value={value}
        options={options}
        onChange={(opcao) => onChange(opcao)}
        placeholder={placeholder ?? "Selecione..."}
        isDisabled={disabled}
        isClearable
        isSearchable
        noOptionsMessage={() => "Nenhuma opção encontrada."}
        formatOptionLabel={renderizarOpcao}
        filterOption={(opcao, busca) => {
          const termo = busca.trim().toLocaleLowerCase("pt-BR");
          if (!termo) return true;
          const texto = `${opcao.label} ${opcao.data.descricao ?? ""} ${opcao.data.busca ?? ""}`.toLocaleLowerCase("pt-BR");
          return texto.includes(termo);
        }}
        styles={estilosSelect}
        menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? erroId : helperText ? descricaoId : undefined}
      />
      {helperText && !erro && <small id={descricaoId}>{helperText}</small>}
      {erro && (
        <small id={erroId} className="auth-erro-campo">
          {erro}
        </small>
      )}
    </label>
  );
}
