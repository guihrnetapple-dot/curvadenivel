import { Info } from "lucide-react";

interface Props {
  texto: string;
  id?: string;
}

export function InfoTooltip({ texto, id }: Props) {
  return (
    <span className="info-tooltip" id={id}>
      <button type="button" aria-label={texto}>
        <Info size={14} aria-hidden="true" />
      </button>
      <span className="info-tooltip-conteudo" role="tooltip">
        {texto}
      </span>
    </span>
  );
}
