import { CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface Props {
  texto: string;
  id?: string;
}

export function InfoTooltip({ texto, id }: Props) {
  const idGerado = useId();
  const tooltipId = id ?? `info-tooltip-${idGerado}`;
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({ x: 0, y: 0, lado: "cima" as "cima" | "baixo" });

  const atualizarPosicao = useCallback(() => {
    const botao = botaoRef.current;
    if (!botao) {
      return;
    }

    const margem = 12;
    const retangulo = botao.getBoundingClientRect();
    const x = Math.min(Math.max(retangulo.left + retangulo.width / 2, margem), window.innerWidth - margem);
    const mostrarAbaixo = retangulo.top < 84;
    const y = mostrarAbaixo ? retangulo.bottom + 10 : retangulo.top - 10;

    setPosicao({ x, y, lado: mostrarAbaixo ? "baixo" : "cima" });
  }, []);

  const abrir = useCallback(() => {
    atualizarPosicao();
    setAberto(true);
  }, [atualizarPosicao]);

  const alternar = useCallback(() => {
    if (aberto) {
      setAberto(false);
      return;
    }

    abrir();
  }, [aberto, abrir]);

  useLayoutEffect(() => {
    if (aberto) {
      atualizarPosicao();
    }
  }, [aberto, atualizarPosicao]);

  useEffect(() => {
    if (!aberto) {
      return;
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAberto(false);
      }
    }

    window.addEventListener("scroll", atualizarPosicao, true);
    window.addEventListener("resize", atualizarPosicao);
    window.addEventListener("keydown", fecharComEscape);

    return () => {
      window.removeEventListener("scroll", atualizarPosicao, true);
      window.removeEventListener("resize", atualizarPosicao);
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto, atualizarPosicao]);

  const estiloTooltip = {
    "--tooltip-x": `${posicao.x}px`,
    "--tooltip-y": `${posicao.y}px`
  } as CSSProperties;

  return (
    <span className="info-tooltip">
      <button
        ref={botaoRef}
        type="button"
        aria-label={texto}
        aria-describedby={aberto ? tooltipId : undefined}
        onBlur={() => setAberto(false)}
        onClick={alternar}
        onFocus={abrir}
        onMouseEnter={abrir}
        onMouseLeave={() => setAberto(false)}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {aberto &&
        createPortal(
          <span
            id={tooltipId}
            className="info-tooltip-conteudo"
            data-posicao={posicao.lado}
            role="tooltip"
            style={estiloTooltip}
          >
            {texto}
          </span>,
          document.body
        )}
    </span>
  );
}
